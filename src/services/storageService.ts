/**
 * InkTrick - Storage service
 * Lightweight JSON persistence (library, progress, settings, stats) in the documents directory.
 * All reads share one in-memory object; writes are serialized and atomic.
 */
import { File, Directory, Paths } from 'expo-file-system';
import { BookFile, Bookmark, ReadingProgress, BookSettings, ReadingStats } from '../utils/types';

export interface ScannedFolder {
  uri: string;
  name: string;
  enabled: boolean;
}

export interface AutoBackupConfig {
  folderUri: string;
  folderName: string;
  lastAt?: number;
  lastError?: string;
}

interface StorageData {
  library: BookFile[];
  progress: Record<string, ReadingProgress>;
  lastScanTimestamp?: number;
  lastFolderUri?: string;
  scannedFolders?: ScannedFolder[];
  bookSettings?: Record<string, BookSettings>;
  seriesSettings?: Record<string, BookSettings>; // Last settings used per collection / folder
  excludedPaths?: string[]; // Files the user removed from the library (skipped on rescans)
  stats?: ReadingStats;
  bookmarks?: Record<string, Bookmark[]>;
  autoBackup?: AutoBackupConfig;
  tourSeenAt?: number; // Guided tour finished or skipped: it no longer starts by itself
}

export type StorageSnapshot = StorageData;

const DATA_DIR = new Directory(Paths.document, 'inktrick');
const DATA_FILE = new File(DATA_DIR, 'data.json');
// Fresh instance each time: File.move() mutates the instance's uri.
const tempFile = () => new File(DATA_DIR, 'data.json.tmp');

// ─── Helpers ───────────────────────────────────────────────────────────────

let cachedData: StorageData | null = null;
// First read in progress: concurrent callers must share it, or each would parse its own copy and
// later writes to the "losing" copy would be silently dropped.
let pendingRead: Promise<StorageData> | null = null;
let saveProgressTimer: ReturnType<typeof setTimeout> | null = null;
// Serializes disk writes so two saves never interleave on the same temp file.
let writeQueue: Promise<void> = Promise.resolve();

async function ensureDataDir(): Promise<void> {
  try {
    if (!DATA_DIR.exists) DATA_DIR.create();
  } catch {
    // Already exists or not writable; the write itself reports real failures.
  }
}

function readData(): Promise<StorageData> {
  if (cachedData) return Promise.resolve(cachedData);
  if (!pendingRead) {
    pendingRead = loadFromDisk().finally(() => {
      pendingRead = null;
    });
  }
  return pendingRead;
}

async function parseFile(file: File): Promise<StorageData | null> {
  try {
    if (!file.exists) return null;
    const data = JSON.parse(await file.text()) as StorageData;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function loadFromDisk(): Promise<StorageData> {
  await ensureDataDir();
  // The temp file is the fallback: it holds the last write if the swap was interrupted.
  let data = (await parseFile(DATA_FILE)) ?? (await parseFile(tempFile()));
  if (!data) {
    if (DATA_FILE.exists) {
      // Unreadable file: keep a copy instead of silently replacing the user's library.
      try {
        DATA_FILE.copy(new File(DATA_DIR, `data.corrupt-${Date.now()}.json`));
      } catch (error) {
        console.warn('[StorageService] Could not keep a copy of the corrupt data file:', error);
      }
    }
    data = getDefaultData();
  }
  data.library ??= [];
  data.progress ??= {};
  data.bookSettings ??= {};
  cachedData = data;
  return data;
}

async function writeData(data: StorageData): Promise<void> {
  cachedData = data;
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureDataDir();
      // Atomic-ish replace: a crash mid-write can never leave a truncated data.json behind.
      const tmp = tempFile();
      if (tmp.exists) tmp.delete();
      tmp.write(JSON.stringify(cachedData ?? data));
      const target = new File(DATA_DIR, 'data.json');
      if (target.exists) target.delete();
      tmp.move(target);
    } catch (error) {
      console.error('[StorageService] Error writing data:', error);
    }
  });
  return writeQueue;
}

function getDefaultData(): StorageData {
  return {
    library: [],
    progress: {},
    bookSettings: {},
  };
}

// ─── API Pública ───────────────────────────────────────────────────────────

