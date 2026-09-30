/**
 * InkTrick - Reader Screen
 * Full-screen reader for PDF (vector rendering via Pdfium), CBR/CBZ (image reader with zoom) and
 * EPUB (paginated WebView). The controls open only from the top edge (turning pages never pops
 * them up). Progress, bookmarks and reading statistics are saved continuously. Volume keys turn
 * pages, and the next volume is prepared in the background near the end of the current one.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  NativeEventEmitter,
  NativeModules,
  PixelRatio,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Gesture-handler button: takes part in the same gesture system as the page zoom/tap gestures,
// so a tap on the card is never swallowed by the page underneath.
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { Image } from 'expo-image';
import { Bookmark, BookFile, BookSettings, PageInfo, ReadingProgress, RootStackParamList, TocItem, TrimBox } from '../utils/types';
import { COLORS, EPUB_POSITIONS } from '../utils/constants';
import BambooLoader from '../components/reader/BambooLoader';
import { useLibraryStore } from '../store/libraryStore';
import * as StorageService from '../services/storageService';
import * as BookCache from '../services/bookCacheService';
import { ArrowIcon, BackIcon, BookmarkIcon, CloseIcon, GearIcon, IndexIcon } from '../components/Icons';
import { MENU_BAND, turnSideAt } from '../components/reader/tapZones';
import { seriesKeyOf, sortSeries } from '../utils/format';
import ComicReader, { ComicReaderHandle } from '../components/reader/ComicReader';
import PageScrubber from '../components/reader/PageScrubber';
import ReaderSettingsSheet from '../components/reader/ReaderSettingsSheet';
import ReaderIndexSheet from '../components/reader/ReaderIndexSheet';
import EpubReader, { chapterPositions, EpubLocation, EpubReaderHandle } from '../components/reader/EpubReader';

const { ReaderKeysModule } = NativeModules;
const keyEmitter = ReaderKeysModule ? new NativeEventEmitter(ReaderKeysModule) : null;

// Readers asking for volume-key page turns. "Siguiente" mounts the new reader before the old one
// unmounts, so the old one must not switch the keys off under the new one.
let volumeKeyClaims = 0;
function claimVolumeKeys(): () => void {
  volumeKeyClaims++;
  ReaderKeysModule.setVolumeKeysEnabled(true);
  return () => {
    volumeKeyClaims--;
    if (volumeKeyClaims === 0) ReaderKeysModule.setVolumeKeysEnabled(false);
  };
}

let PdfComponent: any = null;
try {
  const pdfModule = require('react-native-pdf');
  PdfComponent = pdfModule.default || pdfModule;
} catch {
  PdfComponent = null;
}

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Reader'>;
  route: RouteProp<RootStackParamList, 'Reader'>;
};

type LoadState =
  | { status: 'loading'; percentage: number; current: number; label: string }
  | { status: 'ready' }
  | { status: 'error'; message: string };

const KEEP_AWAKE_TAG = 'inktrick-reader';

// Gaps longer than this between two page turns are not counted as reading time.
const MAX_IDLE_MS = 5 * 60 * 1000;

/** PDF outline (Pdfium bookmarks tree) as a flat list with depths. */
function flattenOutline(items: any[] | undefined, depth = 0, out: TocItem[] = []): TocItem[] {
  for (const item of items ?? []) {
    const title = String(item?.title ?? '').trim();
    if (title) out.push({ title, depth, page: Math.max(0, Number(item.pageIdx) || 0) });
    flattenOutline(item?.children, depth + 1, out);
  }
  return out;
}

/** Chapters of a comic packed as one folder per chapter (only when there are several). */
function comicChapters(pages: PageInfo[]): TocItem[] {
  const out: TocItem[] = [];
  pages.forEach((page, i) => {
    const chapter = page.chapter ?? '';
    if (i === 0 || chapter !== (pages[i - 1].chapter ?? '')) {
      out.push({ title: chapter.split('/').pop() || 'Inicio', depth: 0, page: i });
    }
  });
  return out.length > 1 ? out : [];
}

function buildProgress(bookId: string, page: number, total: number): ReadingProgress {
  const pct = total > 1 ? (page / (total - 1)) * 100 : 100;
  return {
    bookId,
    currentPage: page,
    totalPages: total,
    percentage: Math.min(100, Math.max(0, pct)),
    lastReadAt: Date.now(),
  };
}

