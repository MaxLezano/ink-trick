/**
 * InkTrick - Storage Service
 * Persistencia ligera usando JSON local (sin SQL).
 * Usa expo-file-system para leer/escribir archivos JSON en el directorio de documentos.
 */
import { File, Directory, Paths } from 'expo-file-system';
import { BookFile, ReadingProgress, BookSettings } from '../utils/types';

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
}

const DATA_DIR = new Directory(Paths.document, 'inktrick');
const DATA_FILE = new File(DATA_DIR, 'data.json');

// ─── Helpers ───────────────────────────────────────────────────────────────

let cachedData: StorageData | null = null;
let saveProgressTimer: NodeJS.Timeout | null = null;

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
    if (!DATA_FILE.exists) {
      cachedData = getDefaultData();
      return cachedData;
    }
    const content = await DATA_FILE.text();
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
  try {
    await ensureDataDir();
    await DATA_FILE.write(JSON.stringify(data));
  } catch (error) {
    console.error('[StorageService] Error writing data:', error);
  }
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
 * Obtiene el URI de la última carpeta escaneada.
 */
export async function getLastFolderUri(): Promise<string | null> {
  const data = await readData();
  return data.lastFolderUri ?? null;
}

/**
 * Guarda el URI de la última carpeta escaneada.
 */
export async function saveLastFolderUri(uri: string): Promise<void> {
  const data = await readData();
  data.lastFolderUri = uri;
  await writeData(data);
}

/**
 * Limpia todos los datos persistidos.
 */
export async function clearAll(): Promise<void> {
  try {
    if (DATA_FILE.exists) {
      await DATA_FILE.delete();
    }
  } catch (error) {
    console.error('[StorageService] Error clearing data:', error);
  }
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
  enableDoubleTapZoom: false,
  brightnessDimmer: 0,
  isRTL: false,
};

/**
 * Obtiene la configuración de lectura de un libro.
 */
export async function getBookSettings(bookId: string): Promise<BookSettings> {
  const data = await readData();
  if (!data.bookSettings) {
    data.bookSettings = {};
  }
  return data.bookSettings[bookId] ?? { ...DEFAULT_BOOK_SETTINGS };
}

/**
 * Guarda la configuración de lectura de un libro.
 */
export async function saveBookSettings(bookId: string, settings: BookSettings): Promise<void> {
  const data = await readData();
  if (!data.bookSettings) {
    data.bookSettings = {};
  }
  data.bookSettings[bookId] = settings;
  await writeData(data);
}
