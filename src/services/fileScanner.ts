/**
 * InkTrick - File Scanner Service
 * Escanea directorios utilizando la API orientada a objetos moderna de expo-file-system.
 * Soporta archivos PDF, CBR y CBZ.
 */
import { File, Directory } from 'expo-file-system';
import { BookFile, SupportedFormat } from '../utils/types';
import { SUPPORTED_EXTENSIONS } from '../utils/constants';

/**
 * Genera un ID único basado en la ruta del archivo.
 */
function generateBookId(filePath: string): string {
  // cyrb53: 53-bit hash, practically collision free for any real library size.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < filePath.length; i++) {
    const ch = filePath.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `book_${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

/**
 * Extrae el título del nombre del archivo (sin extensión).
 */
function extractTitle(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  return nameWithoutExt
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Obtiene la extensión del archivo en minúsculas.
 */
function getExtension(fileName: string): string {
  const match = fileName.match(/\.[^/.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Verifica si un archivo tiene una extensión soportada (.pdf, .cbr, .cbz).
 */
function isSupportedFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedFormat);
}

/**
 * Escanea recursivamente un objeto Directory buscando archivos soportados (.pdf, .cbr, .cbz).
 * Utiliza exclusivamente el método list() de la API orientada a objetos moderna de expo-file-system.
 */
/** Lets the UI render a frame between folders (directory listing is synchronous). */
const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

export async function scanDirectory(dir: any): Promise<BookFile[]> {
  const books: BookFile[] = [];

  try {
    await yieldToUI();
    if (!dir.exists) {
      return books;
    }

    // Listar contenido del directorio (devuelve array de File | Directory)
    const contents = dir.list();

    // Clasificación segura de archivos y subdirectorios
    const files: any[] = [];
    const directories: any[] = [];

    for (const item of contents) {
      // Hidden entries (".thumbnails", ".trashed-…", macOS "._file.cbz" forks) are never books.
      if ((item?.name ?? '').startsWith('.')) continue;
      if (item instanceof Directory) {
        directories.push(item);
      } else if (item) {
        // Tratar cualquier elemento no-directorio como archivo potencial
        files.push(item);
      }
    }

    // Recursión en subdirectorios aislada por carpeta para no interrumpir el escaneo general
    for (const subDir of directories) {
      try {
        const subBooks = await scanDirectory(subDir);
        books.push(...subBooks);
      } catch (subErr) {
        console.warn(`[FileScanner] Subfolder scan error:`, subDir?.uri, subErr);
      }
    }

    // Buscar imágenes en la misma carpeta que puedan servir de portada
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const coverImages = files.filter((f: any) => {
      const ext = getExtension(f?.name || '');
      return imageExtensions.includes(ext);
    });

    const findCoverForFile = (baseFileName: string) => {
      const baseName = baseFileName.replace(/\.[^/.]+$/, '').toLowerCase();
      // 1. Intentar buscar imagen con el mismo nombre exacto (ej. "Vol 1.jpg" para "Vol 1.cbr")
      const exactMatch = coverImages.find((img: any) => img.name && img.name.replace(/\.[^/.]+$/, '').toLowerCase() === baseName);
      if (exactMatch) return exactMatch.uri;

      // 2. Intentar buscar imágenes genéricas de portada en la misma carpeta ("cover.jpg", "folder.png")
      const genericMatch = coverImages.find((img: any) => {
        const name = (img.name || '').replace(/\.[^/.]+$/, '').toLowerCase();
        return name === 'cover' || name === 'folder' || name === 'portada';
      });
      if (genericMatch) return genericMatch.uri;

      return undefined;
    };

    // Procesar archivos soportados (.pdf, .cbr, .cbz)
    for (const file of files) {
      const fileName = file?.name || '';
      if (isSupportedFile(fileName)) {
        const ext = getExtension(fileName) as SupportedFormat;
        const coverUri = findCoverForFile(fileName);
        books.push({
          id: generateBookId(file.uri),
          title: extractTitle(fileName),
          fileName: fileName,
          filePath: file.uri,
          format: ext,
          fileSize: file.size || 0,
          addedAt: Date.now(),
          isFavorite: false,
          coverUri,
        });
      }
    }
  } catch (error) {
    console.warn(`[FileScanner] Error scanning directory ${dir.uri}:`, error);
  }

  return books;
}
