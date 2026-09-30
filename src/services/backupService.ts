/**
 * InkTrick - Backup service
 * Exports progress, favorites, collections, settings and statistics to a JSON file chosen by the
 * user, and restores them. Books are matched by path, falling back to file name + size so a backup
 * also works after moving the files or on another device.
 */
import { Directory, File } from 'expo-file-system';
import { BookFile, ReadingStats } from '../utils/types';
import * as StorageService from './storageService';

const BACKUP_KIND = 'inktrick-backup';
const BACKUP_VERSION = 1;

interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: number;
  data: StorageService.StorageSnapshot;
}

export interface ImportResult {
  matched: number;
  total: number;
}

function stamp(date = new Date()): string {
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/** Asks for a folder and writes the backup there. Returns the file name, or null if cancelled. */
export async function exportBackup(): Promise<string | null> {
  let dir: Directory;
  try {
    dir = (await Directory.pickDirectoryAsync()) as unknown as Directory;
  } catch {
    return null;
  }
  if (!dir) return null;

  const backup: BackupFile = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: await StorageService.getSnapshot(),
  };
  const name = `inktrick-respaldo-${stamp()}.json`;
  const file = dir.createFile(name, 'application/json');
  file.write(JSON.stringify(backup));
  return name;
}

/** Asks for a backup file and merges it into the current library. Null if cancelled. */
export async function importBackup(currentBooks: BookFile[]): Promise<ImportResult | null> {
  // The picker returns its own File flavour; only text() is used.
  let picked: any;
  try {
    picked = await File.pickFileAsync(undefined, 'application/json');
  } catch {
    return null;
  }
  const file: { text: () => Promise<string> } | undefined = Array.isArray(picked) ? picked[0] : picked;
  if (!file) return null;

  let backup: BackupFile;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('El archivo no es un respaldo válido.');
  }
  if (backup?.kind !== BACKUP_KIND || !backup.data?.library) {
    throw new Error('El archivo no es un respaldo de InkTrick.');
  }

  const source = backup.data;
  const current = await StorageService.getSnapshot();
  const byPath = new Map(currentBooks.map(b => [b.filePath, b]));
  const byNameSize = new Map(currentBooks.map(b => [`${b.fileName.toLowerCase()}|${b.fileSize}`, b]));

  // Old book id -> current book id.
  const idMap = new Map<string, string>();
  for (const old of source.library) {
    const match = byPath.get(old.filePath) ?? byNameSize.get(`${old.fileName.toLowerCase()}|${old.fileSize}`);
    if (match) idMap.set(old.id, match.id);
  }

  const library = current.library.map(book => {
    const old = source.library.find(o => idMap.get(o.id) === book.id);
    if (!old) return book;
    return {
      ...book,
      isFavorite: old.isFavorite || book.isFavorite,
      folder: old.folder ?? book.folder,
      lastOpenedAt: Math.max(old.lastOpenedAt ?? 0, book.lastOpenedAt ?? 0) || undefined,
      coverPage: old.coverPage ?? book.coverPage,
      order: old.order ?? book.order,
    };
  });

  const progress = { ...current.progress };
  for (const [oldId, entry] of Object.entries(source.progress ?? {})) {
    const id = idMap.get(oldId);
    if (!id) continue;
    // Keep whichever was read more recently.
    if (!progress[id] || entry.lastReadAt > progress[id].lastReadAt) progress[id] = { ...entry, bookId: id };
  }

  const bookSettings = { ...(current.bookSettings ?? {}) };
  for (const [oldId, settings] of Object.entries(source.bookSettings ?? {})) {
    const id = idMap.get(oldId);
    if (id && !bookSettings[id]) bookSettings[id] = settings;
  }

  const stats: ReadingStats = current.stats ?? { days: {}, books: {}, finished: {} };
  const srcStats = source.stats;
  if (srcStats) {
    for (const [day, value] of Object.entries(srcStats.days ?? {})) {
      const mine = stats.days[day];
      // Same day in both: keep the larger totals instead of double counting.
      stats.days[day] = mine
        ? { seconds: Math.max(mine.seconds, value.seconds), pages: Math.max(mine.pages, value.pages) }
        : value;
    }
    for (const [oldId, value] of Object.entries(srcStats.books ?? {})) {
      const id = idMap.get(oldId);
      if (!id) continue;
      const mine = stats.books[id];
      stats.books[id] = mine
        ? { seconds: Math.max(mine.seconds, value.seconds), pages: Math.max(mine.pages, value.pages) }
        : value;
    }
    for (const [oldId, when] of Object.entries(srcStats.finished ?? {})) {
      const id = idMap.get(oldId);
      if (id && !stats.finished[id]) stats.finished[id] = when;
    }
  }

  await StorageService.replaceSnapshot({
    ...current,
    library,
    progress,
    bookSettings,
    seriesSettings: { ...(source.seriesSettings ?? {}), ...(current.seriesSettings ?? {}) },
    stats,
  });

  return { matched: idMap.size, total: source.library.length };
}
