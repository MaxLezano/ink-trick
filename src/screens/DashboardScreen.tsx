/**
 * InkTrick - Dashboard Screen
 * Library home: continue reading, favorites and collections as carousels, plus grid views for
 * recent books, a collection or search results.
 * Long press a card to select books.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BookFile, RootStackParamList } from '../utils/types';
import { COLORS } from '../utils/constants';
import { belongsToFolder, matchesQuery, selectActiveBooks, selectRecent, useLibraryStore } from '../store/libraryStore';
import { formatBytes, formatRelativeDate, shortTitles, sortBooksNatural, sortSeries } from '../utils/format';
import BookCard from '../components/library/BookCard';
import ReorderGrid from '../components/library/ReorderGrid';
import TourTarget from '../components/tour/TourTarget';
import { measureTarget, Tour, useTour } from '../components/tour/tour';
import { TOUR_STEPS, TourRun } from '../components/tour/steps';
import { getTourProgress, TourProgress } from '../services/storageService';
import {
  ArrowIcon,
  BackIcon,
  ChartIcon,
  CheckDoneIcon,
  CloseIcon,
  FolderIcon,
  ImageIcon,
  ReadIcon,
  RefreshIcon,
  SearchIcon,
  SortIcon,
  StarIcon,
  TrashIcon,
} from '../components/Icons';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Dashboard'>;
};

const UNSORTED = 'Sin clasificar';
const GRID_GAP = 12;
const H_PADDING = 20;

export default function DashboardScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = width >= 700;

  // Store (individual selectors: the screen only re-renders for data it shows).
  const books = useLibraryStore(s => s.books);
  const progress = useLibraryStore(s => s.progress);
  const scannedFolders = useLibraryStore(s => s.scannedFolders);
  const isScanning = useLibraryStore(s => s.isScanning);
  const isLoaded = useLibraryStore(s => s.isLoaded);
  const searchQuery = useLibraryStore(s => s.searchQuery);
  const actions = useMemo(() => useLibraryStore.getState(), []);

  const [section, setSection] = useState<string | null>(null); // null = home
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [foldersModalVisible, setFoldersModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [coverPageInput, setCoverPageInput] = useState('1');
  const [coverLoading, setCoverLoading] = useState(false);
  // Reorder mode of a collection: working copy of the ids, saved with "Listo".
  const [reorderIds, setReorderIds] = useState<string[] | null>(null);

  // ─── Derived data ────────────────────────────────────────────────────────
  const activeBooks = useMemo(() => selectActiveBooks(books, scannedFolders), [books, scannedFolders]);
  const recentBooks = useMemo(() => selectRecent(activeBooks), [activeBooks]);
  const favoriteBooks = useMemo(() => sortBooksNatural(activeBooks.filter(b => b.isFavorite)), [activeBooks]);
  const collections = useMemo(() => {
    const groups = new Map<string, BookFile[]>();
    for (const book of activeBooks) {
      const name = book.folder || UNSORTED;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(book);
    }
    return [...groups.entries()]
      .map(([name, list]) => ({ name, books: name === UNSORTED ? sortBooksNatural(list) : sortSeries(list) }))
      .sort((a, b) => (a.name === UNSORTED ? 1 : b.name === UNSORTED ? -1 : a.name.localeCompare(b.name)));
  }, [activeBooks]);

  const titleMaps = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    collections.forEach(c => (map[c.name] = c.name === UNSORTED ? {} : shortTitles(c.books)));
    return map;
  }, [collections]);

  const titleFor = useCallback(
    (book: BookFile, inCollection: boolean) =>
      inCollection ? titleMaps[book.folder || UNSORTED]?.[book.id] ?? book.title : book.title,
    [titleMaps],
  );

  const isSearching = searchOpen && searchQuery.trim().length > 0;
  const gridBooks = useMemo(() => {
    if (isSearching) return sortBooksNatural(activeBooks.filter(b => matchesQuery(b, searchQuery)));
    if (section === 'recent') return recentBooks;
    if (section === 'favorites') return favoriteBooks;
    if (section) {
      const list = collections.find(c => c.name === section)?.books ?? [];
      if (!reorderIds) return list;
      const byId = new Map(list.map(b => [b.id, b]));
      return reorderIds.map(id => byId.get(id)).filter((b): b is BookFile => !!b);
    }
    return [];
  }, [activeBooks, collections, favoriteBooks, isSearching, recentBooks, reorderIds, searchQuery, section]);
  const inCollectionGrid = !!section && !['recent', 'favorites'].includes(section) && !isSearching;
  const canReorder = inCollectionGrid && section !== UNSORTED && gridBooks.length > 1;

  // Leaving the collection cancels an unsaved reorder.
  useEffect(() => setReorderIds(null), [section]);

  const startReorder = useCallback(() => setReorderIds(gridBooks.map(b => b.id)), [gridBooks]);
  const moveBook = useCallback((id: string, to: number) => {
    setReorderIds(prev => {
      if (!prev) return prev;
      const from = prev.indexOf(id);
      if (from < 0 || to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }, []);
  const saveReorder = useCallback(async () => {
    if (reorderIds) await actions.setReadingOrder(reorderIds);
    setReorderIds(null);
  }, [actions, reorderIds]);
  const resetReorder = useCallback(() => {
    Alert.alert('Orden por nombre', '¿Volver a ordenar esta colección por nombre (Tomo 1, 2, 10...)?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí',
        onPress: async () => {
          await actions.setReadingOrder(null, gridBooks.map(b => b.id));
          setReorderIds(null);
        },
      },
    ]);
  }, [actions, gridBooks]);

  const numColumns = Math.max(2, Math.floor((width - H_PADDING * 2 + GRID_GAP) / ((isTablet ? 170 : 150) + GRID_GAP)));
  const gridCardWidth = (width - H_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;
  const carouselCardWidth = isTablet ? 160 : 132;

  const percentOf = useCallback((id: string) => Math.round(progress[id]?.percentage ?? 0), [progress]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedBooks = useMemo(() => books.filter(b => selectedSet.has(b.id)), [books, selectedSet]);
  const allSelectedFavorite = selectedBooks.length > 0 && selectedBooks.every(b => b.isFavorite);
  const allSelectedRead = selectedBooks.length > 0 && selectedBooks.every(b => percentOf(b.id) >= 100);
  const anySelectedStarted = selectedBooks.some(b => percentOf(b.id) > 0);

  // ─── Lifecycle ───────────────────────────────────────────────────────────
  // Pick up new/removed files automatically once per launch.
  useEffect(() => {
    if (isLoaded && scannedFolders.some(f => f.enabled)) actions.refreshLibrary(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const cancelSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
    setOptionsVisible(false);
  }, []);

  // Guided tour, started by itself on the home screen: with an empty library only the intro (header
  // and "Agregar carpeta"); the library part as soon as the first books appear; both at once if
  // the app already has books the first time.
  const tour = useTour();
  const [tourProgress, setTourProgress] = useState<TourProgress | null>(null);
  const homeScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    getTourProgress()
      .then(setTourProgress)
      .catch(() => setTourProgress({ intro: true, library: true }));
  }, []);
  useEffect(() => {
    if (!tourProgress || tour.active || isScanning || foldersModalVisible || section !== null || selectionMode) return;
    const hasBooks = activeBooks.length > 0;
    const run: TourRun | null = hasBooks
      ? tourProgress.library
        ? null
        : tourProgress.intro
          ? 'library'
          : 'full'
      : books.length === 0 && !tourProgress.intro
        ? 'intro'
        : null;
    if (!run) return;
    const timer = setTimeout(() => {
      // Once per session per part; finishing or skipping stores it (tour.ts).
      setTourProgress(p => p && { intro: true, library: p.library || run !== 'intro' });
      Tour.start(run);
    }, 900);
    return () => clearTimeout(timer);
  }, [activeBooks.length, books.length, foldersModalVisible, isScanning, section, selectionMode, tour.active, tourProgress]);
  // Whenever the tour runs (also replayed from "Mi lectura"), show the plain home screen.
  useEffect(() => {
    if (!tour.active) return;
    cancelSelection();
    setSection(null);
    setSearchOpen(false);
    actions.setSearchQuery('');
    setFoldersModalVisible(false);
    setGroupModalVisible(false);
    setCoverModalVisible(false);
    homeScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [actions, cancelSelection, tour.active]);
  // Home stops (hero, collection, card) scroll into the upper part of the screen before the
  // overlay measures them, leaving room for the bubble below.
  const homeScrollY = useRef(0);
  useEffect(() => {
    const id = tour.active ? TOUR_STEPS[tour.order[tour.index]]?.target : undefined;
    const scroll = homeScrollRef.current;
    if (!id?.startsWith('home.') || !scroll) return;
    Promise.all([
      measureTarget(id),
      new Promise<{ y: number; height: number }>(resolve => {
        const host = scroll.getNativeScrollRef();
        if (host) host.measureInWindow((_x, y, _w, height) => resolve({ y, height }));
        else resolve({ y: 0, height: 0 });
      }),
    ]).then(([target, view]) => {
      if (!target || view.height === 0) return;
      const margin = 24;
      if (target.y < view.y + margin || target.y + target.height > view.y + view.height * 0.55) {
        scroll.scrollTo({ y: Math.max(0, homeScrollY.current + target.y - view.y - margin), animated: false });
      }
    });
  }, [tour.active, tour.index, tour.order]);

  // Hardware back: leave selection / search / section before leaving the app.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (tour.active) return false; // the tour overlay handles it
        if (selectionMode) {
          cancelSelection();
          return true;
        }
        if (searchOpen) {
          setSearchOpen(false);
          actions.setSearchQuery('');
          return true;
        }
        if (reorderIds) {
          setReorderIds(null);
          return true;
        }
        if (section) {
          setSection(null);
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [actions, cancelSelection, reorderIds, searchOpen, section, selectionMode, tour.active]),
  );

  // ─── Handlers ────────────────────────────────────────────────────────────
  const openBook = useCallback(
    (book: BookFile) => {
      actions.updateLastOpened(book.id);
      navigation.navigate('Reader', { bookId: book.id });
    },
    [actions, navigation],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (next.length === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const onCardPress = useCallback(
    (book: BookFile) => (selectionMode ? toggleSelected(book.id) : openBook(book)),
    [openBook, selectionMode, toggleSelected],
  );

  const onCardLongPress = useCallback(
    (book: BookFile) => {
      if (selectionMode) {
        toggleSelected(book.id);
        return;
      }
      setSelectionMode(true);
      setSelectedIds([book.id]);
    },
    [selectionMode, toggleSelected],
  );

  const runBatch = useCallback(
    async (fn: (ids: string[]) => Promise<void>) => {
      if (selectedIds.length === 0) return;
      setOptionsVisible(false);
      await fn(selectedIds);
      cancelSelection();
    },
    [cancelSelection, selectedIds],
  );

  const confirmDelete = useCallback(() => {
    setOptionsVisible(false);
    Alert.alert(
      'Quitar de la biblioteca',
      `Se quitarán ${selectedIds.length} libro(s) de InkTrick. Los archivos NO se borran del dispositivo y no volverán a aparecer al actualizar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: () => runBatch(actions.deleteBooksBatch) },
      ],
    );
  }, [actions, runBatch, selectedIds.length]);

  const selectedBook = selectedBooks.length === 1 ? selectedBooks[0] : undefined;

  const openCoverModal = useCallback(() => {
    if (!selectedBook) return;
    setCoverPageInput(String(selectedBook.coverPage ?? 1));
    setOptionsVisible(false);
    setCoverModalVisible(true);
  }, [selectedBook]);

  const saveCover = useCallback(async () => {
    if (!selectedBook) return;
    const page = parseInt(coverPageInput, 10);
    const max = selectedBook.pageCount;
    if (isNaN(page) || page < 1 || (max && page > max)) {
      Alert.alert('Página inválida', max ? `Ingresa un número entre 1 y ${max}.` : 'Ingresa un número de página válido.');
      return;
    }
    setCoverLoading(true);
    const uri = await actions.updateBookCover(selectedBook.id, page);
    setCoverLoading(false);
    if (uri) {
      setCoverModalVisible(false);
      cancelSelection();
    } else {
      Alert.alert('Error', 'No se pudo generar la portada con esa página.');
    }
  }, [actions, cancelSelection, coverPageInput, selectedBook]);

  const closeGroupModal = useCallback(() => {
    setNewGroupName('');
    setGroupModalVisible(false);
  }, []);

  const assignGroup = useCallback(
    async (name: string) => {
      await actions.assignFolderBatch(selectedIds, name);
      closeGroupModal();
      cancelSelection();
    },
    [actions, cancelSelection, closeGroupModal, selectedIds],
  );

  const toggleSearch = useCallback(() => {
    setSearchOpen(open => {
      if (open) actions.setSearchQuery('');
      return !open;
    });
  }, [actions]);

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderCard = (book: BookFile, cardWidth: number, inCollection: boolean) => (
    <BookCard
      key={book.id}
      book={book}
      title={titleFor(book, inCollection)}
      width={cardWidth}
      percentage={percentOf(book.id)}
      selectionMode={selectionMode}
      selected={selectedSet.has(book.id)}
      onPress={onCardPress}
      onLongPress={onCardLongPress}
    />
  );

  // tourTargets: this carousel's header and first card are the tour's "collection" / "card" stops.
  const renderCarousel = (
    key: string,
    label: string,
    data: BookFile[],
    inCollection: boolean,
    icon?: React.ReactNode,
    tourTargets = false,
  ) => (
    <View key={key} style={styles.carouselSection}>
      <TourTarget id={tourTargets ? 'home.collection' : `carousel.${key}`}>
        <TouchableOpacity style={styles.carouselHeader} onPress={() => setSection(key)} activeOpacity={0.7}>
          <View style={styles.carouselTitleRow}>
            {icon}
            <Text style={styles.carouselTitle} numberOfLines={1}>{label}</Text>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{data.length}</Text>
            </View>
          </View>
          <SeeAll label="Ver todo" />
        </TouchableOpacity>
      </TourTarget>
      <FlatList
        horizontal
        data={data}
        keyExtractor={item => `${key}_${item.id}`}
        renderItem={({ item, index }) =>
          tourTargets && index === 0 ? (
            <TourTarget id="home.card">{renderCard(item, carouselCardWidth, inCollection)}</TourTarget>
          ) : (
            renderCard(item, carouselCardWidth, inCollection)
          )
        }
        extraData={[selectionMode, selectedIds, progress]}
        ItemSeparatorComponent={() => <View style={{ width: GRID_GAP }} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
      />
    </View>
  );

  const renderHero = () => {
    const book = recentBooks[0];
    if (!book) return null;
    const p = progress[book.id];
    const pct = Math.round(p?.percentage ?? 0);
    const pages = p?.totalPages || book.pageCount;
    const status =
      pct >= 100
        ? 'Lectura finalizada'
        : !p
          ? 'Sin comenzar'
          : book.format === '.epub' // EPUB progress is a text position, not a page
            ? 'En curso'
            : pages
              ? `Página ${p.currentPage + 1} de ${pages}`
              : 'Sin comenzar';
    const coverWidth = isTablet ? 190 : 118;
    return (
      <TourTarget id="home.hero">
        <View style={styles.heroHeader}>
          <Text style={styles.heroHeaderTitle}>Continuar leyendo</Text>
          <TouchableOpacity onPress={() => setSection('recent')} accessibilityLabel="Ver libros recientes">
            <SeeAll label="Recientes" />
          </TouchableOpacity>
        </View>
      <View style={styles.hero}>
        {book.coverUri ? (
          <Image cachePolicy="memory" source={{ uri: book.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
        ) : null}
        <LinearGradient
          colors={['rgba(10,10,10,0.25)', 'rgba(10,10,10,0.72)', 'rgba(22,22,22,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.4 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Faint ink torii bleeding off the right, top and bottom edges. */}
        <Image source={TORII} style={styles.heroTorii} contentFit="contain" />
        <View style={styles.heroBody}>
          <View style={[styles.heroCover, { width: coverWidth }]}>
            {book.coverUri ? (
              <Image cachePolicy="memory" source={{ uri: book.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.heroPlaceholder}>
                <Text style={styles.heroPlaceholderText}>{book.format.replace('.', '').toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle} numberOfLines={3}>{book.title}</Text>
            {book.folder ? <Text style={styles.heroSeries}>{book.folder}</Text> : null}
            <View style={styles.heroProgressRow}>
              <View style={styles.heroTrack}>
                <View style={[styles.heroFill, { width: `${Math.min(100, pct)}%` }]} />
              </View>
              <Text style={styles.heroPct}>{pct}%</Text>
            </View>
            <Text style={styles.heroStatus}>{status}</Text>
            <Text style={styles.heroMeta}>
              {book.format.replace('.', '').toUpperCase()} · {formatBytes(book.fileSize)}
              {book.lastOpenedAt ? ` · ${formatRelativeDate(p?.lastReadAt ?? book.lastOpenedAt)}` : ''}
            </Text>
            <TouchableOpacity style={styles.heroButton} onPress={() => openBook(book)} activeOpacity={0.8}>
              <ReadIcon size={17} color="#0A0A0A" />
              <Text style={styles.heroButtonText}>{pct > 0 && pct < 100 ? 'Continuar' : 'Leer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </TourTarget>
    );
  };

  // The splash screen (App.tsx) covers the library while it loads from disk.
  if (!isLoaded) return <View style={styles.container} />;

  const gridTitle = isSearching
    ? `Resultados (${gridBooks.length})`
    : section === 'recent'
    ? 'Recientes'
    : section === 'favorites'
    ? 'Favoritos'
    : section ?? '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      {/* Wallpaper: a faint sakura branch growing in from the right edge. */}
      <Image source={SAKURA} style={styles.sakura} contentFit="contain" pointerEvents="none" />

      {/* Header */}
      {selectionMode ? (
        <View style={[styles.header, styles.headerSelection]}>
          <Text style={styles.selectionTitle}>
            {selectedIds.length} {selectedIds.length === 1 ? 'seleccionado' : 'seleccionados'}
          </Text>
          <View style={styles.headerActions}>
            {(section || isSearching) && gridBooks.length > 0 && (
              <TouchableOpacity style={styles.textBtn} onPress={() => setSelectedIds(gridBooks.map(b => b.id))}>
                <Text style={styles.textBtnLabel}>Todos</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.textBtn} onPress={cancelSelection}>
              <Text style={styles.textBtnLabel}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.circleBtn} onPress={() => setOptionsVisible(true)} accessibilityLabel="Acciones">
              <Text style={styles.menuBtnText}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          {searchOpen ? (
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={actions.setSearchQuery}
              placeholder="Buscar por título, archivo o colección"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoFocus
              returnKeyType="search"
            />
          ) : (
            <View>
              <Text style={styles.headerTitle}>InkTrick</Text>
              <Text style={styles.headerSubtitle}>インクトリック</Text>
            </View>
          )}
          <View style={styles.headerActions}>
            <TourTarget id="header.search">
              <TouchableOpacity style={styles.circleBtn} onPress={toggleSearch} accessibilityLabel={searchOpen ? 'Cerrar búsqueda' : 'Buscar'}>
                {searchOpen ? <CloseIcon size={16} color={COLORS.text} /> : <SearchIcon size={18} color={COLORS.text} />}
              </TouchableOpacity>
            </TourTarget>
            {!searchOpen && (
              <>
                <TourTarget id="header.stats">
                  <TouchableOpacity style={styles.circleBtn} onPress={() => navigation.navigate('Stats')} accessibilityLabel="Mi lectura">
                    <ChartIcon size={18} color={COLORS.text} />
                  </TouchableOpacity>
                </TourTarget>
                <TourTarget id="header.folders">
                  <TouchableOpacity style={styles.circleBtn} onPress={() => setFoldersModalVisible(true)} accessibilityLabel="Carpetas">
                    <FolderIcon size={17} color={COLORS.text} />
                  </TouchableOpacity>
                </TourTarget>
                <TourTarget id="header.refresh">
                  <TouchableOpacity
                    style={[styles.circleBtn, styles.circleBtnPrimary, (isScanning || !scannedFolders.some(f => f.enabled)) && { opacity: 0.5 }]}
                    onPress={() => actions.refreshLibrary()}
                    disabled={isScanning || !scannedFolders.some(f => f.enabled)}
                    accessibilityLabel="Actualizar biblioteca"
                  >
                    {isScanning ? <ActivityIndicator size="small" color="#0A0A0A" /> : <RefreshIcon size={17} color="#0A0A0A" />}
                  </TouchableOpacity>
                </TourTarget>
              </>
            )}
          </View>
        </View>
      )}

      {isScanning && (
        <View style={styles.scanBanner}>
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={styles.scanBannerText}>Buscando libros en tus carpetas...</Text>
        </View>
      )}

      {/* Body */}
      {section === null && !isSearching ? (
        <ScrollView
          ref={homeScrollRef}
          onScroll={e => (homeScrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {renderHero()}
          {favoriteBooks.length > 0 && renderCarousel('favorites', 'Favoritos', favoriteBooks, false, <StarIcon size={19} color={COLORS.wisteria} filled />)}
          {collections.map((c, i) => renderCarousel(c.name, c.name, c.books, c.name !== UNSORTED, undefined, i === 0))}

          {activeBooks.length === 0 && (
            <View style={styles.empty}>
              <FolderIcon size={56} color="rgba(255,255,255,0.35)" />
              <Text style={styles.emptyTitle}>{books.length === 0 ? 'Tu biblioteca está vacía' : 'No hay carpetas activas'}</Text>
              <Text style={styles.emptyText}>
                {books.length === 0
                  ? 'Elige la carpeta donde guardas tus mangas, cómics y libros (CBR, CBZ, PDF o EPUB). InkTrick los encuentra solo, incluso en subcarpetas.'
                  : 'Activa al menos una carpeta en el gestor de carpetas para ver tus libros.'}
              </Text>
              <TourTarget id="home.addFolder" style={{ marginTop: 8 }}>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setFoldersModalVisible(true)}>
                  <FolderIcon size={16} color="#0A0A0A" />
                  <Text style={styles.primaryBtnText}>{books.length === 0 ? 'Agregar carpeta' : 'Gestionar carpetas'}</Text>
                </TouchableOpacity>
              </TourTarget>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {!isSearching && (
            <View style={styles.subheader}>
              <TouchableOpacity style={styles.textBtn} onPress={() => setSection(null)}>
                <BackIcon size={15} color={COLORS.text} />
                <Text style={styles.textBtnLabel}>Inicio</Text>
              </TouchableOpacity>
              <Text style={styles.subheaderTitle} numberOfLines={1}>{gridTitle}</Text>
              {reorderIds ? (
                <>
                  <TouchableOpacity style={styles.textBtn} onPress={resetReorder}>
                    <Text style={styles.textBtnLabel}>Por nombre</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.textBtn} onPress={() => setReorderIds(null)}>
                    <Text style={styles.textBtnLabel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.textBtn, styles.textBtnPrimary]} onPress={saveReorder}>
                    <Text style={[styles.textBtnLabel, { color: '#0A0A0A' }]}>Listo</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {canReorder && !selectionMode && (
                    <TouchableOpacity style={styles.textBtn} onPress={startReorder} accessibilityLabel="Ordenar colección">
                      <SortIcon size={16} color={COLORS.text} />
                      <Text style={styles.textBtnLabel}>Ordenar</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{gridBooks.length}</Text>
                  </View>
                </>
              )}
            </View>
          )}
          {reorderIds && (
            <Text style={styles.reorderHint}>
              Mantén presionado un libro y arrástralo, o usa las flechas, para definir el orden de lectura. El botón «Siguiente» al terminar un tomo sigue este orden.
            </Text>
          )}
          {isSearching && <Text style={styles.searchResultsLabel}>{gridTitle}</Text>}
          {gridBooks.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{isSearching ? 'Sin resultados' : 'Colección vacía'}</Text>
            </View>
          ) : reorderIds ? (
            <ReorderGrid
              books={gridBooks}
              columns={numColumns}
              cardWidth={gridCardWidth}
              gap={GRID_GAP}
              renderCard={book => renderCard(book, gridCardWidth, true)}
              onMove={moveBook}
              contentContainerStyle={{ padding: H_PADDING, paddingBottom: insets.bottom + 40 }}
            />
          ) : (
            <FlatList
              key={`grid_${numColumns}`}
              data={gridBooks}
              numColumns={numColumns}
              keyExtractor={item => item.id}
              renderItem={({ item }) => renderCard(item, gridCardWidth, inCollectionGrid)}
              extraData={[selectionMode, selectedIds, progress, titleMaps]}
              columnWrapperStyle={{ gap: GRID_GAP }}
              contentContainerStyle={{ padding: H_PADDING, gap: GRID_GAP, paddingBottom: insets.bottom + 40 }}
              initialNumToRender={numColumns * 3}
              maxToRenderPerBatch={numColumns * 2}
              windowSize={7}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}

      {/* Batch actions menu: labels reflect what each action will do to the current selection. */}
      <Modal animationType="fade" transparent visible={optionsVisible} onRequestClose={() => setOptionsVisible(false)}>
        <Pressable style={[styles.menuBackdrop, { paddingTop: insets.top + 70 }]} onPress={() => setOptionsVisible(false)}>
          <View style={styles.menuCard}>
            <MenuItem
              icon={<StarIcon size={18} color={COLORS.text} />}
              label={allSelectedFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              onPress={() => runBatch(actions.toggleFavoriteBatch)}
            />
            {!allSelectedRead && (
              <MenuItem icon={<CheckDoneIcon size={19} color={COLORS.text} />} label="Marcar como leído" onPress={() => runBatch(actions.markAsReadBatch)} />
            )}
            {anySelectedStarted && (
              <MenuItem icon={<RefreshIcon size={18} color={COLORS.text} />} label="Marcar como no leído" onPress={() => runBatch(actions.markAsUnreadBatch)} />
            )}
            {selectedBook && <MenuItem icon={<ImageIcon size={18} color={COLORS.text} />} label="Cambiar portada" onPress={openCoverModal} />}
            <MenuItem
              icon={<FolderIcon size={18} color={COLORS.text} />}
              label="Mover a colección"
              onPress={() => {
                setOptionsVisible(false);
                setGroupModalVisible(true);
              }}
            />
            <MenuItem icon={<TrashIcon size={18} color="#FF5A5A" />} label="Quitar de la biblioteca" danger last onPress={confirmDelete} />
          </View>
        </Pressable>
      </Modal>

      {/* Change cover */}
      <Modal animationType="fade" transparent visible={coverModalVisible} onRequestClose={() => !coverLoading && setCoverModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => !coverLoading && setCoverModalVisible(false)}>
          <Pressable style={styles.modalCard}>
            <ModalHeader title="Cambiar portada" onClose={() => !coverLoading && setCoverModalVisible(false)} />
            <Text style={styles.modalText}>
              Número de página a usar como portada{selectedBook?.pageCount ? ` (1 - ${selectedBook.pageCount})` : ''}:
            </Text>
            {selectedBook?.coverUri ? (
              <Image cachePolicy="memory" source={{ uri: selectedBook.coverUri }} style={styles.coverPreview} contentFit="cover" />
            ) : null}
            <TextInput
              style={[styles.modalInput, styles.modalInputCenter]}
              value={coverPageInput}
              onChangeText={setCoverPageInput}
              keyboardType="number-pad"
              editable={!coverLoading}
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} disabled={coverLoading} onPress={() => setCoverModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, coverLoading && { opacity: 0.6 }]} disabled={coverLoading} onPress={saveCover}>
                {coverLoading ? <ActivityIndicator size="small" color="#0A0A0A" /> : <Text style={styles.modalConfirmText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Move to collection */}
      <Modal animationType="fade" transparent visible={groupModalVisible} onRequestClose={closeGroupModal}>
        <Pressable style={styles.modalOverlay} onPress={closeGroupModal}>
          <Pressable style={styles.modalCard}>
            <ModalHeader title="Mover a colección" onClose={closeGroupModal} />
            <Text style={styles.modalText}>Escribe una colección nueva o elige una existente:</Text>
            <TextInput
              style={styles.modalInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Ej: Shonen, Seinen, Manhwas"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoFocus
              onSubmitEditing={() => newGroupName.trim() && assignGroup(newGroupName)}
            />
            {collections.filter(c => c.name !== UNSORTED).length > 0 && (
              <>
                <Text style={styles.modalLabel}>Colecciones existentes</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                  {collections
                    .filter(c => c.name !== UNSORTED)
                    .map(c => (
                      <TouchableOpacity key={c.name} style={styles.pill} onPress={() => assignGroup(c.name)}>
                        <Text style={styles.pillText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              </>
            )}
            <View style={styles.modalButtons}>
              {selectedBooks.some(b => b.folder) && (
                <TouchableOpacity style={styles.modalCancel} onPress={() => assignGroup('')}>
                  <Text style={styles.modalDangerText}>Sacar de su colección</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.modalCancel} onPress={closeGroupModal}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !newGroupName.trim() && { opacity: 0.5 }]}
                disabled={!newGroupName.trim()}
                onPress={() => assignGroup(newGroupName)}
              >
                <Text style={styles.modalConfirmText}>Mover</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Folder manager */}
      <Modal animationType="fade" transparent visible={foldersModalVisible} onRequestClose={() => setFoldersModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFoldersModalVisible(false)}>
          <Pressable style={[styles.modalCard, { maxHeight: '85%' }]}>
            <ModalHeader title="Carpetas" onClose={() => setFoldersModalVisible(false)} />
            <Text style={styles.modalText}>InkTrick busca CBR, CBZ, PDF y EPUB en estas carpetas y sus subcarpetas.</Text>

            {scannedFolders.length === 0 ? (
              <View style={styles.foldersEmpty}>
                <FolderIcon size={36} color="rgba(255,255,255,0.35)" />
                <Text style={styles.modalText}>No hay carpetas agregadas</Text>
              </View>
            ) : (
              <ScrollView style={styles.folderList}>
                {scannedFolders.map((folder, index) => {
                  const count = books.filter(b => belongsToFolder(b, folder.uri)).length;
                  return (
                    <View key={folder.uri} style={[styles.folderRow, index > 0 && styles.folderRowDivider]}>
                      <TouchableOpacity style={styles.folderRowMain} onPress={() => actions.toggleFolder(folder.uri)}>
                        <View style={[styles.checkboxSquare, folder.enabled && styles.checkboxSquareOn]}>
                          {folder.enabled && <Text style={styles.checkboxSquareMark}>✓</Text>}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.folderName} numberOfLines={1}>{folder.name}</Text>
                          <Text style={styles.folderMeta}>{count} libros{folder.enabled ? '' : ' · oculta'}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() =>
                          Alert.alert('Quitar carpeta', `¿Quitar "${folder.name}" y sus libros de la biblioteca? Los archivos no se borran.`, [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Quitar', style: 'destructive', onPress: () => actions.deleteFolder(folder.uri) },
                          ])
                        }
                      >
                        <TrashIcon size={18} color="rgba(255,255,255,0.6)" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={[styles.modalButtons, { marginTop: 18 }]}>
              <TouchableOpacity
                style={[styles.outlineBtn, { flex: 1 }, isScanning && { opacity: 0.6 }]}
                disabled={isScanning}
                onPress={actions.addFolderAndIndex}
              >
                {isScanning ? <ActivityIndicator size="small" color={COLORS.accent} /> : <Text style={styles.outlineBtnText}>+ Agregar carpeta</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { flex: 0.7 }]} onPress={() => setFoldersModalVisible(false)}>
                <Text style={styles.modalConfirmText}>Listo</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SeeAll({ label }: { label: string }) {
  return (
    <View style={styles.seeAllRow}>
      <Text style={styles.seeAll}>{label}</Text>
      <ArrowIcon size={13} color="rgba(240,240,240,0.6)" />
    </View>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.modalHeaderRow}>
      <Text style={styles.modalTitle}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={styles.modalClose} accessibilityLabel="Cerrar">
        <CloseIcon size={18} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );
}

function MenuItem({ icon, label, onPress, danger, last }: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuItem, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuIcon}>{icon}</View>
      <Text style={[styles.menuLabel, danger && { color: '#FF5A5A' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const SAKURA = require('../../assets/decor/sakura_branch.webp');
const TORII = require('../../assets/decor/torii.webp');

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Falls diagonally from the top-right corner (the trunk runs off it) towards the bottom-left.
  sakura: {
    position: 'absolute',
    right: '-14%',
    top: '3%',
    width: '112%',
    aspectRatio: 1234 / 1328,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  headerSelection: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    color: 'rgba(240,240,240,0.4)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: -2,
  },
  selectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    color: COLORS.text,
    fontSize: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  textBtn: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtnLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  menuBtnText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  outlineBtn: {
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
  },
  primaryBtnText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '700',
  },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: H_PADDING,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  scanBannerText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PADDING,
    marginTop: 8,
    marginBottom: 12,
  },
  heroHeaderTitle: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  hero: {
    marginHorizontal: H_PADDING,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroTorii: {
    position: 'absolute',
    right: '-18%',
    top: '-29%',
    height: '157%',
    aspectRatio: 1393 / 1048,
    opacity: 0.045,
  },
  heroBody: {
    flexDirection: 'row',
    gap: 20,
    padding: 18,
  },
  heroCover: {
    aspectRatio: 0.7,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    elevation: 14,
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlaceholderText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 22,
    fontWeight: '900',
  },
  heroInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  heroTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 27,
    letterSpacing: -0.3,
  },
  heroSeries: {
    color: 'rgba(240,240,240,0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  heroProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    maxWidth: 440,
  },
  heroTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  heroFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  heroPct: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    minWidth: 36,
  },
  heroStatus: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  heroButtonText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '800',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  seeAll: {
    color: 'rgba(240,240,240,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  carouselSection: {
    marginTop: 26,
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PADDING,
    marginBottom: 12,
    gap: 12,
  },
  carouselTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  carouselTitle: {
    flexShrink: 1,
    color: COLORS.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    color: 'rgba(240,240,240,0.7)',
    fontSize: 12,
    fontWeight: '800',
  },
  carouselContent: {
    paddingHorizontal: H_PADDING,
  },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textBtnPrimary: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  reorderHint: {
    color: 'rgba(240,240,240,0.6)',
    fontSize: 13,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
  },
  subheaderTitle: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
  },
  searchResultsLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: 'rgba(240,240,240,0.55)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 460,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'flex-end',
    paddingRight: H_PADDING,
  },
  menuCard: {
    width: 260,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 4,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,42,42,0.6)',
  },
  menuIcon: {
    width: 28,
    alignItems: 'center',
    marginRight: 10,
  },
  menuLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 24,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  modalText: {
    color: 'rgba(240,240,240,0.6)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalLabel: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 18,
  },
  modalInputCenter: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
  },
  modalCancelText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  modalDangerText: {
    color: '#FF7A7A',
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  modalConfirmText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '800',
  },
  coverPreview: {
    alignSelf: 'center',
    width: 110,
    height: 157,
    borderRadius: 10,
    marginBottom: 16,
  },
  pills: {
    gap: 8,
    paddingBottom: 16,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pillText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  foldersEmpty: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  folderList: {
    maxHeight: 300,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  folderRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  folderRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSquareOn: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkboxSquareMark: {
    color: '#0A0A0A',
    fontSize: 12,
    fontWeight: '900',
  },
  folderName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  folderMeta: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
});
