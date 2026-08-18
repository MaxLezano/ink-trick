import { create } from 'zustand';
import { Directory } from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { BookFile, LibrarySection, ReadingProgress } from '../utils/types';
import { scanDirectory } from '../services/fileScanner';
import * as StorageService from '../services/storageService';
import * as ComicService from '../services/comicService';

// Helper para generar miniatura de la página del PDF (por defecto 0)
async function generatePdfThumbnail(filePath: string, pageIndex: number = 0): Promise<string | undefined> {
  try {
    const cleanPath = Platform.OS === 'android' ? filePath.replace('file://', '') : filePath;
    const result = await PdfThumbnail.generate(cleanPath, Math.max(0, pageIndex));
    return result.uri;
  } catch (e) {
    console.warn('[LibraryStore] Failed to generate PDF thumbnail:', filePath, e);
    return undefined;
  }
}

// Helper unificado para generar miniatura según el formato
async function generateBookCover(book: BookFile): Promise<string | undefined> {
  if (book.format === '.cbr' || book.format === '.cbz') {
    return ComicService.extractCover(book.filePath, book.id);
  } else {
    return generatePdfThumbnail(book.filePath, book.coverPage ? book.coverPage - 1 : 0);
  }
}

// Helper para procesar portadas en lotes paralelos acotados (evita saturar memoria en dispositivos lentos)
async function generateCoversInBatches(books: BookFile[], batchSize: number = 3): Promise<void> {
  const booksToProcess = books.filter(b => !b.coverUri);
  for (let i = 0; i < booksToProcess.length; i += batchSize) {
    const chunk = booksToProcess.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async book => {
        try {
          const thumbUri = await generateBookCover(book);
          if (thumbUri) {
            book.coverUri = thumbUri;
          }
        } catch (err) {
          console.warn('[LibraryStore] Error in batch cover generation:', book.title, err);
        }
      })
    );
  }
}

interface LibraryStore {
  // Estado
  books: BookFile[];
  progress: Record<string, ReadingProgress>;
  scannedFolders: StorageService.ScannedFolder[];
  searchQuery: string;
  activeSection: LibrarySection;
  isScanning: boolean;
  isLoaded: boolean;

  // Acciones
  loadLibrary: () => Promise<void>;
  reloadProgress: () => Promise<void>;
  addFolderAndIndex: () => Promise<void>;
  toggleFolder: (uri: string) => Promise<void>;
  deleteFolder: (uri: string) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setActiveSection: (section: LibrarySection) => void;
  toggleFavorite: (bookId: string) => Promise<void>;
  updateLastOpened: (bookId: string) => Promise<void>;
  updateBookCover: (bookId: string, pageNumber: number) => Promise<string | undefined>;

  // Acciones en lote (Multi-selección)
  toggleFavoriteBatch: (bookIds: string[]) => Promise<void>;
  markAsReadBatch: (bookIds: string[]) => Promise<void>;
  deleteBooksBatch: (bookIds: string[]) => Promise<void>;
  assignFolderBatch: (bookIds: string[], folderName: string) => Promise<void>;

  // Selectores computados
  getFilteredBooks: () => BookFile[];
  getRecentBooks: () => BookFile[];
  getFavoriteBooks: () => BookFile[];
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  // ─── Estado inicial ────────────────────────────────────────────────────
  books: [],
  progress: {},
  scannedFolders: [],
  searchQuery: '',
  activeSection: 'recent',
  isScanning: false,
  isLoaded: false,

  // ─── Acciones ──────────────────────────────────────────────────────────

  /**
   * Carga la biblioteca desde el almacenamiento persistido.
   */
  loadLibrary: async () => {
    try {
      const books = await StorageService.getLibrary();
      const progress = await StorageService.getAllProgress();
      const scannedFolders = await StorageService.getScannedFolders();
      const cleanedFolders = scannedFolders.map(f => ({
        ...f,
        name: f.name.replace(/^primary:/i, ''),
      }));
      set({ books, progress, scannedFolders: cleanedFolders, isLoaded: true });
    } catch (error) {
      console.error('[LibraryStore] Error loading library:', error);
      set({ isLoaded: true });
    }
  },

