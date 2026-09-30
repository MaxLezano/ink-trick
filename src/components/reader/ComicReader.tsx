/**
 * InkTrick - Comic reader (CBR / CBZ)
 * Layouts over the same page list:
 *  - paged horizontal (LTR or RTL manga), one or two pages (spread) per screen
 *  - paged vertical, one screen per page
 *  - continuous vertical strip (webtoon / manhwa), exact heights from the real image sizes
 * Every layout uses exact getItemLayout offsets, so restoring a page lands precisely on it.
 * Taps only turn pages (edges); the controls open from the reader's top hot zone.
 */
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BookSettings, PageInfo, TrimBox } from '../../utils/types';
import ZoomableView from './ZoomableView';
import { turnSideAt } from './tapZones';

export interface ComicReaderHandle {
  goToPage: (index: number, animated?: boolean) => void;
  turnPage: (delta: number) => void;
}

interface Props {
  pages: PageInfo[];
  initialIndex: number;
  settings: BookSettings;
  width: number;
  height: number;
  /** Auto crop boxes (one per page) or null when cropping is off / not computed yet. */
  trims: TrimBox[] | null;
  /** Color around the pages (white while colors are inverted, so it shows black). */
  background: string;
  onPageChange: (index: number) => void;
}

const FALLBACK_RATIO = 1.42;
const SPREAD_GAP = 2;

const FULL_BOX: TrimBox = { l: 0, t: 0, r: 1, b: 1 };

/** Visible (possibly cropped) aspect ratio width / height of a page. */
function aspectOf(page: PageInfo, trim?: TrimBox): number {
  const box = trim ?? FULL_BOX;
  if (!(page.width > 0 && page.height > 0)) return 1 / FALLBACK_RATIO;
  return (page.width * (box.r - box.l)) / (page.height * (box.b - box.t));
}

/** Size of content with aspect `aspect` (w/h) inside a width x height box for the fit mode. */
function fitBox(aspect: number, width: number, height: number, fitMode: number) {
  const byWidth = { w: width, h: width / aspect };
  const byHeight = { w: height * aspect, h: height };
  if (fitMode === 0) return byWidth;
  if (fitMode === 1) return byHeight;
  return aspect < width / height ? byHeight : byWidth;
}

/** One page image, cropped to `trim` and stretched into a w x h box. */
const PageImage = memo(function PageImage({ page, trim, w, h, priority, fullResolution }: {
  page: PageInfo;
  trim?: TrimBox;
  w: number;
  h: number;
  priority: 'high' | 'normal';
  /** Decode the original pixels instead of the screen size (used while zoomed). */
  fullResolution: boolean;
}) {
  const box = trim ?? FULL_BOX;
  const fullW = w / (box.r - box.l);
  const fullH = h / (box.b - box.t);
  return (
    <View style={{ width: w, height: h, overflow: 'hidden' }}>
      <Image cachePolicy="memory"
        source={{ uri: page.uri }}
        style={{ position: 'absolute', width: fullW, height: fullH, left: -box.l * fullW, top: -box.t * fullH }}
        contentFit="fill"
        transition={0}
        recyclingKey={page.uri}
        priority={priority}
        allowDownscaling={!fullResolution}
      />
    </View>
  );
});

