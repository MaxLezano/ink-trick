/**
 * InkTrick - Display helpers
 */
import { BookFile } from './types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural order: "Tomo 2" before "Tomo 10". */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function sortBooksNatural(books: BookFile[]): BookFile[] {
  return [...books].sort((a, b) => naturalCompare(a.title, b.title));
}

/**
 * Reading order of a series: the manual order set by the user when present (books without one go
 * after, in natural order), otherwise natural order by title.
 */
export function sortSeries(books: BookFile[]): BookFile[] {
  return [...books].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    return ao !== bo ? ao - bo : naturalCompare(a.title, b.title);
  });
}

/**
 * Titles inside a collection usually share a long prefix ("Jujutsu Kaisen (Gege Akutami) Tomo 01").
 * Returns a map id -> short title with the shared prefix removed (cut at a word boundary), so small
 * cards show the part that actually tells volumes apart ("Tomo 01").
 */
export function shortTitles(books: BookFile[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (books.length < 2) {
    books.forEach(b => (result[b.id] = b.title));
    return result;
  }
  let prefix = books[0].title;
  for (const b of books) {
    let i = 0;
    while (i < prefix.length && i < b.title.length && prefix[i].toLowerCase() === b.title[i].toLowerCase()) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  // Cut back to the last separator so we never split a word or a number.
  const cut = Math.max(prefix.lastIndexOf(' '), prefix.lastIndexOf('-'), prefix.lastIndexOf(')'));
  const strip = cut >= 6 ? cut + 1 : 0;
  books.forEach(b => {
    let rest = b.title.slice(strip).replace(/^[\s\-–—:·)]+/, '').trim();
    // A bare number reads badly ("01"): keep the word before it ("Tomo 01", "Vol. 01").
    if (/^\d/.test(rest)) {
      const label = b.title.slice(0, strip).trim().split(/\s+/).pop() ?? '';
      if (/^[\p{L}.]+$/u.test(label)) rest = `${label} ${rest}`;
    }
    result[b.id] = rest.length >= 2 ? rest : b.title;
  });
  return result;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRelativeDate(timestamp?: number): string {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(timestamp).toLocaleDateString();
}

/** Books of the same collection (or, without one, the same folder) form a series. */
export function seriesKeyOf(book: { folder?: string; filePath: string }): string {
  if (book.folder) return `collection:${book.folder}`;
  const decoded = decodeURIComponent(book.filePath);
  return `dir:${decoded.slice(0, decoded.lastIndexOf('/'))}`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
