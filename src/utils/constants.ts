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
  // The only two accents, both taken from the logo (gold ensō on black → murasaki violet).
  gold: '#E2B84E',     // kin-iro: "finished" hanko, bookmarks, tutorial highlights
  wisteria: '#A98BD0', // fuji-iro, the light side of the logo's murasaki: favorites
  inkViolet: '#241040', // deep murasaki ink, for text drawn on gold
};
