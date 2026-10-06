import { create } from 'zustand';
import { Directory } from 'expo-file-system';
import { Alert } from 'react-native';
import { BookFile, ReadingProgress } from '../utils/types';
import { scanDirectory } from '../services/fileScanner';
import * as StorageService from '../services/storageService';
import * as BookCache from '../services/bookCacheService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizeUri = (uri: string) => uri.replace(/\/+$/, '');

/** Storage path of a SAF tree uri ("primary:Libros/Anime"), to compare folders across uris. */
function treePath(uri: string): string {
  const raw = uri.split('/tree/')[1]?.split('/document/')[0] ?? uri;
  try {
    return decodeURIComponent(raw).replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

/** -1: `a` is inside `b`; 1: `a` contains `b`; 0: unrelated (or the same folder). */
function nesting(a: string, b: string): -1 | 0 | 1 {
  const pa = treePath(a);
  const pb = treePath(b);
  if (pa.startsWith(`${pb}/`)) return -1;
  if (pb.startsWith(`${pa}/`)) return 1;
  return 0;
}

/** True if the book lives inside the scanned folder (exact prefix, "Manga" ≠ "Manga2"). */
export function belongsToFolder(book: BookFile, folderUri: string): boolean {
  const base = normalizeUri(folderUri);
  return book.filePath === base || book.filePath.startsWith(`${base}/`);
}

function isInEnabledFolder(book: BookFile, folders: StorageService.ScannedFolder[]): boolean {
  return folders.some(f => f.enabled && belongsToFolder(book, f.uri));
}

function folderNameFromUri(uri: string): string {
  try {
    const parts = decodeURIComponent(uri).split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? 'Manga';
    return last.replace(/^primary:/i, '').split(':').pop()!.split('/').pop() || 'Manga';
  } catch {
    return 'Manga';
  }
}

/**
 * Merges freshly scanned files with the stored library, keeping ids (progress), favorites,
 * collections and custom covers. Books are matched by path; name + size is the fallback for
 * files whose URI changed (e.g. the folder was re-added).
 */
function mergeScan(existing: BookFile[], scanned: BookFile[]): { merged: BookFile[]; added: number } {
  const byPath = new Map(existing.map(b => [b.filePath, b]));
  const byNameSize = new Map(existing.map(b => [`${b.fileName.toLowerCase()}|${b.fileSize}`, b]));
  const scannedPaths = new Set(scanned.map(f => f.filePath));
  const usedIds = new Set<string>();
  let added = 0;

  const merged = scanned.map(file => {
    let prev = byPath.get(file.filePath);
    if (!prev) {
      // Name + size only identifies a *moved* file: its old path must be gone and its id unused,
      // otherwise two copies of the same file would share one id (and one progress).
      const candidate = byNameSize.get(`${file.fileName.toLowerCase()}|${file.fileSize}`);
      if (candidate && !scannedPaths.has(candidate.filePath) && !usedIds.has(candidate.id)) prev = candidate;
    }
    if (!prev || usedIds.has(prev.id)) {
      added++;
      return file;
    }
    usedIds.add(prev.id);
    return {
      ...file,
      id: prev.id,
      isFavorite: prev.isFavorite,
      lastOpenedAt: prev.lastOpenedAt,
      addedAt: prev.addedAt,
      folder: prev.folder ?? file.folder,
      coverUri: prev.coverUri ?? file.coverUri,
      coverPage: prev.coverPage,
      pageCount: prev.pageCount,
      order: prev.order,
      // Metadata read from the file itself replaces the file-name title.
      ...(prev.infoChecked
        ? {
            title: prev.title,
            author: prev.author,
            series: prev.series,
            volume: prev.volume,
            summary: prev.summary,
            infoChecked: true,
          }
        : {}),
    };
  });
  return { merged, added };
}

// The refresh currently running, so a manual refresh can wait for the silent one at launch.
let refreshInFlight: Promise<void> | null = null;

// Background cover generation (bounded concurrency, results streamed into the store).
let coverJobRunning = false;
let coverJobRequested = false;

async function generateMissingCovers(get: () => LibraryStore, set: (partial: Partial<LibraryStore>) => void) {
  if (coverJobRunning) {
    // Books added meanwhile (new folder, rescan) are picked up by one more pass.
    coverJobRequested = true;
    return;
  }
  coverJobRunning = true;
  try {
    // Missing covers, plus legacy full-resolution covers (migrated to light thumbnails).
    const pending = get().books.filter(b => !BookCache.isCurrentCover(b.coverUri));
    const BATCH = 2;
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const results = await Promise.all(chunk.map(b => BookCache.generateCover(b, b.coverPage ?? 1)));
      const updates = new Map<string, { uri: string; pageCount?: number }>();
      chunk.forEach((b, idx) => {
        const r = results[idx];
        if (r) updates.set(b.id, r);
      });
      if (updates.size > 0) {
        const books = get().books.map(b => {
          const u = updates.get(b.id);
          return u ? { ...b, coverUri: u.uri, pageCount: u.pageCount ?? b.pageCount } : b;
        });
        set({ books });
      }
    }
    if (pending.length > 0) await StorageService.saveLibrary(get().books);
    await readMissingInfo(get, set);
  } finally {
    coverJobRunning = false;
  }
  if (coverJobRequested) {
    coverJobRequested = false;
    generateMissingCovers(get, set);
  }
}

/** Display title from embedded metadata: "Series Vol. 3: Title", "Title", or null. */
function titleFromInfo(info: BookCache.BookInfo): string | null {
  const series = info.series?.trim();
  const title = info.title?.trim();
  if (!series) return title || null;
  const index = info.volume ? ` Vol. ${info.volume}` : info.number ? ` #${info.number}` : '';
  const base = `${series}${index}`;
  return title && title.toLowerCase() !== series.toLowerCase() ? `${base}: ${title}` : base;
}

/** Reads ComicInfo.xml (CBZ) / EPUB metadata once per book, after the covers. */
async function readMissingInfo(get: () => LibraryStore, set: (partial: Partial<LibraryStore>) => void) {
  const pending = get().books.filter(b => !b.infoChecked && BookCache.hasEmbeddedInfo(b.format));
  for (const book of pending) {
    const info = await BookCache.readBookInfo(book);
    const title = info ? titleFromInfo(info) : null;
    const books = get().books.map(b =>
      b.id === book.id
        ? {
            ...b,
            infoChecked: true,
            title: title ?? b.title,
            author: info?.author?.trim() || b.author,
            series: info?.series?.trim() || b.series,
            volume: info?.volume ?? info?.number ?? b.volume,
            summary: info?.summary?.trim() || b.summary,
          }
        : b,
    );
    set({ books });
  }
  if (pending.length > 0) await StorageService.saveLibrary(get().books);
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface LibraryStore {
  books: BookFile[];
  progress: Record<string, ReadingProgress>;
  scannedFolders: StorageService.ScannedFolder[];
  searchQuery: string;
  isScanning: boolean;
  isLoaded: boolean;

  loadLibrary: () => Promise<void>;
  reloadProgress: () => Promise<void>;
  /** Picks a folder (the picker opens at `initialUri` when given) and indexes it; returns its uri. */
  addFolderAndIndex: (initialUri?: string) => Promise<string | null>;
  toggleFolder: (uri: string) => Promise<void>;
  deleteFolder: (uri: string) => Promise<void>;
  refreshLibrary: (silent?: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  updateLastOpened: (bookId: string) => Promise<void>;
  setBookPageCount: (bookId: string, pageCount: number) => void;
  updateBookCover: (bookId: string, pageNumber: number) => Promise<string | undefined>;

  toggleFavoriteBatch: (bookIds: string[]) => Promise<void>;
  markAsReadBatch: (bookIds: string[]) => Promise<void>;
  markAsUnreadBatch: (bookIds: string[]) => Promise<void>;
  deleteBooksBatch: (bookIds: string[]) => Promise<void>;
  assignFolderBatch: (bookIds: string[], folderName: string) => Promise<void>;
  setReadingOrder: (orderedIds: string[] | null, collectionIds?: string[]) => Promise<void>;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  progress: {},
  scannedFolders: [],
  searchQuery: '',
  isScanning: false,
  isLoaded: false,

  loadLibrary: async () => {
    try {
      const [books, progress, scannedFolders] = await Promise.all([
        StorageService.getLibrary(),
        StorageService.getAllProgress(),
        StorageService.getScannedFolders(),
      ]);
      const cleanedFolders = scannedFolders.map(f => ({ ...f, name: f.name.replace(/^primary:/i, '') }));
      set({ books, progress, scannedFolders: cleanedFolders, isLoaded: true });
      // Covers that were purged by the OS (old versions stored them in cache) are rebuilt quietly.
      generateMissingCovers(get, set);
    } catch (error) {
      console.error('[LibraryStore] Error loading library:', error);
      set({ isLoaded: true });
    }
  },

  reloadProgress: async () => {
    try {
      const progress = await StorageService.getAllProgress();
      set({ progress: { ...progress } });
    } catch (error) {
      console.error('[LibraryStore] Error reloading progress:', error);
    }
  },

  addFolderAndIndex: async (initialUri?: string) => {
    // The picker returns its own Directory flavour; only uri/list() are used.
    let directory: any = null;
    try {
      directory = await Directory.pickDirectoryAsync(initialUri);
    } catch {
      return null; // Picker cancelled.
    }
    if (!directory) return null;

    const folders = get().scannedFolders;
    if (folders.some(f => normalizeUri(f.uri) === normalizeUri(directory.uri) || treePath(f.uri) === treePath(directory.uri))) {
      Alert.alert('Carpeta ya agregada', 'Esta carpeta ya se encuentra en tu lista de carpetas.');
      return null;
    }
    // Overlapping folders would list the same books twice.
    const parent = folders.find(f => nesting(directory.uri, f.uri) === -1);
    if (parent) {
      Alert.alert('Carpeta ya incluida', `Esta carpeta está dentro de "${parent.name}", que ya está en tu biblioteca.`);
      return null;
    }
    const children = folders.filter(f => nesting(directory.uri, f.uri) === 1);
    if (children.length > 0) {
      Alert.alert(
        'Carpeta superpuesta',
        `Esta carpeta contiene ${children.map(c => `"${c.name}"`).join(', ')}, que ya ${children.length === 1 ? 'está' : 'están'} en tu biblioteca. Elige una de esas carpetas o una carpeta nueva.`,
      );
      return null;
    }

    const newFolder: StorageService.ScannedFolder = {
      uri: directory.uri,
      name: folderNameFromUri(directory.uri),
      enabled: true,
    };
    const updatedFolders = [...folders, newFolder];
    set({ scannedFolders: updatedFolders, isScanning: true });
    await StorageService.saveScannedFolders(updatedFolders);

    try {
      const excluded = new Set(await StorageService.getExcludedPaths());
      const scanned = (await scanDirectory(directory)).filter(b => !excluded.has(b.filePath));
      const existing = get().books;
      const { merged } = mergeScan(existing, scanned);
      const mergedPaths = new Set(merged.map(b => b.filePath));
      const books = [...existing.filter(b => !mergedPaths.has(b.filePath)), ...merged];
      set({ books, isScanning: false });
      await StorageService.saveLibrary(books);
      generateMissingCovers(get, set);
    } catch (error) {
      console.error('[LibraryStore] Error scanning folder:', error);
      set({ isScanning: false });
      Alert.alert('Error', 'No se pudo leer la carpeta seleccionada.');
    }
    return directory.uri as string;
  },

  toggleFolder: async (uri: string) => {
    const folders = get().scannedFolders.map(f => (f.uri === uri ? { ...f, enabled: !f.enabled } : f));
    set({ scannedFolders: folders });
    await StorageService.saveScannedFolders(folders);
  },

  deleteFolder: async (uri: string) => {
    const folders = get().scannedFolders.filter(f => f.uri !== uri);
    const removed = get().books.filter(b => belongsToFolder(b, uri));
    const books = get().books.filter(b => !belongsToFolder(b, uri));
    set({ scannedFolders: folders, books });
    await StorageService.saveScannedFolders(folders);
    await StorageService.saveLibrary(books);
    removed.forEach(b => BookCache.deleteBookCache(b.id));
  },

  /**
   * Rescans every enabled folder: adds new files, drops files that no longer exist and keeps
   * all per-book metadata. Folders that fail to scan (e.g. revoked permission) are left untouched.
   */
  refreshLibrary: async (silent = false) => {
    const enabledFolders = get().scannedFolders.filter(f => f.enabled);
    if (enabledFolders.length === 0) {
      if (!silent) {
        Alert.alert('Actualizar biblioteca', 'No tienes ninguna carpeta habilitada. Agrega o habilita una primero.');
      }
      return;
    }

    // A scan is already running (e.g. the silent one at launch): show it and wait for it.
    if (refreshInFlight) {
      if (!silent) {
        set({ isScanning: true });
        await refreshInFlight;
        set({ isScanning: false });
        Alert.alert('Biblioteca actualizada', `${get().books.length} libros en total`);
      }
      return;
    }
    // Silent refreshes (on app start) update the library in place without blocking the UI.
    set({ isScanning: !silent });
    let finish: () => void = () => {};
    refreshInFlight = new Promise<void>(resolve => (finish = resolve));
    // Give React a frame to paint the loader before the (synchronous) folder listing starts.
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      const excluded = new Set(await StorageService.getExcludedPaths());
      const scanned: BookFile[] = [];
      const scannedFolderUris: string[] = [];

      for (const folder of enabledFolders) {
        try {
          const dir = new Directory(folder.uri);
          if (!dir.exists) continue;
          scanned.push(...(await scanDirectory(dir)));
          scannedFolderUris.push(folder.uri);
        } catch (err) {
          console.warn(`[LibraryStore] Error scanning folder: ${folder.name}`, err);
        }
      }

      const existing = get().books;
      const { merged, added } = mergeScan(existing, scanned.filter(b => !excluded.has(b.filePath)));
      const mergedPaths = new Set(merged.map(b => b.filePath));
      const kept = existing.filter(
        b => !mergedPaths.has(b.filePath) && !scannedFolderUris.some(uri => belongsToFolder(b, uri)),
      );
      const removed = existing.filter(
        b => !mergedPaths.has(b.filePath) && scannedFolderUris.some(uri => belongsToFolder(b, uri)),
      );
      const books = [...kept, ...merged];

      set({ books, isScanning: false });
      await StorageService.saveLibrary(books);
      removed.forEach(b => BookCache.deleteBookCache(b.id));
      generateMissingCovers(get, set);

      if (!silent) {
        const parts = [`${books.length} libros en total`];
        if (added > 0) parts.push(`${added} nuevos`);
        if (removed.length > 0) parts.push(`${removed.length} ya no existen`);
        Alert.alert('Biblioteca actualizada', parts.join(' · '));
      }
    } catch (error) {
      console.error('[LibraryStore] Error refreshing library:', error);
      set({ isScanning: false });
      if (!silent) Alert.alert('Error', 'No se pudo sincronizar la biblioteca.');
    } finally {
      refreshInFlight = null;
      finish();
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  updateLastOpened: async (bookId: string) => {
    const books = get().books.map(b => (b.id === bookId ? { ...b, lastOpenedAt: Date.now() } : b));
    set({ books });
    await StorageService.saveLibrary(books);
  },

  setBookPageCount: (bookId: string, pageCount: number) => {
    const book = get().books.find(b => b.id === bookId);
    if (!book || pageCount <= 0 || book.pageCount === pageCount) return;
    const books = get().books.map(b => (b.id === bookId ? { ...b, pageCount } : b));
    set({ books });
    StorageService.saveLibrary(books);
  },

  updateBookCover: async (bookId: string, pageNumber: number) => {
    const book = get().books.find(b => b.id === bookId);
    if (!book || pageNumber < 1) return undefined;
    if (book.pageCount && pageNumber > book.pageCount) return undefined;

    const result = await BookCache.generateCover(book, pageNumber);
    if (!result) return undefined;
    const books = get().books.map(b =>
      b.id === bookId
        ? { ...b, coverUri: result.uri, coverPage: pageNumber, pageCount: result.pageCount ?? b.pageCount }
        : b,
    );
    set({ books });
    await StorageService.saveLibrary(books);
    return result.uri;
  },

  toggleFavoriteBatch: async (bookIds: string[]) => {
    const ids = new Set(bookIds);
    const current = get().books;
    const allFavorites = current.filter(b => ids.has(b.id)).every(b => b.isFavorite);
    const books = current.map(b => (ids.has(b.id) ? { ...b, isFavorite: !allFavorites } : b));
    set({ books });
    await StorageService.saveLibrary(books);
  },

  markAsReadBatch: async (bookIds: string[]) => {
    const { progress, books } = get();
    const updated = { ...progress };
    const now = Date.now();
    for (const id of bookIds) {
      const book = books.find(b => b.id === id);
      const total = progress[id]?.totalPages || book?.pageCount || 0;
      const entry: ReadingProgress = {
        bookId: id,
        currentPage: Math.max(0, total - 1),
        totalPages: total,
        percentage: 100,
        lastReadAt: now,
      };
      updated[id] = entry;
      await StorageService.saveProgress(entry, true);
    }
    set({ progress: updated });
  },

  markAsUnreadBatch: async (bookIds: string[]) => {
    const { progress } = get();
    const updated = { ...progress };
    const now = Date.now();
    for (const id of bookIds) {
      const entry: ReadingProgress = {
        bookId: id,
        currentPage: 0,
        totalPages: progress[id]?.totalPages ?? 0,
        percentage: 0,
        lastReadAt: now,
      };
      updated[id] = entry;
      await StorageService.saveProgress(entry, true);
    }
    set({ progress: updated });
  },

  /** Removes books from the library (files stay on disk and are skipped on future rescans). */
  deleteBooksBatch: async (bookIds: string[]) => {
    const ids = new Set(bookIds);
    const removed = get().books.filter(b => ids.has(b.id));
    const books = get().books.filter(b => !ids.has(b.id));
    const progress = { ...get().progress };
    bookIds.forEach(id => delete progress[id]);
    set({ books, progress });

    const excluded = await StorageService.getExcludedPaths();
    await StorageService.saveExcludedPaths([...new Set([...excluded, ...removed.map(b => b.filePath)])]);
    await StorageService.forgetBooks(bookIds);
    await StorageService.saveLibrary(books);
    removed.forEach(b => BookCache.deleteBookCache(b.id));
  },

  /**
   * Saves the manual reading order of a collection (`orderedIds`, first to last), or clears it
   * (`null`) for the books in `collectionIds` so they fall back to natural order.
   */
  setReadingOrder: async (orderedIds: string[] | null, collectionIds: string[] = []) => {
    const position = new Map((orderedIds ?? []).map((id, index) => [id, index]));
    const cleared = new Set(orderedIds ? [] : collectionIds);
    const books = get().books.map(b => {
      if (position.has(b.id)) return { ...b, order: position.get(b.id) };
      if (cleared.has(b.id)) return { ...b, order: undefined };
      return b;
    });
    set({ books });
    await StorageService.saveLibrary(books);
  },

  assignFolderBatch: async (bookIds: string[], folderName: string) => {
    const ids = new Set(bookIds);
    const folder = folderName.trim() || undefined;
    const books = get().books.map(b => (ids.has(b.id) ? { ...b, folder } : b));
    set({ books });
    await StorageService.saveLibrary(books);
  },
}));

// ─── Pure selectors (memoize in components with useMemo) ─────────────────────

export function selectActiveBooks(books: BookFile[], folders: StorageService.ScannedFolder[]): BookFile[] {
  return books.filter(b => isInEnabledFolder(b, folders));
}

export function selectRecent(activeBooks: BookFile[], limit = 20): BookFile[] {
  return activeBooks
    .filter(b => b.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit);
}

export function matchesQuery(book: BookFile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    book.title.toLowerCase().includes(q) ||
    book.fileName.toLowerCase().includes(q) ||
    (book.author ?? '').toLowerCase().includes(q) ||
    (book.series ?? '').toLowerCase().includes(q) ||
    (book.folder ?? '').toLowerCase().includes(q)
  );
}
