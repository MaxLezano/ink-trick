/**
 * InkTrick - Core Type Definitions
 * Tipos centrales para el lector de PDF manga/anime.
 */

// ─── Formato soportado ─────────────────────────────────────────────────────
export type SupportedFormat = '.pdf';

// ─── Archivo de libro ──────────────────────────────────────────────────────
export interface BookFile {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  format: SupportedFormat;
  fileSize: number;
  coverUri?: string;
  author?: string;
  addedAt: number;        // timestamp
  lastOpenedAt?: number;  // timestamp
  isFavorite: boolean;
  folder?: string;
}

// ─── Progreso de lectura ───────────────────────────────────────────────────
export interface ReadingProgress {
  bookId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastReadAt: number;     // timestamp
}

// ─── Estado de la biblioteca ───────────────────────────────────────────────
export type LibrarySection = 'recent' | 'favorites' | 'folders';

// ─── Navegación ────────────────────────────────────────────────────────────
export type RootStackParamList = {
  Dashboard: undefined;
  Reader: { bookId: string; preparedPath?: string };
};
