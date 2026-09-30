/**
 * InkTrick - Constantes de la Aplicación
 */
import { SupportedFormat } from './types';

// ─── Extensiones de archivo soportadas ─────────────────────────────────────
export const SUPPORTED_EXTENSIONS: SupportedFormat[] = ['.pdf', '.cbr', '.cbz', '.epub'];

// EPUB progress is a position in [0, EPUB_POSITIONS - 1] (text offset), since pages depend on the font.
export const EPUB_POSITIONS = 10000;

// ─── Tema visual fijo (oscuro) ─────────────────────────────────────────────
export const COLORS = {
  background: '#0A0A0A',
  text: '#F0F0F0',
  accent: '#CCCCCC',
  surface: '#161616',
  border: '#2A2A2A',
  overlay: 'rgba(0, 0, 0, 0.7)',
  seal: '#C8412E',   // shu-iro (vermilion) of a hanko stamp: "finished" marks
  sakura: '#F4A7B9', // favorites
};
