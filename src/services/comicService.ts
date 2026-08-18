/**
 * InkTrick - Comic Archive Service
 * Maneja la extracción y caché de portadas y tomos completos en formato .cbr / .cbz.
 * Conecta con el módulo nativo ComicArchiveModule en Android.
 */
import { NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Directory, File, Paths } from 'expo-file-system';

const { ComicArchiveModule } = NativeModules;

// Rutas de caché para cómics y portadas
const COVERS_DIR = new Directory(Paths.cache, 'inktrick_covers');
const COMICS_DIR = new Directory(Paths.cache, 'inktrick_comics');

/**
 * Asegura que los directorios de caché existan.
 */
async function ensureCacheDirs(): Promise<void> {
  try {
    if (!COVERS_DIR.exists) {
      COVERS_DIR.create();
    }
    if (!COMICS_DIR.exists) {
      COMICS_DIR.create();
    }
  } catch (err) {
    // Ignorar si ya existen
  }
}

/**
 * Extrae la portada (primera página de imagen) del cómic para mostrarla en el Home/Dashboard.
 * Si ya fue extraída previamente en caché, la retorna de inmediato en 0ms.
 */
export async function extractCover(filePath: string, bookId: string): Promise<string | undefined> {
  try {
    await ensureCacheDirs();

    const targetCoverFile = new File(COVERS_DIR, `${bookId}.jpg`);
    if (targetCoverFile.exists && targetCoverFile.size && targetCoverFile.size > 0) {
      return targetCoverFile.uri;
    }

    if (!ComicArchiveModule || !ComicArchiveModule.extractFirstImage) {
      console.warn('[ComicService] ComicArchiveModule not available on this platform.');
      return undefined;
    }

    const coverUri = await ComicArchiveModule.extractFirstImage(filePath, targetCoverFile.uri);
    return coverUri;
  } catch (error) {
    console.warn(`[ComicService] Failed to extract cover for ${filePath}:`, error);
    return undefined;
  }
}

/**
 * Extrae todas las páginas del tomo cómic para su lectura.
 * Si ya fue extraído previamente, lee directamente la lista de imágenes en caché para carga instantánea.
 */
export async function extractComicPages(bookId: string, filePath: string): Promise<string[]> {
  try {
    await ensureCacheDirs();

    const bookCacheDir = new Directory(COMICS_DIR, bookId);

    // Si ya existe la carpeta y contiene archivos, retornar la lista de páginas en caché
    if (bookCacheDir.exists) {
      try {
        const contents = bookCacheDir.list();
        const imageFiles = contents
          .filter((item: any) => item instanceof File)
          .filter((f: any) => {
            const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);
          });

        if (imageFiles.length > 0) {
          // Ordenar naturalmente por nombre de archivo
          const sortedUris = imageFiles
            .map((f: any) => f.uri)
            .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
          
          console.log(`[ComicService] Found ${sortedUris.length} cached pages for book ${bookId}`);
          return sortedUris;
        }
      } catch (e) {
        console.warn('[ComicService] Error listing cached comic pages, re-extracting:', e);
      }
    } else {
      bookCacheDir.create();
    }

    if (!ComicArchiveModule || !ComicArchiveModule.extractAllImages) {
      throw new Error('ComicArchiveModule not available.');
    }

    console.log(`[ComicService] Extracting all pages for ${bookId} from ${filePath}`);
    const extractedUris: string[] = await ComicArchiveModule.extractAllImages(filePath, bookCacheDir.uri, bookId);

    // Ordenar naturalmente
    const sorted = extractedUris.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    console.log(`[ComicService] Extracted ${sorted.length} pages for book ${bookId}`);
    return sorted;
  } catch (error) {
    console.error(`[ComicService] Error extracting comic pages for ${bookId}:`, error);
    throw error;
  }
}
