/**
 * InkTrick - Book cache service
 * Single entry point for everything that touches native book processing:
 * comic page extraction, EPUB unpacking, local PDF copies, covers, embedded metadata,
 * next-volume preloading and cache housekeeping.
 */
import { NativeModules, NativeEventEmitter, PixelRatio } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { BookFile, PageInfo, SupportedFormat, TrimBox } from '../utils/types';

const { ComicArchiveModule } = NativeModules;
const emitter = ComicArchiveModule ? new NativeEventEmitter(ComicArchiveModule) : null;

// Extracted pages and PDF copies are disposable (cache); covers must survive cache purges.
const COMICS_DIR = new Directory(Paths.cache, 'inktrick_comics_v2');
const PDF_DIR = new Directory(Paths.cache, 'inktrick_pdf');
const EPUB_DIR = new Directory(Paths.cache, 'inktrick_epub');
const COVERS_DIR = new Directory(Paths.document, 'inktrick', 'covers');

// Legacy cache folders from previous versions (safe to delete).
const LEGACY_DIRS = [
  new Directory(Paths.cache, 'inktrick_comics'),
  new Directory(Paths.cache, 'inktrick_pdf_pages_v2'),
  new Directory(Paths.cache, 'inktrick_comic_cache'),
  new Directory(Paths.cache, 'inktrick_covers'),
];

// Covers are shown at most ~240dp wide: size them to this screen's density (HD, FHD, 2K...).
// Bump to regenerate every cover once (v2: margins cropped, density-based size).
const COVER_VERSION = 'c2';
const COVER_MAX_WIDTH = Math.min(900, Math.max(360, PixelRatio.getPixelSizeForLayoutSize(240)));
const MAX_LOCAL_PDF_COPIES = 6;

export interface PreloadProgress {
  current: number;
  percentage: number;
}

function ensureDir(dir: Directory) {
  try {
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    // Already exists or not creatable; callers handle failures.
  }
}

function requireModule() {
  if (!ComicArchiveModule) {
    throw new Error('ComicArchiveModule is not available on this platform.');
  }
  return ComicArchiveModule;
}

export function isComic(book: Pick<BookFile, 'format'>): boolean {
  return book.format === '.cbr' || book.format === '.cbz';
}

export function isEpub(book: Pick<BookFile, 'format'>): boolean {
  return book.format === '.epub';
}

// ─── Comic pages ─────────────────────────────────────────────────────────────

/** Returns the pages if the comic is already fully extracted, otherwise null (instant). */
export async function getCachedComicPages(bookId: string): Promise<PageInfo[] | null> {
  const dir = new Directory(COMICS_DIR, bookId);
  if (!dir.exists) return null;
  return requireModule().getCachedPages(dir.uri);
}

/** Extracts (or reuses) every page of a CBR/CBZ in reading order, with real image sizes. */
export async function getComicPages(
  book: BookFile,
  onProgress?: (progress: PreloadProgress) => void,
): Promise<PageInfo[]> {
  ensureDir(COMICS_DIR);
  const dir = new Directory(COMICS_DIR, book.id);

  const subscription = emitter && onProgress
    ? emitter.addListener('onPreloadProgress', (event: any) => {
        if (event?.bookId === book.id) {
          onProgress({ current: event.current, percentage: event.percentage });
        }
      })
    : null;

  try {
    return await requireModule().extractAllImages(book.filePath, dir.uri, book.id);
  } finally {
    subscription?.remove();
  }
}

/** Content box of every page (auto crop). Computed natively once per book, then cached. */
export async function getTrimBoxes(bookId: string): Promise<TrimBox[] | null> {
  try {
    const dir = new Directory(COMICS_DIR, bookId);
    if (!dir.exists) return null;
    return await requireModule().computeTrimBoxes(dir.uri);
  } catch (error) {
    console.warn('[BookCache] Auto crop failed:', error);
    return null;
  }
}

// ─── EPUB ────────────────────────────────────────────────────────────────────

export interface EpubChapter {
  uri: string;
  size: number;
}

export interface EpubBook {
  title: string;
  author: string;
  spine: EpubChapter[];
  toc: { title: string; spine: number; anchor: string; depth: number }[];
  rtl?: boolean; // Right-to-left book (usually Japanese vertical text): shown horizontally
}