/**
 * Obtiene la biblioteca completa de libros.
 */
export async function getLibrary(): Promise<BookFile[]> {
  const data = await readData();
  return data.library;
}

/**
 * Guarda la biblioteca completa.
 */
export async function saveLibrary(books: BookFile[]): Promise<void> {
  const data = await readData();
  data.library = books;
  await writeData(data);
}

/**
 * Obtiene el progreso de lectura de un libro.
 */
export async function getProgress(bookId: string): Promise<ReadingProgress | null> {
  const data = await readData();
  return data.progress[bookId] ?? null;
}

/**
 * Guarda el progreso de lectura con debounce para no saturar disco en scroll continuo.
 */
export async function saveProgress(progress: ReadingProgress, immediate: boolean = false): Promise<void> {
  const data = await readData();
  data.progress[progress.bookId] = progress;

  if (immediate) {
    if (saveProgressTimer) {
      clearTimeout(saveProgressTimer);
      saveProgressTimer = null;
    }
    await writeData(data);
  } else {
    if (saveProgressTimer) {
      clearTimeout(saveProgressTimer);
    }
    saveProgressTimer = setTimeout(() => {
      saveProgressTimer = null;
      writeData(data);
    }, 400);
  }
}

/**
 * Fuerza la descarga a disco de cualquier guardado de progreso pendiente.
 */
export async function flushProgress(): Promise<void> {
  if (saveProgressTimer && cachedData) {
    clearTimeout(saveProgressTimer);
    saveProgressTimer = null;
    await writeData(cachedData);
  }
}

/**
 * Obtiene todos los progresos de lectura.
 */
export async function getAllProgress(): Promise<Record<string, ReadingProgress>> {
  const data = await readData();
  return data.progress;
}

/**
 * Limpia todos los datos persistidos.
 */
export async function getExcludedPaths(): Promise<string[]> {
  const data = await readData();
  return data.excludedPaths ?? [];
}

export async function saveExcludedPaths(paths: string[]): Promise<void> {
  const data = await readData();
  data.excludedPaths = paths;
  await writeData(data);
}

/**
 * Removes progress and per-book settings of deleted books.
 */
export async function forgetBooks(bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return;
  const data = await readData();
  for (const id of bookIds) {
    delete data.progress[id];
    if (data.bookSettings) delete data.bookSettings[id];
    if (data.bookmarks) delete data.bookmarks[id];
  }
  await writeData(data);
}

/**
 * Obtiene la lista de carpetas escaneadas administradas con soporte de migración.
 */
export async function getScannedFolders(): Promise<ScannedFolder[]> {
  const data = await readData();
  if (data.scannedFolders && data.scannedFolders.length > 0) {
    return data.scannedFolders;
  }
  
  // Migración automática del lastFolderUri antiguo
  if (data.lastFolderUri) {
    let folderName = 'Manga';
    try {
      const decoded = decodeURIComponent(data.lastFolderUri);
      const parts = decoded.split('/');
      // Extrae el último elemento no vacío
      const cleanParts = parts.filter(Boolean);
      if (cleanParts.length > 0) {
        folderName = cleanParts[cleanParts.length - 1];
      }
    } catch (e) {
      // Ignorar errores de decodificación
    }
    
    const legacyFolder: ScannedFolder = {
      uri: data.lastFolderUri,
      name: folderName,
      enabled: true,
    };
    return [legacyFolder];
  }
  return [];
}

/**
 * Guarda la lista de carpetas escaneadas administradas.
 */
export async function saveScannedFolders(folders: ScannedFolder[]): Promise<void> {
  const data = await readData();
  data.scannedFolders = folders;
  // Sincroniza la propiedad lastFolderUri antigua con el primer folder habilitado
  const firstEnabled = folders.find(f => f.enabled);
  data.lastFolderUri = firstEnabled ? firstEnabled.uri : '';
  await writeData(data);
}

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  isHorizontal: false,
  usePaging: false,
  fitMode: 0,
  enableDoubleTapZoom: true,
  brightnessDimmer: 0,
  isRTL: false,
  tapToTurn: true,
  keepAwake: true,
  doublePage: 'auto',
  autoCrop: false,
  fullscreen: true,
  volumeKeys: true,
  textSize: 100,
  textTheme: 'dark',
  textFont: 'book',
  lineHeight: 1.6,
};

