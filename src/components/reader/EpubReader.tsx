/**
 * InkTrick - EPUB reader
 * Each chapter (spine item) of the unpacked EPUB is loaded in a WebView and split into screen
 * pages with CSS columns; an injected script turns pages (swipes, edge taps, volume keys) and
 * reports the page back. Progress is a position in [0, EPUB_POSITIONS - 1] proportional to the
 * text offset (chapter file sizes), so it survives font size changes.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { BookSettings, TextFont, TextTheme } from '../../utils/types';
import { EPUB_POSITIONS } from '../../utils/constants';
import { EpubChapter } from '../../services/bookCacheService';

export interface EpubReaderHandle {
  turn: (delta: number) => void;
  goToPosition: (position: number) => void;
  goToChapter: (spine: number, anchor?: string) => void;
}

export interface EpubLocation {
  chapter: number;
  page: number;
  pages: number;
}

interface Props {
  spine: EpubChapter[];
  initialPosition: number;
  settings: BookSettings;
  width: number;
  height: number;
  onLocation: (position: number, location: EpubLocation, forward: boolean) => void;
}

type Target = { kind: 'fraction'; value: number } | { kind: 'anchor'; id: string } | { kind: 'end' };

interface Nav {
  chapter: number;
  target: Target;
  forward: boolean; // The first page shown counts as a page turn (arrived from the previous chapter)
}

export const TEXT_THEMES: Record<TextTheme, { bg: string; fg: string; link: string }> = {
  dark: { bg: '#101010', fg: '#DAD6CE', link: '#B89BDD' },
  sepia: { bg: '#F3EAD6', fg: '#3A2F22', link: '#6E3F8F' },
  light: { bg: '#FAFAF7', fg: '#1B1B1B', link: '#5B2C83' },
};

const FONTS: Record<TextFont, string> = {
  book: '',
  serif: 'Georgia, "Noto Serif", "Droid Serif", serif',
  sans: 'Roboto, "Noto Sans", sans-serif',
};

function buildCss(settings: BookSettings, width: number, height: number): string {
  const theme = TEXT_THEMES[settings.textTheme ?? 'dark'];
  const padH = Math.round(Math.max(24, Math.min(80, width * 0.07)));
  const padV = Math.round(Math.max(28, height * 0.045));
  const font = FONTS[settings.textFont ?? 'book'];
  const lh = settings.lineHeight ?? 1.6;
  return `
html{margin:0!important;padding:0!important;height:100%!important;overflow:hidden!important;background:${theme.bg}!important}
body{margin:0!important;padding:${padV}px ${padH}px!important;box-sizing:border-box!important;height:100vh!important;
width:100vw!important;max-width:none!important;-webkit-column-width:${width - 2 * padH}px!important;column-width:${width - 2 * padH}px!important;
-webkit-column-gap:${2 * padH}px!important;column-gap:${2 * padH}px!important;column-fill:auto!important;
background:${theme.bg}!important;color:${theme.fg}!important;line-height:${lh}!important;overflow-wrap:break-word;hyphens:auto}
body *{color:inherit!important;background-color:transparent!important;border-color:rgba(128,128,128,.35)!important;max-width:100%}
p,li,blockquote,dd{line-height:${lh}!important}
${font ? `body,body *:not(code):not(pre):not(kbd){font-family:${font}!important}` : ''}
a,a *{color:${theme.link}!important}
img,svg,video{display:block;margin:0 auto!important;text-indent:0;max-width:100%!important;max-height:${height - 2 * padV}px!important;height:auto;object-fit:contain;break-inside:avoid;-webkit-column-break-inside:avoid}
h1,h2,h3,h4{break-after:avoid;-webkit-column-break-after:avoid}`;
}

// Runs on every chapter load. Defines window.__ink once (pagination, gestures) and applies CONFIG.
const ENGINE = `
(function(){
  var C = __CONFIG__;
  var post = function(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var ink = window.__ink;
  if (!ink) {
    ink = window.__ink = { page: 0, pages: 1, cfg: C };
    var head = document.head || document.documentElement;
    var meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    head.appendChild(meta);
    ink.style = document.createElement('style');
    head.appendChild(ink.style);
    ink.measure = function(){
      var W = window.innerWidth;
      var sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      ink.pages = Math.max(1, Math.round(sw / W));
    };
    ink.show = function(p, forward){
      ink.page = Math.max(0, Math.min(ink.pages - 1, p));
      window.scrollTo(ink.page * window.innerWidth, 0);
      post({ type: 'page', page: ink.page, pages: ink.pages, forward: !!forward });
    };
    ink.go = function(d){
      var n = ink.page + d;
      if (n < 0) post({ type: 'prev' });
      else if (n >= ink.pages) post({ type: 'next' });
      else ink.show(n, d > 0);
    };
    ink.goFraction = function(f, forward){ ink.show(Math.round(f * (ink.pages - 1)), forward); };
    ink.goAnchor = function(id){
      var el = document.getElementById(id) || document.getElementsByName(id)[0];
      if (!el) { ink.show(0); return; }
      var x = el.getBoundingClientRect().left + window.scrollX;
      ink.show(Math.floor(x / window.innerWidth));
    };
    ink.later = function(fn){ requestAnimationFrame(function(){ requestAnimationFrame(fn); }); };
    ink.apply = function(cfg){
      var f = ink.pages > 1 ? ink.page / (ink.pages - 1) : 0;
      ink.cfg = cfg;
      ink.style.textContent = cfg.css;
      ink.later(function(){ ink.measure(); ink.goFraction(f); });
    };
    var sx = 0, sy = 0, st = 0;
    document.addEventListener('touchstart', function(e){ var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    // The page never scrolls by itself: only whole-page turns.
    document.addEventListener('touchmove', function(e){ e.preventDefault(); }, { passive: false });
    document.addEventListener('touchend', function(e){
      if (e.touches.length) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { ink.go(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12 || Date.now() - st > 500 || !ink.cfg.tap) return;
      for (var el = e.target; el && el !== document.body; el = el.parentNode) {
        if (el.tagName && el.tagName.toLowerCase() === 'a') return;
      }
      var W = window.innerWidth, H = window.innerHeight;
      if (t.clientY < H * 0.12 || t.clientY > H * 0.9) return;
      if (t.clientX <= W * 0.17) ink.go(-1);
      else if (t.clientX >= W * 0.83) ink.go(1);
    }, { passive: true });
  }
  ink.cfg = C;
  ink.style.textContent = C.css;
  var start = function(){
    ink.later(function(){
      ink.measure();
      var t = C.target;
      if (t.kind === 'anchor') ink.goAnchor(t.id);
      else if (t.kind === 'end') ink.show(ink.pages - 1, C.forward);
      else ink.goFraction(t.value, C.forward);
      post({ type: 'ready' });
    });
  };
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
true;`;

/** Position where each chapter starts (for the table of contents). */
export function chapterPositions(spine: EpubChapter[]): number[] {
  const sizes = spine.map(c => Math.max(1, c.size));
  const total = sizes.reduce((x, y) => x + y, 0);
  let acc = 0;
  return sizes.map(size => {
    const position = Math.round((acc / total) * (EPUB_POSITIONS - 1));
    acc += size;
    return position;
  });
}