/** Unpacks an EPUB (only while it is open) and returns its reading order and table of contents. */
export async function openEpub(book: BookFile): Promise<EpubBook> {
  ensureDir(EPUB_DIR);
  const dir = new Directory(EPUB_DIR, book.id);
  return requireModule().openEpub(book.filePath, dir.uri);
}

// ─── Embedded metadata ───────────────────────────────────────────────────────

export interface BookInfo {
  title?: string;
  series?: string;
  volume?: string;
  number?: string;
  author?: string;
  summary?: string;
}

/** Formats whose files can carry metadata (ComicInfo.xml in CBZ, the OPF package in EPUB). */
export function hasEmbeddedInfo(format: SupportedFormat): boolean {
  return format === '.cbz' || format === '.epub';
}

export async function readBookInfo(book: BookFile): Promise<BookInfo | null> {
  try {
    return await requireModule().readBookInfo(book.filePath, book.format);
  } catch {
    return null;
  }
}

// ─── Next volume preloading ──────────────────────────────────────────────────

// Time a preloaded book stays after its claim is released, so the reader that opens it right away
// ("Siguiente") can take it over before the files are deleted.
const PRELOAD_HANDOFF_MS = 5000;

/**
 * Prepares a book in the background (extraction / local copy) so it opens instantly. Returns the
 * release function; like any open book, the files are deleted once nobody uses them.
 */
