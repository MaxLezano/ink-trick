/**
 * InkTrick - Dashboard Screen
 * Pantalla principal con carruseles horizontales para manga/anime.
 * Estilo Netflix/Crunchyroll con soporte para miniaturas PDF y barra de progreso.
 */
import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  StatusBar,
  Animated,
  Alert,
  Modal,
  TextInput,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as FileSystem from 'expo-file-system/legacy';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { RootStackParamList, BookFile } from '../utils/types';
import { useLibraryStore } from '../store/libraryStore';
import { COLORS, GRID_COLUMNS_MOBILE, GRID_COLUMNS_TABLET, TABLET_BREAKPOINT } from '../utils/constants';

let PdfComponent: any = null;
let isPdfSupported = false;

try {
  const requirePdf = require('react-native-pdf');
  PdfComponent = requirePdf.default || requirePdf;
  isPdfSupported = !!PdfComponent;
} catch (error) {
  console.log('[DashboardScreen] react-native-pdf not supported in this environment.');
}

type DashboardNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboard'>;

interface Props {
  navigation: DashboardNavigationProp;
}

const TrashIcon = ({ color = '#FFFFFF' }: { color?: string }) => {
  return (
    <View style={{ width: 18, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 6, height: 1.5, backgroundColor: color, borderTopLeftRadius: 1, borderTopRightRadius: 1, marginBottom: 1 }} />
      <View style={{ width: 14, height: 1.5, backgroundColor: color, borderRadius: 0.8, marginBottom: 2 }} />
      <View style={{
        width: 11,
        height: 10,
        borderWidth: 1.5,
        borderColor: color,
        borderTopWidth: 0,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingVertical: 1,
      }}>
        <View style={{ width: 1.2, height: 5, backgroundColor: color, borderRadius: 0.5 }} />
        <View style={{ width: 1.2, height: 5, backgroundColor: color, borderRadius: 0.5 }} />
      </View>
    </View>
  );
};