const normalize = (uri: string) => {
  try {
    return decodeURI(uri.split('#')[0]).replace(/^file:\/+/, '/');
  } catch {
    return uri.split('#')[0].replace(/^file:\/+/, '/');
  }
};

const EpubReader = forwardRef<EpubReaderHandle, Props>(function EpubReader(
  { spine, initialPosition, settings, width, height, onLocation },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const theme = TEXT_THEMES[settings.textTheme ?? 'dark'];

  // Share of the text before each chapter, used to map positions <-> chapter + fraction.
  const { starts, shares } = useMemo(() => {
    const sizes = spine.map(c => Math.max(1, c.size));
    const total = sizes.reduce((a, b) => a + b, 0);
    const out: number[] = [];
    let acc = 0;
    for (const size of sizes) {
      out.push(acc / total);
      acc += size;
    }
    return { starts: out, shares: sizes.map(s => s / total) };
  }, [spine]);

  const targetOf = useCallback(
    (position: number): { chapter: number; fraction: number } => {
      const frac = Math.min(1, Math.max(0, position / (EPUB_POSITIONS - 1)));
      let chapter = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= frac) chapter = i;
      const fraction = Math.min(1, Math.max(0, (frac - starts[chapter]) / shares[chapter]));
      return { chapter, fraction };
    },
    [shares, starts],
  );

  const [nav, setNav] = useState<Nav>(() => {
    const t = targetOf(initialPosition);
    return { chapter: t.chapter, target: { kind: 'fraction', value: t.fraction }, forward: false };
  });
  const [ready, setReady] = useState(false);
  const navRef = useRef(nav);
  navRef.current = nav;
  const readyRef = useRef(false);

  const css = useMemo(() => buildCss(settings, width, height), [height, settings, width]);
  const tap = settings.tapToTurn !== false;
  const config = useMemo(() => ({ css, tap, target: nav.target, forward: nav.forward }), [css, nav, tap]);
  const injected = useMemo(() => ENGINE.replace('__CONFIG__', JSON.stringify(config)), [config]);

  const open = useCallback((next: Nav) => {
    readyRef.current = false;
    setReady(false);
    setNav(next);
  }, []);

  // Layout changes (rotation, text settings) re-paginate in place, keeping the reading spot.
  const layoutKey = `${css}|${tap}|${settings.textSize ?? 100}`;
  const firstLayout = useRef(true);
  useEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    if (!readyRef.current) return;
    // textZoom is applied natively; give it a moment before measuring the new pages.
    const timer = setTimeout(() => {
      webRef.current?.injectJavaScript(`window.__ink && window.__ink.apply(${JSON.stringify({ css, tap })}); true;`);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Safety net: never leave the cover up if a chapter's script fails.
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => {
      readyRef.current = true;
      setReady(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [nav, ready]);

  const goToChapter = useCallback(
    (chapter: number, anchor?: string) => {
      const index = Math.max(0, Math.min(spine.length - 1, chapter));
      const target: Target = anchor ? { kind: 'anchor', id: anchor } : { kind: 'fraction', value: 0 };
      if (index === navRef.current.chapter && readyRef.current) {
        webRef.current?.injectJavaScript(
          anchor ? `window.__ink.goAnchor(${JSON.stringify(anchor)}); true;` : 'window.__ink.show(0); true;',
        );
        return;
      }
      open({ chapter: index, target, forward: false });
    },
    [open, spine.length],
  );

  const goToPosition = useCallback(
    (position: number) => {
      const t = targetOf(position);
      if (t.chapter === navRef.current.chapter && readyRef.current) {
        webRef.current?.injectJavaScript(`window.__ink.goFraction(${t.fraction}); true;`);
        return;
      }
      open({ chapter: t.chapter, target: { kind: 'fraction', value: t.fraction }, forward: false });
    },
    [open, targetOf],
  );

  const turn = useCallback((delta: number) => {
    webRef.current?.injectJavaScript(`window.__ink && window.__ink.go(${delta > 0 ? 1 : -1}); true;`);
  }, []);

  useImperativeHandle(ref, () => ({ turn, goToPosition, goToChapter }), [goToChapter, goToPosition, turn]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      const chapter = navRef.current.chapter;
      if (msg.type === 'page') {
        const pages = Math.max(1, msg.pages);
        const within = pages > 1 ? msg.page / (pages - 1) : 1;
        // The last page of the last chapter is exactly EPUB_POSITIONS - 1 (100%, book finished).
        const position = Math.round(Math.min(1, starts[chapter] + shares[chapter] * within) * (EPUB_POSITIONS - 1));
        onLocation(position, { chapter, page: msg.page, pages }, !!msg.forward);
      } else if (msg.type === 'ready') {
        readyRef.current = true;
        setReady(true);
      } else if (msg.type === 'next') {
        if (chapter < spine.length - 1) open({ chapter: chapter + 1, target: { kind: 'fraction', value: 0 }, forward: true });
      } else if (msg.type === 'prev') {
        if (chapter > 0) open({ chapter: chapter - 1, target: { kind: 'end' }, forward: false });
      }
    },
    [onLocation, open, shares, spine.length, starts],
  );

  // Links: internal ones jump to the chapter / anchor, anything else (web links) is blocked.
  const onShouldStart = useCallback(
    (request: { url: string }) => {
      const url = normalize(request.url);
      const anchor = request.url.includes('#') ? request.url.split('#').pop() : undefined;
      const current = normalize(spine[navRef.current.chapter].uri);
      if (url === current && !anchor) return true;
      const index = spine.findIndex(c => normalize(c.uri) === url);
      if (index >= 0) goToChapter(index, anchor);
      return false;
    },
    [goToChapter, spine],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <WebView
        ref={webRef}
        source={{ uri: spine[nav.chapter].uri }}
        injectedJavaScript={injected}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        // Everything goes through onShouldStart (a non-whitelisted URL would open the browser).
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        scalesPageToFit={false}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        textZoom={settings.textSize ?? 100}
        mixedContentMode="never"
        overScrollMode="never"
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={{ width, height, backgroundColor: theme.bg }}
      />
      {/* Hides the chapter while it loads and paginates (no flash of the unstyled page). */}
      {!ready && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />}
    </View>
  );
});

export default EpubReader;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