  /**
   * Recarga el progreso de lectura desde el almacenamiento persistido.
   */
  reloadProgress: async () => {
    try {
      const progress = await StorageService.getAllProgress();
      set({ progress });
    } catch (error) {
      console.error('[LibraryStore] Error reloading progress:', error);
    }
  },

  /**
   * Flujo: Abre el selector de directorios nativo de Android/iOS (pickDirectoryAsync)
   * -> El usuario selecciona una carpeta de su elección concediendo permisos en runtime
   * -> Escanea y agrega de forma recursiva todos los PDFs de la carpeta seleccionada.
   */
  addFolderAndIndex: async () => {
    set({ isScanning: true });
    try {
      // Abre el selector de carpetas nativo del dispositivo (SAF en Android, DocumentPicker en iOS)
      const directory = await Directory.pickDirectoryAsync();
      if (!directory) {
        set({ isScanning: false });
        return;
      }

      const folders = get().scannedFolders;
      if (folders.some(f => f.uri === directory.uri)) {
        set({ isScanning: false });
        Alert.alert('Carpeta ya agregada', 'Esta carpeta ya se encuentra en tu lista de carpetas.');
        return;
      }

      let folderName = 'Manga';
      try {
        const decoded = decodeURIComponent(directory.uri);
        const parts = decoded.split('/');
        const cleanParts = parts.filter(Boolean);
        if (cleanParts.length > 0) {
          folderName = cleanParts[cleanParts.length - 1];
          // Strip Android content URI prefix like "primary:"
          folderName = folderName.replace(/^primary:/i, '');
        }
      } catch (e) {
        // Ignorar
      }

      const newFolder: StorageService.ScannedFolder = {
        uri: directory.uri,
        name: folderName,
        enabled: true,
      };

      const updatedFolders = [...folders, newFolder];
      set({ scannedFolders: updatedFolders });
      await StorageService.saveScannedFolders(updatedFolders);

      // Escaneo recursivo orientado a objetos de la carpeta seleccionada
      const scannedBooks = await scanDirectory(directory as any);
      const existingBooks = get().books;

      // Unir los libros recién escaneados con metadatos de libros existentes (ej: favoritos, recientes)
      const mergedScanned = scannedBooks.map(scanned => {
        const existing = existingBooks.find(
          b => b.fileName.toLowerCase() === scanned.fileName.toLowerCase()
        );
        if (existing) {
          return {
            ...scanned,
            id: existing.id, // Mantenemos el ID original si ya existía para no romper el progreso
            isFavorite: existing.isFavorite,
            lastOpenedAt: existing.lastOpenedAt,
            addedAt: existing.addedAt,
            folder: existing.folder || scanned.folder, // Conservamos la carpeta si ya tenía una asignada
            coverUri: existing.coverUri || scanned.coverUri,
            coverPage: existing.coverPage,
          };
        }
        return scanned;
      });

      // Combinar los libros existentes con los nuevos escaneados sin duplicar por nombre de archivo (fileName)
      const allBooks = [...existingBooks];
      for (const book of mergedScanned) {
        if (!allBooks.some(b => b.fileName.toLowerCase() === book.fileName.toLowerCase())) {
          allBooks.push(book);
        }
      }

      // Generar miniaturas en paralelo acotado (máx 3 a la vez) para no bloquear UI ni memoria
      await generateCoversInBatches(allBooks, 3);

      set({ books: allBooks, isScanning: false });
      await StorageService.saveLibrary(allBooks);
    } catch (error) {
      console.error('[LibraryStore] Error scanning folder:', error);
      set({ isScanning: false });
    }
  },

  toggleFolder: async (uri: string) => {
    const folders = get().scannedFolders.map(f =>
      f.uri === uri ? { ...f, enabled: !f.enabled } : f
    );
    set({ scannedFolders: folders });
    await StorageService.saveScannedFolders(folders);
  },

  deleteFolder: async (uri: string) => {
    const folders = get().scannedFolders.filter(f => f.uri !== uri);
    // Eliminar también los libros que pertenecen a esa carpeta de la base de datos
    const books = get().books.filter(book => !book.filePath.startsWith(uri));
    
    set({ scannedFolders: folders, books });
    await StorageService.saveScannedFolders(folders);
    await StorageService.saveLibrary(books);
  },

