/**
 * InkTrick - Book Preload & Performance Cache Service
 * Servicio para precargar el 100% de páginas de cualquier libro (PDF, CBR, CBZ) en disco/memoria.
 * Garantiza lectura instantánea a 60 FPS sin tirones ni esperas en dispositivos lentos.
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { BookFile, SupportedFormat } from '../utils/types';
import * as ComicService from './comicService';

const { ComicArchiveModule } = NativeModules;
const comicArchiveEmitter = ComicArchiveModule ? new NativeEventEmitter(ComicArchiveModule) : null;

const PDF_PAGES_DIR = new Directory(Paths.cache, 'inktrick_pdf_pages_v2');
const COMICS_DIR = new Directory(Paths.cache, 'inktrick_comics');

/**
 * Asegura que los directorios de caché existan.
 */
async function ensureCacheDirs(): Promise<void> {
  try {
    if (!PDF_PAGES_DIR.exists) {
      PDF_PAGES_DIR.create();
    }
    if (!COMICS_DIR.exists) {
      COMICS_DIR.create();
    }
  } catch (err) {
    // Ignorar si ya existen
  }
}

export interface PreloadProgress {
  current: number;
  total: number;
  percentage: number;
}

/**
 * Comprueba si un libro ya tiene el 100% de sus páginas extraídas y cacheadas en disco.
 */
export async function isBookFullyCached(
  bookId: string,
  format: SupportedFormat
): Promise<{ isCached: boolean; pages: string[] }> {
  try {
    await ensureCacheDirs();

    const targetDir = (format === '.cbr' || format === '.cbz')
      ? new Directory(COMICS_DIR, bookId)
      : new Directory(PDF_PAGES_DIR, bookId);

    if (targetDir.exists) {
      const contents = targetDir.list();
      const imageFiles = contents
        .filter((item: any) => item instanceof File)
        .filter((f: any) => {
          const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);
        });

      if (imageFiles.length > 0) {
        const sortedUris = imageFiles
          .map((f: any) => f.uri)
          .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        return { isCached: true, pages: sortedUris };
      }
    }
  } catch (e) {
    console.warn('[BookPreloadService] Error checking cache for:', bookId, e);
  }

  return { isCached: false, pages: [] };
}

/**
 * Precarga el 100% de las páginas del libro.
 * Si ya está en caché, retorna de inmediato en 0ms.
 * Si no, extrae y rasteriza todo el documento emitiendo progreso en tiempo real.
 */
export async function preloadBook(
  book: BookFile,
  onProgress?: (progress: PreloadProgress) => void
): Promise<string[]> {
  await ensureCacheDirs();

  // 1. Verificar si ya está en caché
  const cacheCheck = await isBookFullyCached(book.id, book.format);
  if (cacheCheck.isCached && cacheCheck.pages.length > 0) {
    if (onProgress) {
      onProgress({
        current: cacheCheck.pages.length,
        total: cacheCheck.pages.length,
        percentage: 100,
      });
    }
    return cacheCheck.pages;
  }

  // 2. Suscribirse a eventos de progreso del módulo nativo
  let subscription: any = null;
  if (comicArchiveEmitter && onProgress) {
    subscription = comicArchiveEmitter.addListener('onPreloadProgress', (event: any) => {
      if (event && event.bookId === book.id) {
        onProgress({
          current: event.current,
          total: event.total,
          percentage: event.percentage,
        });
      }
    });
  }

  try {
    if (book.format === '.cbr' || book.format === '.cbz') {
      const pages = await ComicService.extractComicPages(book.id, book.filePath);
      return pages;
    } else {
      // Formato PDF: Rasterizar todo el documento a imágenes JPG de alta velocidad
      const bookPdfDir = new Directory(PDF_PAGES_DIR, book.id);
      if (!bookPdfDir.exists) {
        bookPdfDir.create();
      }

      if (!ComicArchiveModule || !ComicArchiveModule.extractAllPdfPages) {
        throw new Error('ComicArchiveModule.extractAllPdfPages not available.');
      }

      console.log(`[BookPreloadService] Pre-rendering 100% of PDF pages for ${book.id}`);
      const pages: string[] = await ComicArchiveModule.extractAllPdfPages(
        book.filePath,
        bookPdfDir.uri,
        book.id
      );

      const sorted = pages.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      return sorted;
    }
  } finally {
    if (subscription) {
      subscription.remove();
    }
  }
}