const ComicReader = forwardRef<ComicReaderHandle, Props>(function ComicReader(
  { pages, initialIndex, settings, width, height, trims, background, onPageChange },
  ref,
) {
  const listRef = useRef<FlatList<number[]>>(null);
  const isWebtoon = !settings.isHorizontal && !settings.usePaging;
  const isRTL = settings.isHorizontal && settings.isRTL;
  const total = pages.length;
  const [zoomed, setZoomed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const activeIndexRef = useRef(initialIndex);
  const lastOffsetRef = useRef(0);
  // Display slot of an animated page turn in flight: intermediate scroll events are ignored until
  // it lands, otherwise the first event (still at the old page) makes the indicator jump back.
  const pendingDisplayRef = useRef<number | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spreads =
    settings.isHorizontal &&
    settings.usePaging &&
    (settings.doublePage === 'on' || (settings.doublePage !== 'off' && width > height));
  // Cropping only applies to paged layouts; a webtoon strip must keep its panels touching.
  const trimOf = useCallback((i: number) => (!isWebtoon && trims ? trims[i] : undefined), [isWebtoon, trims]);

  // Slots = what one screen shows, in logical order. Spreads keep the cover and wide pages alone.
  const slots = useMemo(() => {
    const out: number[][] = [];
    if (!spreads) {
      for (let i = 0; i < total; i++) out.push([i]);
      return out;
    }
    const isWide = (i: number) => aspectOf(pages[i]) > 1;
    let i = 0;
    while (i < total) {
      if (i === 0 || isWide(i) || i + 1 >= total || isWide(i + 1)) {
        out.push([i]);
        i += 1;
      } else {
        out.push([i, i + 1]);
        i += 2;
      }
    }
    return out;
  }, [pages, spreads, total]);

  const slotOfPage = useMemo(() => {
    const map = new Array<number>(total);
    slots.forEach((slot, s) => slot.forEach(p => (map[p] = s)));
    return map;
  }, [slots, total]);

  // RTL shows slots reversed so swiping right advances, like a printed manga.
  const data = useMemo(() => (isRTL ? [...slots].reverse() : slots), [slots, isRTL]);
  const slotCount = slots.length;
  const toDisplay = useCallback((slot: number) => (isRTL ? slotCount - 1 - slot : slot), [isRTL, slotCount]);

  // Webtoon: cumulative offsets of each page scaled to the screen width.
  const offsets = useMemo(() => {
    if (!isWebtoon) return [] as number[];
    const out: number[] = new Array(total + 1);
    out[0] = 0;
    for (let i = 0; i < total; i++) out[i + 1] = out[i] + Math.round(width / aspectOf(pages[i]));
    return out;
  }, [isWebtoon, pages, total, width]);

  const itemSize = settings.isHorizontal ? width : height;

  const getItemLayout = useCallback(
    (_: unknown, index: number) =>
      isWebtoon
        ? { length: offsets[index + 1] - offsets[index], offset: offsets[index], index }
        : { length: itemSize, offset: itemSize * index, index },
    [isWebtoon, itemSize, offsets],
  );

  const setActive = useCallback(
    (logical: number) => {
      const clamped = Math.max(0, Math.min(total - 1, logical));
      if (clamped === activeIndexRef.current) return;
      activeIndexRef.current = clamped;
      setActiveIndex(clamped);
      onPageChange(clamped);
    },
    [onPageChange, total],
  );

  /** Page reported for a slot: its first page, or the last page when the slot ends the book. */
  const pageOfSlot = useCallback(
    (slot: number) => {
      const pagesInSlot = slots[slot] ?? [0];
      return pagesInSlot.includes(total - 1) ? total - 1 : pagesInSlot[0];
    },
    [slots, total],
  );

  const offsetForDisplay = useCallback(
    (display: number) => (isWebtoon ? offsets[display] ?? 0 : display * itemSize),
    [isWebtoon, itemSize, offsets],
  );

  const displayOfPage = useCallback(
    (logical: number) => (isWebtoon ? logical : toDisplay(slotOfPage[logical] ?? 0)),
    [isWebtoon, slotOfPage, toDisplay],
  );

  const goToPage = useCallback(
    (logical: number, animated = false) => {
      const clamped = Math.max(0, Math.min(total - 1, logical));
      const display = displayOfPage(clamped);
      if (animated && !isWebtoon) {
        pendingDisplayRef.current = display;
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = setTimeout(() => (pendingDisplayRef.current = null), 800);
      }
      listRef.current?.scrollToOffset({ offset: offsetForDisplay(display), animated });
      setZoomed(false);
      setActive(isWebtoon ? clamped : pageOfSlot(slotOfPage[clamped] ?? 0));
    },
    [displayOfPage, isWebtoon, offsetForDisplay, pageOfSlot, setActive, slotOfPage, total],
  );

  const turnPage = useCallback(
    (delta: number) => {
      if (isWebtoon) {
        lastOffsetRef.current = Math.max(0, lastOffsetRef.current + delta * height * 0.8);
        listRef.current?.scrollToOffset({ offset: lastOffsetRef.current, animated: true });
        return;
      }
      const slot = Math.max(0, Math.min(slotCount - 1, (slotOfPage[activeIndexRef.current] ?? 0) + delta));
      goToPage(slots[slot][0], true);
    },
    [goToPage, height, isWebtoon, slotCount, slotOfPage, slots],
  );

  useImperativeHandle(ref, () => ({ goToPage, turnPage }), [goToPage, turnPage]);

  // Keep the current page in place when the screen rotates or the layout changes.
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    const offset = offsetForDisplay(displayOfPage(activeIndexRef.current));
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset, animated: false }));
  }, [width, height, offsetForDisplay, displayOfPage]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const pos = settings.isHorizontal ? contentOffset.x : contentOffset.y;
      lastOffsetRef.current = pos;
      if (isWebtoon) {
        // At the very end the last page counts as read even if it is short.
        if (pos + layoutMeasurement.height >= contentSize.height - 4) {
          setActive(total - 1);
          return;
        }
        // Page occupying the upper third of the screen is the one being read.
        const probe = pos + height * 0.33;
        let lo = 0;
        let hi = total - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (offsets[mid] <= probe) lo = mid;
          else hi = mid - 1;
        }
        setActive(lo);
        return;
      }
      const exact = pos / itemSize;
      const display = Math.max(0, Math.min(slotCount - 1, Math.round(exact)));
      if (pendingDisplayRef.current !== null) {
        if (display !== pendingDisplayRef.current || Math.abs(exact - display) > 0.02) return;
        pendingDisplayRef.current = null;
      }
      // Paged mode: only a settled position counts (no flicker while a page is half dragged).
      if (settings.usePaging && Math.abs(exact - display) > 0.02) return;
      setActive(pageOfSlot(isRTL ? slotCount - 1 - display : display));
    },
    [height, isRTL, isWebtoon, itemSize, offsets, pageOfSlot, setActive, settings.isHorizontal, settings.usePaging, slotCount, total],
  );

  const handleTap = useCallback(
    (x: number, y: number) => {
      if (!settings.tapToTurn || zoomed) return;
      const side = turnSideAt(x, y, width, height);
      if (!side) return;
      // In RTL the left edge moves forward, as in a printed manga.
      const forward = isRTL ? side === 'left' : side === 'right';
      turnPage(forward ? 1 : -1);
    },
    [height, isRTL, settings.tapToTurn, turnPage, width, zoomed],
  );

  const renderSlot = useCallback(
    ({ item: slot }: { item: number[] }) => {
      // Reading order inside a spread: RTL puts the first page on the right.
      const ordered = isRTL ? [...slot].reverse() : slot;
      const aspects = ordered.map(i => aspectOf(pages[i], trimOf(i)));
      const gap = ordered.length > 1 ? SPREAD_GAP : 0;
      const totalAspect = aspects.reduce((a, b) => a + b, 0);
      const box = fitBox(totalAspect, width - gap, height, settings.fitMode);
      const isActive = slot.includes(activeIndex);
      const near = slot.some(i => Math.abs(i - activeIndex) <= 2);
      return (
        <ZoomableView
          width={width}
          height={height}
          contentWidth={box.w + gap}
          contentHeight={box.h}
          doubleTapZoom={settings.enableDoubleTapZoom}
          active={isActive}
          onTap={handleTap}
          onZoomChange={setZoomed}
        >
          <View style={styles.spreadRow}>
            {ordered.map((pageIndex, k) => (
              <View key={pageIndex} style={k > 0 ? { marginLeft: gap } : undefined}>
                <PageImage
                  page={pages[pageIndex]}
                  trim={trimOf(pageIndex)}
                  w={box.h * aspects[k]}
                  h={box.h}
                  priority={near ? 'high' : 'normal'}
                  fullResolution={zoomed && isActive}
                />
              </View>
            ))}
          </View>
        </ZoomableView>
      );
    },
    [activeIndex, handleTap, height, isRTL, pages, settings.enableDoubleTapZoom, settings.fitMode, trimOf, width, zoomed],
  );

  const renderStrip = useCallback(
    ({ index }: { index: number }) => (
      <Image cachePolicy="memory"
        source={{ uri: pages[index].uri }}
        style={{ width, height: offsets[index + 1] - offsets[index] }}
        contentFit="fill"
        transition={0}
        recyclingKey={pages[index].uri}
      />
    ),
    [offsets, pages, width],
  );

  const list = (
    <FlatList
      ref={listRef}
      data={data}
      keyExtractor={slot => slot.join('-')}
      renderItem={isWebtoon ? renderStrip : renderSlot}
      horizontal={settings.isHorizontal}
      pagingEnabled={!isWebtoon && settings.usePaging}
      scrollEnabled={!zoomed || isWebtoon}
      getItemLayout={getItemLayout}
      initialScrollIndex={displayOfPage(Math.max(0, Math.min(total - 1, initialIndex)))}
      onScroll={onScroll}
      onScrollBeginDrag={() => (pendingDisplayRef.current = null)}
      scrollEventThrottle={32}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={isWebtoon ? 7 : 5}
      removeClippedSubviews
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      decelerationRate={!isWebtoon && settings.usePaging ? 'fast' : 'normal'}
      style={[styles.list, { backgroundColor: background }]}
      extraData={[activeIndex, trims, zoomed]}
    />
  );

  if (!isWebtoon) {
    return list;
  }

  // Webtoon: the whole strip zooms; vertical scrolling stays native, zoomed content pans sideways.
  return (
    <ZoomableView
      width={width}
      height={height}
      contentWidth={width}
      contentHeight={height}
      panXOnly
      doubleTapZoom={settings.enableDoubleTapZoom}
      onTap={handleTap}
      onZoomChange={setZoomed}
    >
      <View style={{ width, height }}>{list}</View>
    </ZoomableView>
  );
});

export default ComicReader;

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#000',
  },
  spreadRow: {
    flex: 1,
    flexDirection: 'row',
  },
});