/**
 * Obtiene la configuración de lectura de un libro.
 */
export async function getBookSettings(bookId: string, seriesKey?: string): Promise<BookSettings> {
  const data = await readData();
  if (!data.bookSettings) {
    data.bookSettings = {};
  }
  // New books inherit the settings last used in the same series (e.g. RTL for a whole manga).
  const inherited = seriesKey ? data.seriesSettings?.[seriesKey] : undefined;
  return {
    ...DEFAULT_BOOK_SETTINGS,
    ...(data.bookSettings[bookId] ?? inherited ?? {}),
  };
}

/**
 * Guarda la configuración de lectura de un libro.
 */
export async function saveBookSettings(bookId: string, settings: BookSettings, seriesKey?: string): Promise<void> {
  const data = await readData();
  if (!data.bookSettings) {
    data.bookSettings = {};
  }
  data.bookSettings[bookId] = settings;
  if (seriesKey) data.seriesSettings = { ...(data.seriesSettings ?? {}), [seriesKey]: settings };
  await writeData(data);
}

// ─── Reading statistics ────────────────────────────────────────────────────

function emptyStats(): ReadingStats {
  return { days: {}, books: {}, finished: {} };
}

export function dayKey(date: Date = new Date()): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

let statsTimer: ReturnType<typeof setTimeout> | null = null;

export async function getStats(): Promise<ReadingStats> {
  const data = await readData();
  return data.stats ?? emptyStats();
}

/** Adds reading time / pages for today and for the book. Disk writes are batched. */
export async function recordReading(bookId: string, seconds: number, pages: number): Promise<void> {
  if (seconds <= 0 && pages <= 0) return;
  const data = await readData();
  const stats = (data.stats ??= emptyStats());
  const key = dayKey();
  const day = (stats.days[key] ??= { seconds: 0, pages: 0 });
  day.seconds += Math.round(seconds);
  day.pages += pages;
  const book = (stats.books[bookId] ??= { seconds: 0, pages: 0 });
  book.seconds += Math.round(seconds);
  book.pages += pages;
  if (statsTimer) clearTimeout(statsTimer);
  statsTimer = setTimeout(() => {
    statsTimer = null;
    writeData(data);
  }, 2000);
}

export async function markFinished(bookId: string): Promise<void> {
  const data = await readData();
  const stats = (data.stats ??= emptyStats());
  if (stats.finished[bookId]) return;
  stats.finished[bookId] = Date.now();
  await writeData(data);
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────

export async function getBookmarks(bookId: string): Promise<Bookmark[]> {
  const data = await readData();
  return data.bookmarks?.[bookId] ?? [];
}

export async function saveBookmarks(bookId: string, bookmarks: Bookmark[]): Promise<void> {
  const data = await readData();
  const all = (data.bookmarks ??= {});
  if (bookmarks.length > 0) all[bookId] = bookmarks;
  else delete all[bookId];
  await writeData(data);
}

// ─── Backup ────────────────────────────────────────────────────────────────

export async function getAutoBackup(): Promise<AutoBackupConfig | null> {
  const data = await readData();
  return data.autoBackup ?? null;
}

export async function saveAutoBackup(config: AutoBackupConfig | null): Promise<void> {
  const data = await readData();
  if (config) data.autoBackup = config;
  else delete data.autoBackup;
  await writeData(data);
}

// ─── Guided tour ───────────────────────────────────────────────────────────

export async function isTourSeen(): Promise<boolean> {
  const data = await readData();
  return !!data.tourSeenAt;
}

export async function markTourSeen(): Promise<void> {
  const data = await readData();
  if (data.tourSeenAt) return;
  data.tourSeenAt = Date.now();
  await writeData(data);
}

/** Full copy of the persisted data (used for backups). */
export async function getSnapshot(): Promise<StorageSnapshot> {
  if (statsTimer) {
    clearTimeout(statsTimer);
    statsTimer = null;
  }
  await flushProgress();
  return JSON.parse(JSON.stringify(await readData()));
}

/** Replaces the persisted data (used when restoring a backup). */
export async function replaceSnapshot(next: StorageSnapshot): Promise<void> {
  await writeData(next);
}
