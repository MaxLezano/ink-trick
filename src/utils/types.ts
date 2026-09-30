/**
 * InkTrick - Core Type Definitions
 * Tipos centrales para el lector de PDF manga/anime.
 */

// ─── Formato soportado ─────────────────────────────────────────────────────
export type SupportedFormat = '.pdf' | '.cbr' | '.cbz' | '.epub';

// ─── Archivo de libro ──────────────────────────────────────────────────────
export interface BookFile {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  format: SupportedFormat;
  fileSize: number;
  coverUri?: string;
  coverPage?: number;     // Página seleccionada como portada (1-indexed)
  author?: string;
  series?: string;        // From ComicInfo.xml / EPUB metadata
  volume?: string;
  summary?: string;
  infoChecked?: boolean;  // Embedded metadata already read (CBZ / EPUB)
  addedAt: number;        // timestamp
  lastOpenedAt?: number;  // timestamp
  isFavorite: boolean;
  folder?: string;
  pageCount?: number;     // Known total pages (filled on first open / cover generation)
  order?: number;         // Manual reading order inside its collection (lower first)
}

// ─── Page of an image-based book (CBR/CBZ) ─────────────────────────────────
export interface PageInfo {
  uri: string;
  width: number;
  height: number;
  chapter?: string;       // Folder of the page inside the archive (chapter packs)
}

// ─── Table of contents / bookmarks ─────────────────────────────────────────
export interface TocItem {
  title: string;
  depth: number;
  page: number;           // Logical page (EPUB: position, see EPUB_POSITIONS)
  spine?: number;         // EPUB: chapter file index
  anchor?: string;        // EPUB: element id inside the chapter
}

export interface Bookmark {
  page: number;           // Logical page (EPUB: position)
  createdAt: number;
}

export type TextTheme = 'dark' | 'sepia' | 'light';
export type TextFont = 'book' | 'serif' | 'sans';

// ─── Progreso de lectura ───────────────────────────────────────────────────
export interface ReadingProgress {
  bookId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt: number;     // timestamp
}

// ─── Configuración de lectura de libro ──────────────────────────────────────
export interface BookSettings {
  isHorizontal: boolean;
  usePaging: boolean;
  fitMode: number; // 0: Fit Width, 1: Fit Height, 2: Fit Both
  enableDoubleTapZoom: boolean;
  brightnessDimmer: number; // 0 to 0.7 (opacity of night mode overlay)
  isRTL: boolean;
  tapToTurn?: boolean;      // Tap left/right edges to turn pages (paged mode)
  keepAwake?: boolean;      // Keep the screen on while reading
  doublePage?: DoublePageMode; // Two pages side by side (horizontal paged comics)
  autoCrop?: boolean;       // Trim uniform white/black margins (comics)
  fullscreen?: boolean;     // Hide the Android status and navigation bars
  volumeKeys?: boolean;     // Volume down / up turn pages
  invertColors?: boolean;   // Night mode: black paper, white lines (comics / PDF)
  textSize?: number;        // EPUB: font size in %
  textTheme?: TextTheme;    // EPUB: page colors
  textFont?: TextFont;      // EPUB: typeface
  lineHeight?: number;      // EPUB: line spacing
}

export type DoublePageMode = 'off' | 'on' | 'auto'; // auto = only in landscape

// ─── Content box of a page, as fractions of the image (auto crop) ──────────
export interface TrimBox {
  l: number;
  t: number;
  r: number;
  b: number;
}

// ─── Reading statistics ────────────────────────────────────────────────────
export interface DayStats {
  seconds: number;
  pages: number;
}

export interface ReadingStats {
  days: Record<string, DayStats>;      // key: YYYY-MM-DD (local time)
  books: Record<string, DayStats>;     // key: bookId
  finished: Record<string, number>;    // bookId -> timestamp when the last page was reached
}




// ─── Navegación ────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Dashboard: undefined;
  Reader: { bookId: string };
  Stats: undefined;
};
