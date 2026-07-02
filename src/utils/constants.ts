/**
 * InkTrick - Constantes de la Aplicación
 */
import { SupportedFormat } from './types';

// ─── Extensiones de archivo soportadas ─────────────────────────────────────
export const SUPPORTED_EXTENSIONS: SupportedFormat[] = ['.pdf'];

// ─── Tema visual fijo (oscuro) ─────────────────────────────────────────────
export const COLORS = {
  background: '#0A0A0A',
  text: '#F0F0F0',
  accent: '#CCCCCC',
  surface: '#161616',
  border: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// ─── Persistencia ──────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  LIBRARY: 'inktrick_library',
  PROGRESS: 'inktrick_progress',
  LAST_SCAN: 'inktrick_last_scan',
} as const;

// ─── UI ────────────────────────────────────────────────────────────────────
export const GRID_COLUMNS_MOBILE = 2;
export const GRID_COLUMNS_TABLET = 4;
export const TABLET_BREAKPOINT = 768;
