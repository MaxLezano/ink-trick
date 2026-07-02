/**
 * InkTrick - File Scanner Service
 * Escanea directorios utilizando la API orientada a objetos moderna de expo-file-system.
 * Solo soporta archivos PDF.
 */
import { File, Directory } from 'expo-file-system';
import { BookFile, SupportedFormat } from '../utils/types';
import { SUPPORTED_EXTENSIONS } from '../utils/constants';

/**
 * Genera un ID único basado en la ruta del archivo.
 */
function generateBookId(filePath: string): string {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `book_${Math.abs(hash).toString(36)}`;
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
 * Verifica si un archivo tiene una extensión soportada (.pdf).
 */
function isSupportedFile(fileName: string): boolean {
  const ext = getExtension(fileName);
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedFormat);
}

/**
 * Escanea recursivamente un objeto Directory buscando archivos PDF.
 * Utiliza exclusivamente el método list() de la API orientada a objetos moderna de expo-file-system.
 */
export async function scanDirectory(dir: any): Promise<BookFile[]> {
  const books: BookFile[] = [];

  try {
    if (!dir.exists) {
      return books;
    }

    // Listar contenido del directorio (devuelve array de File | Directory)
    const contents = dir.list();
    const files = contents.filter((item: any) => item instanceof File);
    const directories = contents.filter((item: any) => item instanceof Directory);

    // Recursión en subdirectorios
    for (const subDir of directories) {
      const subBooks = await scanDirectory(subDir);
      books.push(...subBooks);
    }

    // Buscar imágenes en la misma carpeta que puedan servir de portada
    const imageExtensions = ['.jpg', '.jpeg', '.png'];
    const coverImages = files.filter((f: any) => {
      const ext = getExtension(f.name);
      return imageExtensions.includes(ext);
    });

    const findCoverForFile = (pdfName: string) => {
      const pdfBase = pdfName.replace(/\.[^/.]+$/, '').toLowerCase();
      // 1. Intentar buscar imagen con el mismo nombre exacto (ej. "Vol 1.jpg" para "Vol 1.pdf")
      const exactMatch = coverImages.find((img: any) => img.name.replace(/\.[^/.]+$/, '').toLowerCase() === pdfBase);
      if (exactMatch) return exactMatch.uri;

      // 2. Intentar buscar imágenes genéricas de portada en la misma carpeta ("cover.jpg", "folder.png")
      const genericMatch = coverImages.find((img: any) => {
        const name = img.name.replace(/\.[^/.]+$/, '').toLowerCase();
        return name === 'cover' || name === 'folder';
      });
      if (genericMatch) return genericMatch.uri;

      return undefined;
    };

    // Procesar archivos PDF
    for (const file of files) {
      const fileName = file.name;
      if (isSupportedFile(fileName)) {
        const ext = getExtension(fileName) as SupportedFormat;
        const coverUri = findCoverForFile(fileName);
        books.push({
          id: generateBookId(file.uri),
          title: extractTitle(fileName),
          fileName: fileName,
          filePath: file.uri,
          format: ext,
          fileSize: file.size,
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

/**
 * Escanea un directorio específico por ruta string (compatibilidad).
 */
export async function scanCustomDirectory(dirPath: string): Promise<BookFile[]> {
  return scanDirectory(new Directory(dirPath));
}