export default function DashboardScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const numColumns = isTablet ? GRID_COLUMNS_TABLET : GRID_COLUMNS_MOBILE;

  // Store
  const {
    books,
    progress,
    scannedFolders,
    isScanning,
    isLoaded,
    loadLibrary,
    addFolderAndIndex,
    refreshLibrary,
    updateLastOpened,
    toggleFavoriteBatch,
    deleteBooksBatch,
    assignFolderBatch,
    toggleFolder,
    deleteFolder,
    getRecentBooks,
    getFavoriteBooks,
  } = useLibraryStore();

  const [showSplash, setShowSplash] = useState(true);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Estados de multiselección y agrupamiento
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [isFolderModalVisible, setIsFolderModalVisible] = useState(false);
  const [isFoldersModalVisible, setIsFoldersModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Estado de preparación de caché en lobby
  const [preparingBookId, setPreparingBookId] = useState<string | null>(null);
  const [preparingTitle, setPreparingTitle] = useState<string | null>(null);

  // Sección de detalle activa (null = Home, 'recent' | 'favorites' | folderName = Detail)
  const [activeDetailSection, setActiveDetailSection] = useState<string | null>(null);

  useEffect(() => {
    loadLibrary();
    
    // Iniciar la animación de la barra de progreso 3D
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 1400,
      useNativeDriver: false,
    }).start();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  // Obtener libros recientes y favoritos de las carpetas habilitadas
  const recentBooks = getRecentBooks();
  const favoriteBooks = getFavoriteBooks();

  // Obtener colecciones/carpetas únicas y su conteo de libros (solo de carpetas activas)
  const foldersList = React.useMemo(() => {
    const groups: Record<string, BookFile[]> = {};
    const enabledFolders = scannedFolders.filter(f => f.enabled);
    const activeBooks = books.filter(book =>
      enabledFolders.some(f => book.filePath.startsWith(f.uri))
    );

    activeBooks.forEach(book => {
      const folderName = book.folder || 'Sin clasificar';
      if (!groups[folderName]) {
        groups[folderName] = [];
      }
      groups[folderName].push(book);
    });

    return Object.keys(groups).map(name => ({
      name,
      books: groups[name],
      count: groups[name].length,
    })).sort((a, b) => {
      if (a.name === 'Sin clasificar') return 1;
      if (b.name === 'Sin clasificar') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [books, scannedFolders]);

  // Libros a desplegar en vista detallada
  const displayBooks = React.useMemo(() => {
    if (!activeDetailSection) return [];
    if (activeDetailSection === 'recent') return recentBooks;
    if (activeDetailSection === 'favorites') return favoriteBooks;
    
    // De lo contrario, es una carpeta de agrupación
    const enabledFolders = scannedFolders.filter(f => f.enabled);
    const activeBooks = books.filter(book =>
      enabledFolders.some(f => book.filePath.startsWith(f.uri))
    );
    return activeBooks.filter(b => (b.folder || 'Sin clasificar') === activeDetailSection);
  }, [activeDetailSection, books, scannedFolders, recentBooks, favoriteBooks]);

  const toggleBookSelection = useCallback((bookId: string) => {
    setSelectedBookIds(prev => {
      const exists = prev.includes(bookId);
      let updated;
      if (exists) {
        updated = prev.filter(id => id !== bookId);
      } else {
        updated = [...prev, bookId];
      }
      
      if (updated.length === 0) {
        setIsSelectionMode(false);
      }
      return updated;
    });
  }, []);

  const handleBookPress = useCallback(
    async (book: BookFile) => {
      if (isSelectionMode) {
        toggleBookSelection(book.id);
      } else {
        await updateLastOpened(book.id);
        setPreparingBookId(book.id);
        setPreparingTitle(book.title);

        const path = book.filePath;
        let finalPath = path;

        try {
          // Pre-copiamos el libro al directorio de caché seguro de la app si es necesario
          const safeFileName = `${book.id}.pdf`;
          const tempUri = `${FileSystem.cacheDirectory}${safeFileName}`;

          const info = await FileSystem.getInfoAsync(tempUri);
          if (!info.exists) {
            console.log('[DashboardScreen] Pre-loading book to cache:', tempUri);
            await FileSystem.copyAsync({
              from: path,
              to: tempUri,
            });
          }
          finalPath = tempUri;

          // Pre-extraer conteo nativo e inicializar la caché de lectura
          const cleanPath = Platform.OS === 'android' ? tempUri.replace('file://', '') : tempUri;
          try {
            await (PdfThumbnail as any).getPageCount(cleanPath);
          } catch (e) {}

          navigation.navigate('Reader', { bookId: book.id, preparedPath: finalPath });
        } catch (err) {
          console.error('[DashboardScreen] Error pre-loading book cache:', err);
          navigation.navigate('Reader', { bookId: book.id, preparedPath: path });
        } finally {
          setPreparingBookId(null);
          setPreparingTitle(null);
        }
      }
    },
    [navigation, updateLastOpened, isSelectionMode, toggleBookSelection]
  );

  const handleBookLongPress = useCallback(
    (book: BookFile) => {
      if (!isSelectionMode) {
        setIsSelectionMode(true);
        setSelectedBookIds([book.id]);
      }
    },
    [isSelectionMode]
  );

  const cancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedBookIds([]);
  }, []);

  const handleToggleFavoriteBatch = useCallback(async () => {
    if (selectedBookIds.length === 0) return;
    await toggleFavoriteBatch(selectedBookIds);
    cancelSelection();
  }, [selectedBookIds, toggleFavoriteBatch, cancelSelection]);

  const handleDeleteBatch = useCallback(() => {
    if (selectedBookIds.length === 0) return;
    Alert.alert(
      'Eliminar libros',
      `¿Estás seguro de que deseas eliminar los ${selectedBookIds.length} libros seleccionados de tu biblioteca?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteBooksBatch(selectedBookIds);
            cancelSelection();
          },
        },
      ]
    );
  }, [selectedBookIds, deleteBooksBatch, cancelSelection]);

  const handleAssignFolderBatch = useCallback(async () => {
    const folderName = newFolderName.trim();
    await assignFolderBatch(selectedBookIds, folderName);
    setNewFolderName('');
    setIsFolderModalVisible(false);
    cancelSelection();
  }, [selectedBookIds, newFolderName, assignFolderBatch, cancelSelection]);

  const handleAssignToExistingFolder = useCallback(async (folderName: string) => {
    await assignFolderBatch(selectedBookIds, folderName);
    setIsFolderModalVisible(false);
    cancelSelection();
  }, [selectedBookIds, assignFolderBatch, cancelSelection]);

  const handleScan = useCallback(() => {
    if (isSelectionMode) return;
    setIsFoldersModalVisible(true);
  }, [isSelectionMode]);

  // ─── Render de cada libro (Carrusel o Cuadrícula) ──────────────────────
  const renderBookItem = (item: BookFile, isHorizontal = false) => {
    const cardWidth = isHorizontal
      ? 130
      : (width - 48 - (numColumns - 1) * 12) / numColumns;
    const isSelected = selectedBookIds.includes(item.id);

    // Calcular el porcentaje de lectura guardado
    const bookProgress = progress[item.id];
    const percentage = bookProgress ? Math.round(bookProgress.percentage) : 0;

    return (
      <TouchableOpacity
        style={[
          styles.bookCard,
          {
            width: cardWidth,
            backgroundColor: COLORS.surface,
            borderColor: isSelected ? COLORS.accent : COLORS.border,
            borderWidth: isSelected ? 2 : 1,
            opacity: isSelectionMode && !isSelected ? 0.6 : 1,
          },
          isHorizontal && { marginRight: 12 },
        ]}
        onPress={() => handleBookPress(item)}
        onLongPress={() => handleBookLongPress(item)}
        activeOpacity={0.7}
      >
        {/* Checkbox en modo multiselección */}
        {isSelectionMode && (
          <View
            style={[
              styles.checkboxContainer,
              {
                backgroundColor: isSelected ? '#FFFFFF' : 'rgba(0, 0, 0, 0.5)',
                borderColor: '#FFFFFF',
              },
            ]}
          >
            {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
        )}

        {/* Cover Preview (Local Image o Generada automáticamente) */}
        <View style={styles.coverContainer}>
          {item.coverUri ? (
            <Image
              source={{ uri: item.coverUri }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.formatPlaceholder}>
              <Text style={[styles.formatBadge, { color: '#FFFFFF' }]}>PDF</Text>
            </View>
          )}

          {/* Barra de progreso de lectura discreta en el fondo de la portada */}
          {percentage > 0 && percentage < 100 && preparingBookId !== item.id && (
            <View style={styles.coverProgressOverlay}>
              <View style={styles.coverProgressBarBackground}>
                <View style={[styles.coverProgressBar, { width: `${percentage}%` }]} />
              </View>
              <Text style={styles.coverProgressText}>{percentage}%</Text>
            </View>
          )}

          {/* Banda de LEÍDO */}
          {percentage === 100 && preparingBookId !== item.id && (
            <View style={styles.readBanner}>
              <Text style={styles.readBannerText}>LEÍDO</Text>
            </View>
          )}

          {/* Banda inferior flotante "Abriendo..." en el mismo recuadro del libro */}
          {preparingBookId === item.id && (
            <View style={styles.cardLoadingOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.cardLoadingText}>Abriendo...</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.bookInfo}>
          <Text
            style={[styles.bookTitle, { color: COLORS.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </View>

        {/* Favorite indicator */}
        {item.isFavorite && (
          <View style={styles.favoriteIndicator}>
            <Text>⭐</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── Render de Sección de Carrusel en Home ─────────────────────────────
  const renderCarouselSection = (key: string, label: string, data: BookFile[]) => {
    return (
      <View key={key} style={styles.carouselSection}>
        <View style={styles.carouselHeader}>
          <Text style={[styles.carouselTitle, { color: COLORS.text }]}>
            {label}
          </Text>
          <TouchableOpacity
            style={styles.carouselSeeAll}
            onPress={() => setActiveDetailSection(key)}
          >
            <Text style={[styles.carouselSeeAllText, { color: COLORS.accent }]}>
              Ver todo ➔
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          horizontal
          data={data}
          renderItem={({ item }) => renderBookItem(item, true)}
          keyExtractor={item => `${key}_${item.id}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselListContent}
        />
      </View>
    );
  };

  if (showSplash) {
    const widthInterpolate = progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    });

    return (
      <View style={[styles.splashContainer, { backgroundColor: COLORS.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.splashContent}>
          <Text style={[styles.splashTitle, { color: COLORS.text }]}>InkTrick</Text>
          <Text style={[styles.splashSubtitle, { color: COLORS.text + '90' }]}>
            インクトリック
          </Text>
          
          <View style={[
            styles.progressBarOuter, 
            { 
              backgroundColor: '#161616',
              borderColor: COLORS.border
            }
          ]}>
            <Animated.View style={[
              styles.progressBarInner,
              {
                backgroundColor: COLORS.accent,
                width: widthInterpolate,
              }
            ]} />
          </View>
        </View>
      </View>
    );
  }

  // ─── Render Principal ──────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Header */}
      {isSelectionMode ? (
        <View style={[styles.header, { borderBottomColor: COLORS.border, backgroundColor: COLORS.surface }]}>
          <Text style={[styles.headerTitle, { color: COLORS.text, fontSize: 18 }]}>
            {selectedBookIds.length} seleccionados
          </Text>
          <TouchableOpacity
            style={[styles.cancelButton, { borderColor: COLORS.border }]}
            onPress={cancelSelection}
          >
            <Text style={[styles.cancelButtonText, { color: COLORS.accent }]}>
              Cancelar
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <Text style={[styles.headerTitle, { color: COLORS.text }]}>
            InkTrick
          </Text>
          <View style={styles.headerButtonsRow}>
            <TouchableOpacity
              style={[styles.scanButton, { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, marginRight: 8 }]}
              onPress={handleScan}
              disabled={isScanning}
            >
              <Text style={[styles.scanButtonText, { color: COLORS.text }]}>
                ⊞ Escanear
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scanButton, { backgroundColor: COLORS.accent, opacity: scannedFolders.some(f => f.enabled) ? 1 : 0.5 }]}
              onPress={refreshLibrary}
              disabled={isScanning || !scannedFolders.some(f => f.enabled)}
            >
              <Text style={[styles.scanButtonText, { color: '#0A0A0A' }]}>
                ↻ Actualizar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cuerpo principal */}
      {isScanning ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.loadingText, { color: COLORS.text }]}>
            Indexando carpeta seleccionada...
          </Text>
        </View>
      ) : activeDetailSection === null ? (
        /* VISTA DE INICIO (Home con Carruseles) */
        <ScrollView 
          contentContainerStyle={styles.homeScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Sección Reciente... (Split Layout con Portada Grande y Datos del Libro) */}
          {recentBooks.length > 0 && (
            <View style={styles.recentSectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Reciente...</Text>
                <TouchableOpacity onPress={() => setActiveDetailSection('recent')}>
                  <Text style={[styles.sectionMoreLink, { color: COLORS.accent }]}>Ver todo →</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity
                style={styles.recentSplitCard}
                onPress={() => handleBookPress(recentBooks[0])}
                onLongPress={() => handleBookLongPress(recentBooks[0])}
                activeOpacity={0.8}
              >
                {/* Columna Izquierda: Portada Grande */}
                <View style={styles.recentLeftColumn}>
                  {recentBooks[0].coverUri ? (
                    <Image
                      source={{ uri: recentBooks[0].coverUri }}
                      style={styles.recentCoverImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.recentFormatPlaceholder}>
                      <Text style={[styles.recentFormatBadge, { color: '#FFFFFF' }]}>PDF</Text>
                    </View>
                  )}

                  {/* Barra de progreso de lectura en la portada */}
                  {(() => {
                    const bookProgress = progress[recentBooks[0].id];
                    const percentage = bookProgress ? Math.round(bookProgress.percentage) : 0;
                    if (percentage === 100) {
                      return (
                        <View style={styles.readBanner}>
                          <Text style={styles.readBannerText}>LEÍDO</Text>
                        </View>
                      );
                    } else if (percentage > 0) {
                      return (
                        <View style={styles.recentCoverProgressOverlay}>
                          <View style={styles.recentCoverProgressBarBackground}>
                            <View style={[styles.recentCoverProgressBar, { width: `${percentage}%` }]} />
                          </View>
                          <Text style={styles.recentCoverProgressText}>{percentage}%</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* Banda inferior flotante "Abriendo..." en la portada reciente del lobby */}
                  {preparingBookId === recentBooks[0].id && (
                    <View style={styles.cardLoadingOverlay}>
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.cardLoadingText}>Abriendo...</Text>
                    </View>
                  )}
                </View>

                {/* Columna Derecha: Detalles del libro */}
                <View style={styles.recentRightColumn}>
                  <Text style={[styles.recentBookTitle, { color: COLORS.text }]} numberOfLines={2}>
                    {recentBooks[0].title}
                  </Text>
                  
                  {/* Páginas y porcentaje */}
                  {(() => {
                    const bookProgress = progress[recentBooks[0].id];
                    if (bookProgress) {
                      const pct = Math.round(bookProgress.percentage);
                      if (pct === 100) {
                        return (
                          <Text style={styles.recentProgressMeta}>
                            Lectura finalizada
                          </Text>
                        );
                      }
                      return (
                        <Text style={styles.recentProgressMeta}>
                          Página {bookProgress.currentPage + 1} de {bookProgress.totalPages} ({pct}%)
                        </Text>
                      );
                    }
                    return (
                      <Text style={styles.recentProgressMeta}>
                        Sin comenzar a leer
                      </Text>
                    );
                  })()}

                  {/* Información del archivo */}
                  <Text style={styles.recentFileMeta}>
                    {recentBooks[0].format.toUpperCase()} · {(recentBooks[0].fileSize / (1024 * 1024)).toFixed(1)} MB
                  </Text>

                  {/* Autor y Descripción */}
                  <Text style={styles.recentLabel}>Autor:</Text>
                  <Text style={styles.recentValue} numberOfLines={1}>
                    Manga local / No especificado
                  </Text>

                  <Text style={styles.recentLabel}>Descripción:</Text>
                  <Text style={styles.recentDescription} numberOfLines={3}>
                    Continúa la lectura de tu manga justo donde la dejaste. Toca la portada para abrir el lector.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {favoriteBooks.length > 0 && renderCarouselSection('favorites', '★ Favoritos', favoriteBooks)}
          
          {/* Listado de Colecciones (Carpetas) */}
          {foldersList.map(folder => 
            renderCarouselSection(folder.name, `⊞ ${folder.name}`, folder.books)
          )}

          {books.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>⊞</Text>
              <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
                Biblioteca vacía
              </Text>
              <Text style={[styles.emptySubtitle, { color: COLORS.text + '80' }]}>
                Presiona "Escanear" para seleccionar las carpetas donde tienes guardados tus archivos PDF.
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        /* VISTA DE DETALLE (Grid completo de una Sección o Carpeta) */
        <View style={{ flex: 1 }}>
          <View style={[styles.folderSubheader, { borderBottomColor: COLORS.border }]}>
            <TouchableOpacity
              style={[styles.backButton, { borderColor: COLORS.border, backgroundColor: COLORS.surface }]}
              onPress={() => setActiveDetailSection(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.backButtonText, { color: COLORS.text }]}>
                Volver
              </Text>
            </TouchableOpacity>
            <Text style={[styles.folderSubheaderTitle, { color: COLORS.text }]} numberOfLines={1}>
              {activeDetailSection === 'recent' 
                ? 'Historial de lectura' 
                : activeDetailSection === 'favorites' 
                ? 'Favoritos' 
                : `Colección: ${activeDetailSection}`}
            </Text>
          </View>

          {displayBooks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>⊞</Text>
              <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
                Colección vacía
              </Text>
            </View>
          ) : (
            <FlatList
              data={displayBooks}
              renderItem={({ item }) => renderBookItem(item, false)}
              keyExtractor={item => item.id}
              numColumns={numColumns}
              key={`books_${numColumns}`}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: isSelectionMode ? 100 : 20 },
              ]}
              columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* Barra de acciones flotante en lote */}
      {isSelectionMode && (
        <View style={[styles.floatingActionBar, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleToggleFavoriteBatch}
          >
            <Text style={styles.actionButtonIcon}>★</Text>
            <Text style={[styles.actionButtonText, { color: COLORS.text }]}>Favorito</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setIsFolderModalVisible(true)}
          >
            <Text style={styles.actionButtonIcon}>⊞</Text>
            <Text style={[styles.actionButtonText, { color: COLORS.text }]}>Agrupar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleDeleteBatch}
          >
            <TrashIcon color={COLORS.text} />
            <Text style={[styles.actionButtonText, { color: COLORS.text, marginTop: 4 }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal para agrupar libros en colecciones/carpetas */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isFolderModalVisible}
        onRequestClose={() => setIsFolderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>
              Agrupar en Colección
            </Text>
            <Text style={[styles.modalSubtitle, { color: COLORS.text + '80' }]}>
              Ingresa el nombre de la colección para clasificar los libros seleccionados:
            </Text>
            <TextInput
              style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.background }]}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="Ej: Shonen, Seinen, Josei"
              placeholderTextColor={COLORS.text + '40'}
              autoFocus={true}
            />

            {/* Colecciones existentes para asignación rápida */}
            {(() => {
              const existingFolders = foldersList.filter(f => f.name !== 'Sin clasificar');
              if (existingFolders.length === 0) return null;
              return (
                <View style={{ marginTop: 16, width: '100%' }}>
                  <Text style={[styles.modalSectionLabel, { color: COLORS.text + '70', fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
                    O agrúpalos en una existente:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.existingFoldersPillsContainer}
                  >
                    {existingFolders.map(folder => (
                      <TouchableOpacity
                        key={folder.name}
                        style={[styles.existingFolderPill, { backgroundColor: COLORS.background, borderColor: COLORS.border, borderWidth: 1 }]}
                        onPress={() => handleAssignToExistingFolder(folder.name)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.existingFolderPillText, { color: COLORS.text }]}>
                          ⊞ {folder.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              );
            })()}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setNewFolderName('');
                  setIsFolderModalVisible(false);
                }}
              >
                <Text style={[styles.modalButtonText, { color: COLORS.text }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, { backgroundColor: COLORS.accent }]}
                onPress={handleAssignFolderBatch}
              >
                <Text style={[styles.modalButtonText, { color: '#0A0A0A' }]}>
                  Confirmar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Gestor de Carpetas (Escanear) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isFoldersModalVisible}
        onRequestClose={() => setIsFoldersModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.foldersModalContent, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <View style={styles.foldersModalHeader}>
              <Text style={[styles.modalTitle, { color: COLORS.text, marginBottom: 0 }]}>
                Gestor de Carpetas
              </Text>
              <TouchableOpacity
                onPress={() => setIsFoldersModalVisible(false)}
                style={styles.foldersCloseButton}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '300' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: COLORS.text + '80', marginTop: 4, marginBottom: 16 }]}>
              Selecciona las carpetas activas de las que deseas importar mangas a tu biblioteca:
            </Text>

            {scannedFolders.length === 0 ? (
              <View style={styles.foldersEmptyContainer}>
                <Text style={styles.foldersEmptyIcon}>⊞</Text>
                <Text style={[styles.foldersEmptyText, { color: COLORS.text }]}>
                  No hay carpetas agregadas
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.foldersListContainer} showsVerticalScrollIndicator={true}>
                {scannedFolders.map(folder => (
                  <View
                    key={folder.uri}
                    style={[styles.folderRowItem, { borderBottomColor: COLORS.border + '30' }]}
                  >
                    <TouchableOpacity
                      style={styles.folderRowClickable}
                      onPress={() => toggleFolder(folder.uri)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.checkboxSquare,
                          {
                            backgroundColor: folder.enabled ? COLORS.accent : 'transparent',
                            borderColor: folder.enabled ? COLORS.accent : COLORS.border,
                          },
                        ]}
                      >
                        {folder.enabled && <Text style={styles.checkboxCheckSymbol}>✓</Text>}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.folderRowName, { color: COLORS.text }]} numberOfLines={1}>
                          {folder.name.replace(/^primary:/i, '')}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          'Eliminar carpeta',
                          `¿Estás seguro de que deseas eliminar la carpeta "${folder.name}" y todos sus mangas de la biblioteca?`,
                          [
                            { text: 'Cancelar', style: 'cancel' },
                            {
                              text: 'Eliminar',
                              style: 'destructive',
                              onPress: () => deleteFolder(folder.uri),
                            },
                          ]
                        );
                      }}
                      style={styles.folderRowDelete}
                    >
                      <TrashIcon color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={[styles.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.foldersAddButton, { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1 }]}
                onPress={async () => {
                  await addFolderAndIndex();
                }}
              >
                <Text style={[styles.foldersAddButtonText, { color: COLORS.text }]}>
                  + Agregar carpeta
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, { backgroundColor: COLORS.accent, flex: 0.8 }]}
                onPress={() => setIsFoldersModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: '#0A0A0A' }]}>
                  Listo
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: 20,
  },
  row: {
    gap: 12,
    marginBottom: 12,
  },
  bookCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  coverContainer: {
    height: 170,
    width: '100%',
    backgroundColor: '#1A1A1A',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPdf: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1A1A1A',
  },
  formatPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  formatBadge: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bookInfo: {
    padding: 10,
  },
  bookTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  favoriteIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 64,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    fontSize: 80,
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  splashSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  progressBarOuter: {
    width: 200,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderTopColor: 'rgba(0, 0, 0, 0.4)',
    borderLeftColor: 'rgba(0, 0, 0, 0.4)',
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 7,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 0, 0, 0.25)',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  checkboxContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  checkboxCheck: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '900',
  },
  floatingActionBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    width: 80,
  },
  actionButtonIcon: {
    fontSize: 22,
    marginBottom: 2,
    color: '#F0F0F0',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F0F0F0',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: {
    backgroundColor: 'transparent',
  },
  modalConfirmButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  modalButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  folderSubheader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 16,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  folderSubheaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  // Nuevos estilos para Carruseles horizontales
  homeScrollContent: {
    paddingBottom: 40,
  },
  carouselSection: {
    marginTop: 20,
  },
  carouselHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  carouselTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  carouselSeeAll: {
    padding: 4,
  },
  carouselSeeAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  carouselListContent: {
    paddingHorizontal: 20,
  },
  // Barra de progreso elegante sobre la portada
  coverProgressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverProgressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginRight: 6,
  },
  coverProgressBar: {
    height: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  coverProgressText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  lobbyLoadingOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 9999,
  },
  lobbyLoadingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  lobbyLoadingSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  cardLoadingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(20, 20, 35, 0.92)',
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLoadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  recentSectionContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionMoreLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  recentSplitCard: {
    flexDirection: 'row',
    borderRadius: 0,
    overflow: 'hidden',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  recentLeftColumn: {
    width: '32%',
    aspectRatio: 0.7,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1A1A1A',
  },
  recentCoverImage: {
    width: '100%',
    height: '100%',
  },
  recentFormatPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentFormatBadge: {
    fontSize: 24,
    fontWeight: '900',
  },
  recentCoverProgressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentCoverProgressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  recentCoverProgressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
  },
  recentCoverProgressText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  recentRightColumn: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  recentBookTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    lineHeight: 22,
  },
  recentProgressMeta: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  recentFileMeta: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 6,
  },
  recentLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accent,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  recentValue: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 2,
  },
  recentDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 16,
  },
  foldersModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    maxHeight: '80%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  foldersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  foldersCloseButton: {
    padding: 4,
  },
  foldersEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  foldersEmptyIcon: {
    fontSize: 40,
    marginBottom: 8,
    opacity: 0.5,
  },
  foldersEmptyText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.5,
  },
  foldersListContainer: {
    maxHeight: 250,
  },
  folderRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  folderRowClickable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCheckSymbol: {
    color: '#0A0A0A',
    fontSize: 12,
    fontWeight: '900',
  },
  folderRowName: {
    fontSize: 14,
    fontWeight: '700',
  },
  folderRowUri: {
    fontSize: 11,
    marginTop: 2,
  },
  folderRowDelete: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  foldersAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1.2,
  },
  foldersAddButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  existingFoldersPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  existingFolderPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  existingFolderPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  readBanner: {
    position: 'absolute',
    top: 12,
    right: -25,
    backgroundColor: '#0A0A0A',
    paddingVertical: 3,
    paddingHorizontal: 28,
    transform: [{ rotate: '45deg' }],
    zIndex: 5,
    elevation: 3,
  },
  readBannerText: {
    color: '#F0F0F0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
});
