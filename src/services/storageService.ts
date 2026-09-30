/**
 * InkTrick - Storage Service
 * Persistencia ligera usando JSON local (sin SQL).
 * Usa expo-file-system para leer/escribir archivos JSON en el directorio de documentos.
 */
import { File, Directory, Paths } from 'expo-file-system';
import { BookFile, ReadingProgress, BookSettings, ReadingStats } from '../utils/types';

export interface ScannedFolder {
  uri: string;
  name: string;
  enabled: boolean;
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
}

export type StorageSnapshot = StorageData;

const DATA_DIR = new Directory(Paths.document, 'inktrick');
const DATA_FILE = new File(DATA_DIR, 'data.json');
// Fresh instance each time: File.move() mutates the instance's uri.
const tempFile = () => new File(DATA_DIR, 'data.json.tmp');

// ─── Helpers ───────────────────────────────────────────────────────────────

let cachedData: StorageData | null = null;
let saveProgressTimer: ReturnType<typeof setTimeout> | null = null;
// Serializes disk writes so two saves never interleave on the same temp file.
let writeQueue: Promise<void> = Promise.resolve();

/**
 * Asegura que el directorio de datos exista.
 */
async function ensureDataDir(): Promise<void> {
  try {
    if (!DATA_DIR.exists) {
      DATA_DIR.create();
    }
  } catch (error) {
    // Si falla, lo ignoramos (generalmente porque ya existe o no se puede escribir)
  }
}

/**
 * Lee los datos persistidos del archivo JSON usando caché en memoria.
 */
async function readData(): Promise<StorageData> {
  if (cachedData) {
    return cachedData;
  }
  try {
    await ensureDataDir();
    // A leftover temp file without the main file means a write was interrupted mid-swap.
    const source = DATA_FILE.exists ? DATA_FILE : tempFile().exists ? tempFile() : null;
    if (!source) {
      cachedData = getDefaultData();
      return cachedData;
    }
    const content = await source.text();
    cachedData = JSON.parse(content) as StorageData;
    if (!cachedData.bookSettings) {
      cachedData.bookSettings = {};
    }
    if (!cachedData.progress) {
      cachedData.progress = {};
    }
    if (!cachedData.library) {
      cachedData.library = [];
    }
    return cachedData;
  } catch (error) {
    console.warn('[StorageService] Error reading data, returning defaults:', error);
    cachedData = getDefaultData();
    return cachedData;
  }
}

/**
 * Escribe datos al archivo JSON de forma compacta.
 */
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

/**
 * Retorna los datos por defecto.
 */
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

// ─── Backup ────────────────────────────────────────────────────────────────

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