  /**
   * Vuelve a escanear automáticamente las carpetas activas.
   */
  refreshLibrary: async () => {
    const enabledFolders = get().scannedFolders.filter(f => f.enabled);
    if (enabledFolders.length === 0) {
      Alert.alert(
        'Actualizar biblioteca',
        'No tienes ninguna carpeta habilitada en el Gestor de carpetas. Habilita una primero.'
      );
      return;
    }

    set({ isScanning: true });
    try {
      console.log('[LibraryStore] Refreshing library from enabled folders');
      const allScannedBooks: BookFile[] = [];

      for (const folder of enabledFolders) {
        try {
          const scanned = await scanDirectory(new Directory(folder.uri));
          allScannedBooks.push(...scanned);
        } catch (err) {
          console.warn(`[LibraryStore] Error scanning folder: ${folder.name}`, err);
        }
      }

      const existingBooks = get().books;

      // Fusionar libros manteniendo favoritos, carpetas, portada personalizada y progreso
      const mergedScanned = allScannedBooks.map(scanned => {
        const existing = existingBooks.find(
          b => b.fileName.toLowerCase() === scanned.fileName.toLowerCase()
        );
        if (existing) {
          return {
            ...scanned,
            id: existing.id,
            isFavorite: existing.isFavorite,
            lastOpenedAt: existing.lastOpenedAt,
            addedAt: existing.addedAt,
            folder: existing.folder || scanned.folder,
            coverUri: existing.coverUri || scanned.coverUri,
            coverPage: existing.coverPage,
          };
        }
        return scanned;
      });

      // Añadir libros nuevos
      const allBooks = [...existingBooks];
      for (const book of mergedScanned) {
        if (!allBooks.some(b => b.fileName.toLowerCase() === book.fileName.toLowerCase())) {
          allBooks.push(book);
        }
      }

      // Generar miniatura para libros nuevos en lotes paralelos
      await generateCoversInBatches(allBooks, 3);

      set({ books: allBooks, isScanning: false });
      await StorageService.saveLibrary(allBooks);
      
      Alert.alert('Éxito', '¡Biblioteca sincronizada y actualizada!');
    } catch (error) {
      console.error('[LibraryStore] Error refreshing library:', error);
      set({ isScanning: false });
      Alert.alert('Error', 'No se pudo sincronizar la biblioteca.');
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveSection: (section: LibrarySection) => set({ activeSection: section }),

  /**
   * Toggle favorito de un libro.
   */
  toggleFavorite: async (bookId: string) => {
    const books = get().books.map(book =>
      book.id === bookId ? { ...book, isFavorite: !book.isFavorite } : book
    );
    set({ books });
    await StorageService.saveLibrary(books);
  },

  /**
   * Actualiza la última vez que se abrió un libro.
   */
  updateLastOpened: async (bookId: string) => {
    const books = get().books.map(book =>
      book.id === bookId ? { ...book, lastOpenedAt: Date.now() } : book
    );
    set({ books });
    await StorageService.saveLibrary(books);
  },

  /**
   * Cambia la portada del libro generando/extrayendo la miniatura de la página especificada (1-indexed).
   */
  updateBookCover: async (bookId: string, pageNumber: number) => {
    const book = get().books.find(b => b.id === bookId);
    if (!book || pageNumber < 1) return undefined;

    try {
      let newCoverUri: string | undefined;

      if (book.format === '.cbr' || book.format === '.cbz') {
        // Para cómics, verificar si las páginas ya están extraídas
        const pages = await ComicService.extractComicPages(book.id, book.filePath);
        const targetIndex = pageNumber - 1;
        if (pages.length > 0 && targetIndex >= 0 && targetIndex < pages.length) {
          newCoverUri = pages[targetIndex];
        }
      } else {
        // Para PDFs, generar miniatura de la página solicitada (0-indexed en nativo)
        const cleanPath = Platform.OS === 'android' ? book.filePath.replace('file://', '') : book.filePath;
        const result = await PdfThumbnail.generate(cleanPath, pageNumber - 1, 100);
        newCoverUri = result.uri;
      }

      if (newCoverUri) {
        const books = get().books.map(b =>
          b.id === bookId ? { ...b, coverUri: newCoverUri, coverPage: pageNumber } : b
        );
        set({ books });
        await StorageService.saveLibrary(books);
        return newCoverUri;
      }
    } catch (err) {
      console.error('[LibraryStore] Error updating cover for book:', bookId, err);
    }
    return undefined;
  },

  // ─── Acciones en lote ──────────────────────────────────────────────────

  /**
   * Modifica en lote el estado de favoritos. Si todos son favoritos, los quita.
   * Si no, los marca a todos como favoritos.
   */
  toggleFavoriteBatch: async (bookIds: string[]) => {
    const currentBooks = get().books;
    const selectedBooks = currentBooks.filter(b => bookIds.includes(b.id));
    const allAreFavorites = selectedBooks.every(b => b.isFavorite);

    const books = currentBooks.map(book => {
      if (bookIds.includes(book.id)) {
        return { ...book, isFavorite: !allAreFavorites };
      }
      return book;
    });

    set({ books });
    await StorageService.saveLibrary(books);
  },

  /**
   * Marca en lote los libros seleccionados con 100% de progreso de lectura.
   */
  markAsReadBatch: async (bookIds: string[]) => {
    const { progress } = get();
    const updatedProgress = { ...progress };
    const now = Date.now();

    for (const id of bookIds) {
      const existing = progress[id];
      const totalPages = existing && existing.totalPages > 0 ? existing.totalPages : 1;
      const newProg: ReadingProgress = {
        bookId: id,
        currentPage: totalPages - 1,
        totalPages: totalPages,
        percentage: 100,
        lastReadAt: now,
      };
      updatedProgress[id] = newProg;
      await StorageService.saveProgress(newProg, true);
    }

    set({ progress: updatedProgress });
  },

  /**
   * Elimina en lote varios libros de la biblioteca.
   */
  deleteBooksBatch: async (bookIds: string[]) => {
    const books = get().books.filter(book => !bookIds.includes(book.id));
    set({ books });
    await StorageService.saveLibrary(books);
  },

  /**
   * Asigna una carpeta/colección en lote a los libros seleccionados.
   */
  assignFolderBatch: async (bookIds: string[], folderName: string) => {
    const normalizedFolder = folderName.trim() || undefined;
    const books = get().books.map(book => {
      if (bookIds.includes(book.id)) {
        return { ...book, folder: normalizedFolder };
      }
      return book;
    });

    set({ books });
    await StorageService.saveLibrary(books);
  },

  // ─── Selectores ────────────────────────────────────────────────────────

  getFilteredBooks: () => {
    const { books, scannedFolders, searchQuery, activeSection } = get();
    
    // Filtrar únicamente los libros pertenecientes a carpetas activas
    const enabledFolders = scannedFolders.filter(f => f.enabled);
    let filtered = books.filter(book =>
      enabledFolders.some(f => book.filePath.startsWith(f.uri))
    );

    // Filtrar por búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        book =>
          book.title.toLowerCase().includes(query) ||
          book.fileName.toLowerCase().includes(query)
      );
    }

    // Filtrar por sección
    switch (activeSection) {
      case 'recent':
        filtered = filtered
          .filter(b => b.lastOpenedAt)
          .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
        break;
      case 'favorites':
        filtered = filtered.filter(b => b.isFavorite);
        break;
      case 'folders':
        // Ordenado por el nombre de la carpeta (primero los que pertenecen a una carpeta)
        filtered = [...filtered].sort((a, b) => {
          if (a.folder && !b.folder) return -1;
          if (!a.folder && b.folder) return 1;
          if (a.folder && b.folder) return a.folder.localeCompare(b.folder);
          return a.title.localeCompare(b.title);
        });
        break;
    }

    return filtered;
  },

  getRecentBooks: () => {
    const { books, scannedFolders } = get();
    const enabledFolders = scannedFolders.filter(f => f.enabled);
    return books
      .filter(book => enabledFolders.some(f => book.filePath.startsWith(f.uri)))
      .filter(b => b.lastOpenedAt)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 10);
  },

  getFavoriteBooks: () => {
    const { books, scannedFolders } = get();
    const enabledFolders = scannedFolders.filter(f => f.enabled);
    return books
      .filter(book => enabledFolders.some(f => book.filePath.startsWith(f.uri)))
      .filter(b => b.isFavorite);
  },
}));