export default function ReaderScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const book = useLibraryStore(state => state.books.find(b => b.id === bookId));
  const setBookPageCount = useLibraryStore(state => state.setBookPageCount);
  const allBooks = useLibraryStore(state => state.books);
  const isComic = book ? BookCache.isComic(book) : false;
  const isEpub = book ? BookCache.isEpub(book) : false;

  // Next volume of the same series (collection or folder), in its reading order.
  const nextBook = useMemo<BookFile | undefined>(() => {
    if (!book) return undefined;
    const key = seriesKeyOf(book);
    const series = sortSeries(allBooks.filter(b => seriesKeyOf(b) === key));
    const index = series.findIndex(b => b.id === book.id);
    return index >= 0 ? series[index + 1] : undefined;
  }, [allBooks, book]);

  const [load, setLoad] = useState<LoadState>({ status: 'loading', percentage: 0, current: 0, label: 'Abriendo...' });
  const [settings, setSettings] = useState<BookSettings | null>(null);
  const [comicPages, setComicPages] = useState<PageInfo[]>([]);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [initialPage, setInitialPage] = useState(0); // logical, 0-based
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Bumped to remount the viewer at a new position (reset / settings changes).
  const [viewerKey, setViewerKey] = useState(0);
  const [trims, setTrims] = useState<TrimBox[] | null>(null);
  const [epubBook, setEpubBook] = useState<BookCache.EpubBook | null>(null);
  const [epubLocation, setEpubLocation] = useState<EpubLocation | null>(null);
  const [pdfOutline, setPdfOutline] = useState<TocItem[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showIndex, setShowIndex] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const comicRef = useRef<ComicReaderHandle>(null);
  const epubRef = useRef<EpubReaderHandle>(null);
  const pdfRef = useRef<any>(null);
  const currentPageRef = useRef(0);
  const totalPagesRef = useRef(0);

  // ─── Reading statistics ──────────────────────────────────────────────────
  const lastActivityRef = useRef(Date.now());
  const pendingSecondsRef = useRef(0);
  const pendingPagesRef = useRef(0);

  const trackActivity = useCallback(() => {
    const now = Date.now();
    const gap = now - lastActivityRef.current;
    if (gap > 0 && gap < MAX_IDLE_MS) pendingSecondsRef.current += gap / 1000;
    lastActivityRef.current = now;
  }, []);

  const flushStats = useCallback(() => {
    trackActivity();
    const seconds = pendingSecondsRef.current;
    const pages = pendingPagesRef.current;
    pendingSecondsRef.current = 0;
    pendingPagesRef.current = 0;
    StorageService.recordReading(bookId, seconds, pages);
  }, [bookId, trackActivity]);

  // ─── Progress persistence ────────────────────────────────────────────────
  const persistProgress = useCallback(
    (page: number, immediate = false) => {
      const total = totalPagesRef.current;
      if (total <= 0) return;
      StorageService.saveProgress(buildProgress(bookId, page, total), immediate);
    },
    [bookId],
  );

  const flushAndSync = useCallback(async () => {
    flushStats();
    const total = totalPagesRef.current;
    if (total > 0) {
      await StorageService.saveProgress(buildProgress(bookId, currentPageRef.current, total), true);
    }
    await StorageService.flushProgress();
    await useLibraryStore.getState().reloadProgress();
  }, [bookId, flushStats]);

  // Save on leave (back button, gesture, hardware back) and when the app goes to background.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      flushAndSync();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') flushAndSync();
      else lastActivityRef.current = Date.now(); // Time spent outside the app is not reading time.
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [flushAndSync, navigation]);

  // ─── Page indicator ──────────────────────────────────────────────────────
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashIndicator = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    Animated.timing(indicatorOpacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(indicatorOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start();
    }, 1400);
  }, [indicatorOpacity]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const onPageChange = useCallback(
    (page: number, turned?: boolean) => {
      trackActivity();
      // Only real page turns count as reading (1 page, or 2 in a spread); scrubber jumps do not.
      // EPUB positions are not pages: its reader says whether this was a page turn.
      const step = turned === undefined ? page - currentPageRef.current : turned ? 1 : 0;
      if (step > 0 && step <= 2) {
        pendingPagesRef.current += step;
        if (totalPagesRef.current > 0 && page >= totalPagesRef.current - 1) StorageService.markFinished(bookId);
      }
      currentPageRef.current = page;
      setCurrentPage(page);
      flashIndicator();
      persistProgress(page);
    },
    [bookId, flashIndicator, persistProgress, trackActivity],
  );

  const applyTotal = useCallback(
    (total: number) => {
      if (total <= 0) return;
      totalPagesRef.current = total;
      setTotalPages(total);
      setBookPageCount(bookId, total);
    },
    [bookId, setBookPageCount],
  );

  // ─── Load settings, progress and the book itself ─────────────────────────
  const bookRef = useRef(book);
  bookRef.current = book;
  const loadTaskRef = useRef<Promise<void> | null>(null);

  // Leaving the reader deletes the book's temporary files (after any extraction in progress ends).
  useEffect(() => {
    BookCache.retainBookFiles(bookId);
    return () => {
      Promise.resolve(loadTaskRef.current)
        .catch(() => {})
        .finally(() => BookCache.releaseBookFiles(bookId));
    };
  }, [bookId]);

  useEffect(() => {
    let alive = true;
    const current = bookRef.current;
    if (!current) {
      setLoad({ status: 'error', message: 'El libro ya no está en la biblioteca.' });
      return;
    }

    loadTaskRef.current = (async () => {
      const [loadedSettings, progress] = await Promise.all([
        StorageService.getBookSettings(bookId, seriesKeyOf(current)),
        StorageService.getProgress(bookId),
      ]);
      if (!alive) return;
      setSettings(loadedSettings);
      // A finished book reopens at the start instead of the last page.
      const restored = progress && progress.percentage < 100 ? progress.currentPage : 0;

      try {
        if (BookCache.isComic(current)) {
          const pages = await BookCache.getComicPages(current, p => {
            if (alive) setLoad({ status: 'loading', percentage: p.percentage, current: p.current, label: 'Preparando páginas' });
          });
          if (!alive) return;
          applyTotal(pages.length);
          const start = Math.min(restored, pages.length - 1);
          currentPageRef.current = start;
          setCurrentPage(start);
          setInitialPage(start);
          setComicPages(pages);
        } else if (BookCache.isEpub(current)) {
          setLoad({ status: 'loading', percentage: 0, current: 0, label: 'Preparando libro' });
          const epub = await BookCache.openEpub(current);
          if (!alive) return;
          // Positions, not pages: never stored as the book's page count.
          totalPagesRef.current = EPUB_POSITIONS;
          setTotalPages(EPUB_POSITIONS);
          const start = Math.min(restored, EPUB_POSITIONS - 1);
          currentPageRef.current = start;
          setCurrentPage(start);
          setInitialPage(start);
          setEpubBook(epub);
          if (epub.rtl) {
            // Japanese vertical books are shown horizontally, left to right: say so instead of failing silently.
            setNotice('Este libro es de formato japonés vertical. Se muestra en horizontal y puede verse distinto al original.');
          }
        } else {
          if (!PdfComponent) throw new Error('El visor de PDF no está disponible.');
          setLoad({ status: 'loading', percentage: 0, current: 0, label: 'Preparando PDF' });
          const uri = await BookCache.getLocalPdfUri(current);
          if (!alive) return;
          // The page count must be known before mounting: RTL maps logical pages from the end.
          const knownTotal = current.pageCount || progress?.totalPages || (await BookCache.getPdfPageCount(uri));
          if (!alive) return;
          if (knownTotal > 0) applyTotal(knownTotal);
          const start = knownTotal > 0 ? Math.min(restored, knownTotal - 1) : restored;
          currentPageRef.current = start;
          setCurrentPage(start);
          setInitialPage(start);
          setPdfUri(uri);
        }
        lastActivityRef.current = Date.now();
        setLoad({ status: 'ready' });
        flashIndicator();
      } catch (error: any) {
        console.error('[ReaderScreen] Error preparing book:', error);
        if (alive) setLoad({ status: 'error', message: error?.message ?? 'No se pudo abrir el archivo.' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [applyTotal, bookId, flashIndicator]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ─── Bookmarks ───────────────────────────────────────────────────────────
  useEffect(() => {
    StorageService.getBookmarks(bookId).then(setBookmarks);
  }, [bookId]);

  const isBookmarked = bookmarks.some(b => b.page === currentPage);
  const saveBookmarks = useCallback(
    (next: Bookmark[]) => {
      setBookmarks(next);
      StorageService.saveBookmarks(bookId, next);
    },
    [bookId],
  );
  const toggleBookmark = useCallback(() => {
    const page = currentPageRef.current;
    saveBookmarks(
      bookmarks.some(b => b.page === page)
        ? bookmarks.filter(b => b.page !== page)
        : [...bookmarks, { page, createdAt: Date.now() }].sort((a, b) => a.page - b.page),
    );
  }, [bookmarks, saveBookmarks]);

  // ─── Table of contents ───────────────────────────────────────────────────
  const toc = useMemo<TocItem[]>(() => {
    if (isEpub && epubBook) {
      const starts = chapterPositions(epubBook.spine);
      return epubBook.toc.map(entry => ({
        title: entry.title,
        depth: entry.depth,
        page: starts[entry.spine] ?? 0,
        spine: entry.spine,
        anchor: entry.anchor || undefined,
      }));
    }
    if (isComic) return comicChapters(comicPages);
    return pdfOutline;
  }, [comicPages, epubBook, isComic, isEpub, pdfOutline]);

  // ─── Next volume: prepared in the background during the last 10% ─────────
  const nearEnd = load.status === 'ready' && totalPages > 0 && currentPage >= Math.floor((totalPages - 1) * 0.9);
  const nextBookRef = useRef(nextBook);
  nextBookRef.current = nextBook;
  useEffect(() => {
    const next = nextBookRef.current;
    if (!nearEnd || !next) return;
    return BookCache.preloadBook(next);
  }, [nearEnd, nextBook?.id]);

  // ─── Auto crop boxes (computed natively once per comic) ──────────────────
  useEffect(() => {
    if (!isComic || !settings?.autoCrop || comicPages.length === 0) {
      setTrims(null);
      return;
    }
    let alive = true;
    BookCache.getTrimBoxes(bookId).then(boxes => {
      if (alive) setTrims(boxes);
    });
    return () => {
      alive = false;
    };
  }, [bookId, comicPages.length, isComic, settings?.autoCrop]);

  // ─── Immersive mode: hide Android's navigation bar while reading ────────
  useEffect(() => {
    if (settings?.fullscreen === false) return;
    NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => {});
    };
  }, [settings?.fullscreen]);

  // ─── Keep awake ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (settings?.keepAwake === false) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [settings?.keepAwake]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const goToPage = useCallback(
    (page: number) => {
      const total = totalPagesRef.current;
      const target = Math.max(0, Math.min(total - 1, page));
      if (isEpub) {
        // The EPUB reader reports the exact position once the page is shown.
        epubRef.current?.goToPosition(target);
        return;
      }
      if (isComic) {
        comicRef.current?.goToPage(target);
      } else {
        const rtl = settings?.isHorizontal && settings.isRTL;
        pdfRef.current?.setPage(rtl ? total - target : target + 1);
      }
      onPageChange(target);
    },
    [isComic, isEpub, onPageChange, settings],
  );

  const goToTocItem = useCallback(
    (item: TocItem) => {
      setShowIndex(false);
      if (isEpub && item.spine !== undefined) epubRef.current?.goToChapter(item.spine, item.anchor);
      else goToPage(item.page);
    },
    [goToPage, isEpub],
  );

  // ─── Volume keys ─────────────────────────────────────────────────────────
  const turnRef = useRef<(delta: number) => void>(() => {});
  turnRef.current = (delta: number) => {
    if (isEpub) epubRef.current?.turn(delta);
    else if (isComic) comicRef.current?.turnPage(delta);
    else goToPage(currentPageRef.current + delta);
  };
  useEffect(() => {
    if (load.status !== 'ready' || settings?.volumeKeys === false || !ReaderKeysModule || !keyEmitter) return;
    const release = claimVolumeKeys();
    const subscription = keyEmitter.addListener('onVolumeKey', (delta: number) => turnRef.current(delta));
    return () => {
      subscription.remove();
      release();
    };
  }, [load.status, settings?.volumeKeys]);

  const onEpubLocation = useCallback(
    (position: number, location: EpubLocation, forward: boolean) => {
      setEpubLocation(location);
      onPageChange(position, forward);
    },
    [onPageChange],
  );

  const pageLabel = useCallback(
    (page: number) =>
      isEpub ? `${Math.round((page / Math.max(1, EPUB_POSITIONS - 1)) * 100)}%` : `Página ${page + 1}`,
    [isEpub],
  );

  const updateSettings = useCallback(
    (next: BookSettings) => {
      const prev = settings;
      setSettings(next);
      StorageService.saveBookSettings(bookId, next, book ? seriesKeyOf(book) : undefined);
      const layoutChanged =
        !prev ||
        prev.isHorizontal !== next.isHorizontal ||
        prev.usePaging !== next.usePaging ||
        prev.isRTL !== next.isRTL ||
        prev.fitMode !== next.fitMode ||
        prev.doublePage !== next.doublePage;
      if (layoutChanged) {
        // Remount the viewer at the page being read.
        setInitialPage(currentPageRef.current);
        setViewerKey(k => k + 1);
      }
    },
    [book, bookId, settings],
  );

  const handleResetProgress = useCallback(() => {
    Alert.alert('Volver al inicio', '¿Quieres volver a la primera página del libro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, volver',
        onPress: () => {
          setShowSettings(false);
          setShowControls(false);
          currentPageRef.current = 0;
          setCurrentPage(0);
          setInitialPage(0);
          setViewerKey(k => k + 1);
          persistProgress(0, true);
        },
      },
    ]);
  }, [persistProgress]);

  const close = useCallback(() => navigation.goBack(), [navigation]);
  const openNextBook = useCallback(() => {
    if (!nextBook) return;
    useLibraryStore.getState().updateLastOpened(nextBook.id);
    navigation.replace('Reader', { bookId: nextBook.id });
  }, [navigation, nextBook]);

  // ─── PDF callbacks ───────────────────────────────────────────────────────
  const pdfRtl = !!(settings?.isHorizontal && settings.isRTL);
  // Depends on the totalPages state (not the ref) so it is recomputed once the count is known.
  const pdfInitialPage = useMemo(() => {
    if (pdfRtl && totalPages > 0) return totalPages - initialPage;
    return initialPage + 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPage, pdfRtl, totalPages, viewerKey]);

  const onPdfLoad = useCallback(
    (numberOfPages: number, _path: string, _size: unknown, tableContents?: any[]) => {
      applyTotal(numberOfPages);
      setPdfOutline(flattenOutline(tableContents));
    },
    [applyTotal],
  );

  const onPdfPageChanged = useCallback(
    (page: number, numberOfPages: number) => {
      const total = numberOfPages || totalPagesRef.current;
      onPageChange(pdfRtl ? total - page : page - 1);
    },
    [onPageChange, pdfRtl],
  );

  const onPdfTap = useCallback(
    (_page: number, x: number, y: number) => {
      // Only the edge strips turn pages; the controls open from the top band.
      if (!settings?.usePaging || settings.tapToTurn === false) return;
      // Coordinates arrive in physical pixels.
      const side = turnSideAt(x / PixelRatio.get(), y / PixelRatio.get(), W, H);
      if (!side) return;
      const forward = pdfRtl ? side === 'left' : side === 'right';
      goToPage(currentPageRef.current + (forward ? 1 : -1));
    },
    [H, W, goToPage, pdfRtl, settings],
  );

  // ─── Render ──────────────────────────────────────────────────────────────
  const renderViewer = () => {
    if (!settings || load.status !== 'ready') return null;
    if (isEpub && epubBook) {
      return (
        <EpubReader
          key={`epub_${viewerKey}`}
          ref={epubRef}
          spine={epubBook.spine}
          initialPosition={initialPage}
          settings={settings}
          width={W}
          height={H}
          onLocation={onEpubLocation}
        />
      );
    }
    if (isComic && comicPages.length > 0) {
      return (
        <ComicReader
          key={`comic_${viewerKey}`}
          ref={comicRef}
          pages={comicPages}
          initialIndex={initialPage}
          settings={settings}
          width={W}
          height={H}
          trims={trims}
          onPageChange={onPageChange}
        />
      );
    }
    if (!isComic && pdfUri && PdfComponent) {
      return (
        <PdfComponent
          key={`pdf_${viewerKey}`}
          ref={pdfRef}
          source={{ uri: pdfUri.replace('file://', ''), cache: true }}
          page={pdfInitialPage}
          horizontal={settings.isHorizontal}
          enablePaging={settings.usePaging}
          enableRTL={pdfRtl}
          fitPolicy={settings.fitMode}
          spacing={settings.usePaging ? 0 : 2}
          enableAntialiasing
          enableDoubleTapZoom={settings.enableDoubleTapZoom}
          minScale={1}
          maxScale={5}
          onLoadComplete={onPdfLoad}
          onPageChanged={onPdfPageChanged}
          onPageSingleTap={onPdfTap}
          onError={(error: any) => {
            console.error('[ReaderScreen] PDF error:', error);
            setLoad({ status: 'error', message: 'No se pudo renderizar el PDF (¿archivo dañado o con contraseña?).' });
          }}
          style={{ flex: 1, width: W, height: H, backgroundColor: '#000' }}
        />
      );
    }
    return null;
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={!showControls} barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.viewer}>{renderViewer()}</View>

      {load.status === 'loading' && (
        <View style={styles.loading}>
          {book?.coverUri ? (
            <Image cachePolicy="memory" source={{ uri: book.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
          ) : null}
          <View style={styles.loadingScrim} />
          {book?.coverUri ? (
            <Image cachePolicy="memory" source={{ uri: book.coverUri }} style={styles.loadingCover} contentFit="cover" />
          ) : null}
          <Text style={styles.loadingTitle} numberOfLines={2}>{book?.title}</Text>
          {/* Comics report real progress (one bamboo per share); PDF / EPUB copies loop. */}
          <BambooLoader progress={load.percentage > 0 ? load.percentage / 100 : null} />
          <Text style={styles.loadingText}>
            {load.label}
            {load.percentage > 0 ? ` · ${load.percentage}%` : load.current > 0 ? ` · ${load.current} págs.` : ''}
          </Text>
        </View>
      )}

      {load.status === 'error' && (
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>No se pudo abrir</Text>
          <Text style={styles.errorText}>{load.message}</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={close}>
            <Text style={styles.errorBtnText}>Volver a la biblioteca</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* The top band is the only way to open the controls. */}
      {load.status === 'ready' && !showControls && (
        <TouchableOpacity
          style={[styles.topHotZone, { height: Math.max(H * MENU_BAND, insets.top + 48) }]}
          onPress={() => setShowControls(true)}
          activeOpacity={1}
          accessibilityLabel="Mostrar controles"
        />
      )}

      {showControls && load.status === 'ready' && (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.iconBtn} onPress={close} accessibilityLabel="Volver">
              <BackIcon size={18} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.titleBox}>
              <Text style={styles.title} numberOfLines={1}>{book?.title}</Text>
              {book?.author || book?.folder ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {[book.author, book.folder].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowIndex(true)} accessibilityLabel={toc.length > 0 ? 'Índice y marcadores' : 'Marcadores'}>
              <IndexIcon size={19} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={toggleBookmark}
              accessibilityLabel={isBookmarked ? 'Quitar marcador' : 'Marcar esta página'}
            >
              <BookmarkIcon size={18} color={isBookmarked ? COLORS.gold : '#FFF'} filled={isBookmarked} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowSettings(true)} accessibilityLabel="Ajustes">
              <GearIcon size={20} color="#FFF" />
            </TouchableOpacity>
            {/* The close button is the only way to hide the controls again. */}
            <TouchableOpacity style={styles.iconBtn} onPress={() => setShowControls(false)} accessibilityLabel="Ocultar controles">
              <CloseIcon size={18} color="#FFF" />
            </TouchableOpacity>
          </View>

          {totalPages > 0 && (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
              <Text style={styles.pageLabel}>
                {isEpub
                  ? `${epubLocation ? `Capítulo ${epubLocation.chapter + 1} de ${epubBook?.spine.length ?? 1} · ` : ''}${pageLabel(currentPage)}`
                  : `Página ${currentPage + 1} de ${totalPages} · ${Math.round(buildProgress(bookId, currentPage, totalPages).percentage)}%`}
              </Text>
              <PageScrubber
                current={currentPage}
                total={totalPages}
                reversed={!isEpub && !!(settings?.isHorizontal && settings.isRTL)}
                marks={bookmarks.map(b => b.page)}
                labelFor={isEpub ? pageLabel : undefined}
                onCommit={goToPage}
              />
            </View>
          )}
        </>
      )}

      {/* End of the volume: offer the next one of the same series. */}
      {load.status === 'ready' && totalPages > 0 && currentPage >= totalPages - 1 && nextBook && (
        <View style={[styles.nextCard, { bottom: insets.bottom + (showControls ? 120 : 24) }]}>
          {nextBook.coverUri ? <Image cachePolicy="memory" source={{ uri: nextBook.coverUri }} style={styles.nextCover} contentFit="cover" /> : null}
          <View style={styles.nextInfo}>
            <Text style={styles.nextLabel}>Terminaste este tomo</Text>
            <Text style={styles.nextTitle} numberOfLines={2}>{nextBook.title}</Text>
          </View>
          <GHTouchableOpacity style={styles.nextBtn} onPress={openNextBook} accessibilityLabel="Abrir el siguiente tomo">
            <Text style={styles.nextBtnText}>Siguiente</Text>
            <ArrowIcon size={15} color="#0A0A0A" />
          </GHTouchableOpacity>
        </View>
      )}

      {totalPages > 0 && load.status === 'ready' && !showControls && (
        <Animated.View style={[styles.indicator, { opacity: indicatorOpacity, bottom: insets.bottom + 24 }]} pointerEvents="none">
          <Text style={styles.indicatorText}>
            {isEpub
              ? epubLocation
                ? `${epubLocation.page + 1} / ${epubLocation.pages} · ${pageLabel(currentPage)}`
                : pageLabel(currentPage)
              : `${currentPage + 1} / ${totalPages}`}
          </Text>
        </Animated.View>
      )}

      {notice && load.status === 'ready' && (
        <TouchableOpacity
          style={[styles.notice, { top: insets.top + 70 }]}
          onPress={() => setNotice(null)}
          activeOpacity={0.9}
          accessibilityLabel="Cerrar aviso"
        >
          <Text style={styles.noticeText}>{notice}</Text>
        </TouchableOpacity>
      )}

      {settings && settings.brightnessDimmer > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: settings.brightnessDimmer }]} />
      )}

      {settings && (
        <ReaderSettingsSheet
          visible={showSettings}
          settings={settings}
          isComic={isComic}
          isEpub={isEpub}
          onChange={updateSettings}
          onResetProgress={handleResetProgress}
          onClose={() => setShowSettings(false)}
        />
      )}

      <ReaderIndexSheet
        visible={showIndex}
        toc={toc}
        bookmarks={bookmarks}
        current={currentPage}
        labelFor={pageLabel}
        onSelectToc={goToTocItem}
        onSelectPage={page => {
          setShowIndex(false);
          goToPage(page);
        }}
        onRemoveBookmark={page => saveBookmarks(bookmarks.filter(b => b.page !== page))}
        onClose={() => setShowIndex(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewer: {
    flex: 1,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
    gap: 14,
  },
  loadingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  loadingCover: {
    width: 160,
    height: 230,
    borderRadius: 14,
    marginBottom: 6,
  },
  loadingTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    maxWidth: 480,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
  errorTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 420,
  },
  errorBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  errorBtnText: {
    color: '#0A0A0A',
    fontWeight: '800',
  },
  topHotZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(12,12,12,0.94)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  titleBox: {
    flex: 1,
    alignItems: 'flex-start',
  },
  title: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(12,12,12,0.94)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  pageLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  indicator: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(10,10,10,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  notice: {
    position: 'absolute',
    alignSelf: 'center',
    width: '90%',
    maxWidth: 520,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(16,16,16,0.96)',
  },
  noticeText: {
    color: '#FFF',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  nextCard: {
    position: 'absolute',
    alignSelf: 'center',
    width: '92%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(16,16,16,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 12,
  },
  nextCover: {
    width: 48,
    height: 68,
    borderRadius: 8,
  },
  nextInfo: {
    flex: 1,
  },
  nextLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  nextTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  nextBtnText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '800',
  },
  indicatorText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