export function preloadBook(book: BookFile): () => void {
  retainBookFiles(book.id);
  const task: Promise<unknown> = (
    isComic(book) ? getComicPages(book) : isEpub(book) ? openEpub(book) : getLocalPdfUri(book)
  ).catch(() => {});
  let released = false;
  return () => {
    if (released) return;
    released = true;
    task.finally(() => setTimeout(() => releaseBookFiles(book.id), PRELOAD_HANDOFF_MS));
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/**
 * react-native-pdf needs a real file path; SAF documents are copied (atomically) into the cache.
 * Only the most recently used copies are kept.
 */
export async function getLocalPdfUri(book: BookFile): Promise<string> {
  if (!book.filePath.startsWith('content://')) return book.filePath;
  ensureDir(PDF_DIR);
  const target = new File(PDF_DIR, `${book.id}.pdf`);
  const uri: string = await requireModule().copyToLocalFile(book.filePath, target.uri);
  prunePdfCopies(book.id);
  return uri;
}

function prunePdfCopies(keepId: string) {
  try {
    const copies = PDF_DIR.list()
      .filter((item): item is File => item instanceof File && item.name.endsWith('.pdf'))
      .filter(f => !f.name.startsWith(keepId))
      .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    copies.slice(MAX_LOCAL_PDF_COPIES - 1).forEach(f => {
      try { f.delete(); } catch {}
    });
  } catch {
    // Housekeeping is best effort.
  }
}

export async function getPdfPageCount(uri: string): Promise<number> {
  try {
    return await requireModule().getPdfPageCount(uri);
  } catch {
    return 0;
  }
}

// ─── Covers ──────────────────────────────────────────────────────────────────

/**
 * Generates a small persistent cover thumbnail for the given page (1-based).
 * Returns the new cover URI and, for PDFs, the page count discovered along the way.
 */
export async function generateCover(
  book: BookFile,
  pageNumber: number = 1,
): Promise<{ uri: string; pageCount?: number } | undefined> {
  try {
    ensureDir(COVERS_DIR);
    // Versioned name so <Image> never shows a stale cached bitmap after a cover change.
    const target = new File(COVERS_DIR, `${book.id}_${COVER_VERSION}_p${pageNumber}.jpg`);
    const mod = requireModule();

    if (isComic(book)) {
      // Reuse already extracted pages when available: much faster than re-reading the archive.
      const cached = await getCachedComicPages(book.id);
      const page = cached?.[Math.min(Math.max(pageNumber, 1), cached.length) - 1];
      const uri: string = page
        ? await mod.createThumbnail(page.uri, target.uri, COVER_MAX_WIDTH)
        : await mod.extractCover(book.filePath, target.uri, pageNumber, COVER_MAX_WIDTH);
      removeOtherCovers(book.id, target.name);
      return { uri };
    }

    if (isEpub(book)) {
      const uri: string = await mod.extractEpubCover(book.filePath, target.uri, COVER_MAX_WIDTH);
      removeOtherCovers(book.id, target.name);
      return { uri };
    }

    const result = await mod.renderPdfCover(book.filePath, target.uri, pageNumber, COVER_MAX_WIDTH);
    removeOtherCovers(book.id, target.name);
    return { uri: result.uri, pageCount: result.pageCount };
  } catch (error) {
    console.warn('[BookCache] Cover generation failed:', book.title, error);
    return undefined;
  }
}

function removeOtherCovers(bookId: string, keepName: string) {
  try {
    COVERS_DIR.list()
      .filter((item): item is File => item instanceof File)
      .filter(f => f.name.startsWith(`${bookId}_`) && f.name !== keepName)
      .forEach(f => { try { f.delete(); } catch {} });
  } catch {}
}

/** True when a stored cover URI still points to an existing file. */
export function coverExists(uri?: string): boolean {
  if (!uri) return false;
  // Covers found next to the file (cover.jpg in the user's folder) are trusted as-is.
  if (uri.startsWith('content://')) return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** True for covers produced by this version (persistent, thumbnail sized) or picked from the folder. */
export function isCurrentCover(uri?: string): boolean {
  if (!uri) return false;
  if (uri.startsWith('content://')) return true;
  return uri.startsWith(COVERS_DIR.uri) && uri.includes(`_${COVER_VERSION}_`) && coverExists(uri);
}

// Readers currently using each book's temporary files. Reopening a book while the previous
// reader is still closing must not delete the files the new reader is about to use.
const openReaders = new Map<string, number>();

/** Marks a book's temporary files as in use by one more reader. */
export function retainBookFiles(bookId: string) {
  openReaders.set(bookId, (openReaders.get(bookId) ?? 0) + 1);
}

/**
 * Releases one reader's claim; the files (extracted pages, PDF copy) are deleted when no reader
 * uses them anymore. Books are never kept decompressed, so the cache cannot grow over time.
 */
export function releaseBookFiles(bookId: string) {
  const count = (openReaders.get(bookId) ?? 1) - 1;
  if (count > 0) {
    openReaders.set(bookId, count);
    return;
  }
  openReaders.delete(bookId);
  deleteBookFiles(bookId);
}

function deleteBookFiles(bookId: string) {
  try {
    const dir = new Directory(COMICS_DIR, bookId);
    if (dir.exists) dir.delete();
  } catch {}
  try {
    const pdf = new File(PDF_DIR, `${bookId}.pdf`);
    if (pdf.exists) pdf.delete();
  } catch {}
  try {
    const epub = new Directory(EPUB_DIR, bookId);
    if (epub.exists) epub.delete();
  } catch {}
}

/** Deletes everything of books that were removed from the library (including the cover). */
export function deleteBookCache(bookId: string) {
  if (!openReaders.has(bookId)) deleteBookFiles(bookId);
  removeOtherCovers(bookId, '');
}

// ─── Housekeeping ────────────────────────────────────────────────────────────

/** PDF copies made by old versions directly in the cache root (`book_<id>.pdf`). */
function legacyRootPdfs(): File[] {
  try {
    return new Directory(Paths.cache)
      .list()
      // book_<id>.pdf copies and thumbnails of the removed react-native-pdf-thumbnail library.
      .filter((item): item is File => item instanceof File && /^book_.+\.pdf$|\.jpe?g$/i.test(item.name));
  } catch {
    return [];
  }
}

/**
 * Clears extracted pages, PDF copies and leftovers of old versions. Runs on every launch (a
 * reader killed by the system cannot clean up after itself). Covers and progress are kept.
 */
export function clearReadingCache() {
  // Glide's disk cache only held resized copies of local files: never needed.
  Image.clearDiskCache().catch(() => {});
  for (const dir of [COMICS_DIR, PDF_DIR, EPUB_DIR, ...LEGACY_DIRS]) {
    try { if (dir.exists) dir.delete(); } catch {}
  }
  for (const file of legacyRootPdfs()) {
    try { file.delete(); } catch {}
  }
}
