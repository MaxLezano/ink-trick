/**
 * InkTrick OS library folder and book import.
 *
 * The tablet keeps every book in one folder, /sdcard/InkTrick (created by setup-tablet.ps1 and
 * visible from a computer over USB). Books also arrive from Google Drive ("Abrir con" /
 * "Enviar a" InkTrick) or from Downloads; the native side validates them (extension + content)
 * and copies them into that folder, then the library rescans.
 */
import { Alert, NativeModules } from 'react-native';
import { useLibraryStore } from '../store/libraryStore';
import { subscribe } from './tabletControlService';

const { TabletControlModule: Native } = NativeModules;

/** SAF document of /sdcard/InkTrick: the folder picker opens there. */
export const INKTRICK_FOLDER_URI = 'content://com.android.externalstorage.documents/document/primary%3AInkTrick';

interface ImportResult {
  status: 'imported' | 'duplicate' | 'rejected' | 'error';
  name: string;
  reason?: string;
}

/**
 * The folder imports go to: only the one named InkTrick. Never another library folder such as
 * Downloads, where "moving" a book would copy it onto itself.
 */
function libraryFolderUri(): string | null {
  const folder = useLibraryStore.getState().scannedFolders.find(f => f.enabled && f.name.toLowerCase() === 'inktrick');
  return folder?.uri ?? null;
}

/** Asks for the library folder (picker opened at /sdcard/InkTrick); returns its uri or null. */
async function connectLibraryFolder(): Promise<string | null> {
  return new Promise(resolve =>
    Alert.alert(
      'Elige la carpeta InkTrick',
      'Tus libros se guardan en la carpeta InkTrick de la tablet (la misma que ves al conectarla a la computadora). En la siguiente pantalla toca "Usar esta carpeta" y luego "Permitir".',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Continuar', onPress: () => useLibraryStore.getState().addFolderAndIndex(INKTRICK_FOLDER_URI).then(resolve) },
      ],
      { cancelable: false },
    ),
  );
}

let busy = false;

/** Copies the given books into the library folder; `move` deletes the originals (Downloads). */
export async function importBooks(uris: string[], move: boolean): Promise<void> {
  if (uris.length === 0 || !Native?.importBooks || busy) return;
  busy = true;
  try {
    let folder = libraryFolderUri();
    if (!folder) {
      if (!(await connectLibraryFolder())) return;
      folder = libraryFolderUri();
      if (!folder) {
        Alert.alert('Carpeta InkTrick', 'Elige la carpeta llamada InkTrick para guardar tus libros.');
        return;
      }
    }
    const results: ImportResult[] = await Native.importBooks(uris, folder, move);
    const added = results.filter(r => r.status === 'imported');
    const repeated = results.filter(r => r.status === 'duplicate');
    const failed = results.filter(r => r.status === 'rejected' || r.status === 'error');
    if (added.length > 0) await useLibraryStore.getState().refreshLibrary(true);

    const lines: string[] = [];
    if (added.length === 1) lines.push(`Se agregó «${stripExt(added[0].name)}» a tu biblioteca.`);
    else if (added.length > 1) lines.push(`Se agregaron ${added.length} libros a tu biblioteca.`);
    if (repeated.length > 0) lines.push(repeated.length === 1 ? `«${stripExt(repeated[0].name)}» ya estaba en tu biblioteca.` : `${repeated.length} libros ya estaban en tu biblioteca.`);
    for (const f of failed.slice(0, 3)) lines.push(`«${f.name}»: ${f.reason ?? 'no se pudo importar'}`);
    if (failed.length > 3) lines.push(`Y ${failed.length - 3} archivos más no se pudieron importar.`);
    Alert.alert(added.length > 0 ? 'Libros agregados' : 'Importar libros', lines.join('\n\n'));
  } finally {
    busy = false;
  }
}

/** Picks books (starting in Downloads) and moves them into the library folder. */
export async function importFromDownloads(): Promise<void> {
  if (!Native?.pickBooksToImport) return;
  const uris: string[] = await Native.pickBooksToImport();
  await importBooks(uris, true);
}

/** Handles books shared to InkTrick now and whenever another one arrives. Returns the unsubscribe. */
export function watchSharedBooks(): () => void {
  const take = async () => {
    const uris: string[] = (await Native?.takePendingImports?.()) ?? [];
    await importBooks(uris, false);
  };
  take();
  return subscribe('onImportRequest', take);
}

const stripExt = (name: string) => name.replace(/\.(pdf|epub|cbz|cbr)$/i, '');
