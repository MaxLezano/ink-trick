/**
 * InkTrick - Reader Screen
 * Lector de PDF manga/anime con scroll infinito vertical (de abajo hacia arriba).
 * Sin paginación forzada, sin overlay de controles, sin temas.
 * Solo lectura continua y botón de volver.
 */
import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
  TextInput,
  useWindowDimensions,
  FlatList,
  Image,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { RootStackParamList } from '../utils/types';
import { COLORS } from '../utils/constants';
import { useLibraryStore } from '../store/libraryStore';
import * as StorageService from '../services/storageService';
import { ReadingProgress, BookSettings } from '../utils/types';
import { PdfJsViewer } from '../components/PdfJsViewer';

let PdfComponent: any = null;
let isPdfSupported = false;

try {
  const requirePdf = require('react-native-pdf');
  PdfComponent = requirePdf.default || requirePdf;
  isPdfSupported = !!PdfComponent;
} catch (error) {
  console.log('[ReaderScreen] react-native-pdf not supported in this environment.');
}

interface PageImageInfo {
  uri: string;
  width: number;
  height: number;
}

interface ContinuousManhwaReaderProps {
  pdfUri: string;
  totalPages: number;
  initialPage: number;
  onPageChanged: (pageIndex: number) => void;
  onToggleMenu: () => void;
  screenWidth: number;
}

const ContinuousManhwaReader: React.FC<ContinuousManhwaReaderProps> = React.memo(({
  pdfUri,
  totalPages,
  initialPage,
  onPageChanged,
  onToggleMenu,
  screenWidth,
}) => {
  const [pageCache, setPageCache] = useState<Record<number, PageImageInfo>>({});
  const pageCacheRef = useRef<Record<number, PageImageInfo>>({});
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const flatListRef = useRef<FlatList>(null);

  const [realTotalPages, setRealTotalPages] = useState<number>(totalPages || 0);

  const cleanPath = useMemo(() => {
    return Platform.OS === 'android' ? pdfUri.replace('file://', '') : pdfUri;
  }, [pdfUri]);

  useEffect(() => {
    if (totalPages > 0) {
      setRealTotalPages(totalPages);
    }
  }, [totalPages]);

  // Si totalPages es 0 al montar, obtener inmediatamente el conteo nativo
  useEffect(() => {
    let active = true;
    async function fetchNativeCount() {
      if (realTotalPages > 0 || !cleanPath) return;
      try {
        const count = await (PdfThumbnail as any).getPageCount(cleanPath);
        if (count > 0 && active) {
          setRealTotalPages(count);
        }
      } catch (err) {
        console.warn('[ContinuousManhwaReader] Error fetching native page count:', err);
      }
    }
    fetchNativeCount();
    return () => { active = false; };
  }, [cleanPath, realTotalPages]);

  useEffect(() => {
    pageCacheRef.current = pageCache;
  }, [pageCache]);

  const callbacksRef = useRef({ onPageChanged, realTotalPages, screenWidth, cleanPath });
  useEffect(() => {
    callbacksRef.current = { onPageChanged, realTotalPages, screenWidth, cleanPath };
  }, [onPageChanged, realTotalPages, screenWidth, cleanPath]);

  const prefetchPagesAround = useCallback(async (centerIndex: number) => {
    const { realTotalPages: total, screenWidth: sw, cleanPath: path } = callbacksRef.current;
    if (total <= 0) return;

    const targetIndices: number[] = [];
    for (let offset = -3; offset <= 8; offset++) {
      const idx = centerIndex + offset;
      if (idx >= 0 && idx < total) {
        targetIndices.push(idx);
      }
    }

    for (const idx of targetIndices) {
      if (pageCacheRef.current[idx] || loadingPagesRef.current.has(idx)) {
        continue;
      }

      loadingPagesRef.current.add(idx);

      try {
        const result = await PdfThumbnail.generate(path, idx);
        if (result && result.uri) {
          const info: PageImageInfo = {
            uri: result.uri,
            width: result.width || sw,
            height: result.height || Math.round(sw * 1.4),
          };
          pageCacheRef.current = { ...pageCacheRef.current, [idx]: info };
          setPageCache(prev => ({ ...prev, [idx]: info }));
        }
      } catch (err) {
        console.warn(`[ContinuousManhwaReader] Error generating thumbnail for page ${idx}:`, err);
      } finally {
        loadingPagesRef.current.delete(idx);
      }
    }
  }, []);

  useEffect(() => {
    if (realTotalPages > 0) {
      const startIdx = Math.max(0, Math.min(initialPage - 1, realTotalPages - 1));
      prefetchPagesAround(startIdx);
    }
  }, [initialPage, realTotalPages, prefetchPagesAround]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: number }> }) => {
    if (viewableItems && viewableItems.length > 0) {
      const firstVisible = viewableItems[0].item;
      callbacksRef.current.onPageChanged(firstVisible + 1);
      prefetchPagesAround(firstVisible);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 1,
    minimumViewTime: 30,
  }).current;

  const pagesArray = useMemo(() => Array.from({ length: realTotalPages }, (_, i) => i), [realTotalPages]);

  const renderItem = useCallback(({ item: pageIndex }: { item: number }) => {
    const pageInfo = pageCache[pageIndex];

    if (pageInfo) {
      const computedHeight = (screenWidth / pageInfo.width) * pageInfo.height;
      return (
        <TouchableWithoutFeedback onPress={onToggleMenu}>
          <View style={{ width: screenWidth, height: computedHeight, backgroundColor: '#000' }}>
            <Image
              source={{ uri: pageInfo.uri }}
              style={{ width: screenWidth, height: computedHeight }}
              resizeMode="contain"
              fadeDuration={0}
            />
          </View>
        </TouchableWithoutFeedback>
      );
    }

    return (
      <TouchableWithoutFeedback onPress={onToggleMenu}>
        <View
          style={{
            width: screenWidth,
            height: Math.round(screenWidth * 1.4),
            backgroundColor: '#121212',
            justifyContent: 'center',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: '#222',
          }}
        >
          <ActivityIndicator size="small" color={COLORS.accent} />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 }}>
            Cargando página {pageIndex + 1}...
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [pageCache, screenWidth, onToggleMenu]);

  useEffect(() => {
    if (initialPage >= 1 && flatListRef.current && realTotalPages > 0) {
      const targetIdx = Math.max(0, Math.min(initialPage - 1, realTotalPages - 1));
      prefetchPagesAround(targetIdx);
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({ index: targetIdx, animated: false });
        } catch (e) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }, 50);
    }
  }, [initialPage, realTotalPages, prefetchPagesAround]);

  if (realTotalPages <= 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000', gap: 12 }}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' }}>
          Cargando Manhwa...
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={flatListRef}
      data={pagesArray}
      keyExtractor={(item) => item.toString()}
      renderItem={renderItem}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={3}
      maxToRenderPerBatch={4}
      windowSize={7}
      updateCellsBatchingPeriod={20}
      showsVerticalScrollIndicator={false}
      style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#000000' }}
      onScrollToIndexFailed={(info) => {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
        }, 50);
      }}
    />
  );
});

type ReaderNavigationProp = StackNavigationProp<RootStackParamList, 'Reader'>;
type ReaderRouteProp = RouteProp<RootStackParamList, 'Reader'>;

interface Props {
  navigation: ReaderNavigationProp;
  route: ReaderRouteProp;
}

export default function ReaderScreen({ navigation, route }: Props) {
  const { bookId } = route.params;
  const { width: W, height: H } = useWindowDimensions();

  // Store
  const books = useLibraryStore(state => state.books);
  const currentBook = books.find(b => b.id === bookId);

  // Estado local del lector
  const [localPdfUri, setLocalPdfUri] = useState<string | null>(null);
  const [isPreparingFile, setIsPreparingFile] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [initialPage, setInitialPage] = useState<number>(1);
  const [isPdfLoaded, setIsPdfLoaded] = useState<boolean>(false);
  const [isProgressRestored, setIsProgressRestored] = useState<boolean>(false);
  const [settings, setSettings] = useState<BookSettings | null>(null);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState<boolean>(false);
  const settingsRef = useRef<BookSettings | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Estados de Gestos y Opciones
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [showOptionsModal, setShowOptionsModal] = useState<boolean>(false);
  const [inputPage, setInputPage] = useState<string>('');

  // Refs para prevenir clausuras obsoletas en callbacks nativos (guardado de posición robusto)
  const bookIdRef = useRef<string>(bookId);
  const currentPageRef = useRef<number>(0);
  const totalPagesRef = useRef<number>(0);

  // Sincronizar los valores de los refs con el estado
  useEffect(() => {
    bookIdRef.current = bookId;
  }, [bookId]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  // ─── Preparación del archivo (cache de content://) ─────────────────────
  useEffect(() => {
    let active = true;

    async function prepareFile() {
      if (!currentBook) return;

      // Si ya se pre-cargó en el lobby (Dashboard) y se nos pasó la ruta preparada
      const preparedPath = route.params?.preparedPath;
      if (preparedPath) {
        console.log('[ReaderScreen] Using pre-loaded prepared path:', preparedPath);
        if (active) {
          setLocalPdfUri(preparedPath);
          setIsPreparingFile(false);
        }
        return;
      }

      setIsPreparingFile(true);
      try {
        const path = currentBook.filePath;
        console.log('[ReaderScreen] Preparing file, original path:', path);
        
        // Solo copiamos si es PDF y tiene ruta externa (ej: content:// en Android)
          let finalUri = path;
          if (isPdfSupported && path.startsWith('content://')) {
            const safeFileName = `${currentBook.id}.pdf`;
            const tempUri = `${FileSystem.cacheDirectory}${safeFileName}`;
            
            const info = await FileSystem.getInfoAsync(tempUri);
            if (!info.exists) {
              await FileSystem.copyAsync({
                from: path,
                to: tempUri,
              });
            }
            finalUri = tempUri;
          }

          if (active) {
            setLocalPdfUri(finalUri);
            try {
              const cleanPath = Platform.OS === 'android' ? finalUri.replace('file://', '') : finalUri;
              const count = await (PdfThumbnail as any).getPageCount(cleanPath);
              if (count > 0 && active) {
                setTotalPages(count);
                totalPagesRef.current = count;
                setIsPdfLoaded(true);
              }
            } catch (e) {
              console.warn('[ReaderScreen] Could not fetch native page count:', e);
            }
          }
      } catch (error) {
        console.error('[ReaderScreen] Error preparing local PDF cache:', error);
        if (active) {
          setLocalPdfUri(currentBook.filePath);
        }
      } finally {
        if (active) {
          setIsPreparingFile(false);
        }
      }
    }

    prepareFile();

    return () => {
      active = false;
    };
  }, [currentBook, route.params?.preparedPath]);

  // ─── Restaurar progreso y configuración guardados ─────────────────────
  useEffect(() => {
    // Reiniciar estados locales para evitar arrastrar datos de otros libros
    setCurrentPage(0);
    setTotalPages(0);
    setInitialPage(1);
    setIsPdfLoaded(false);
    setIsProgressRestored(false);
    setIsSettingsLoaded(false);

    async function restoreProgressAndSettings() {
      try {
        const loadedSettings = await StorageService.getBookSettings(bookId);
        setSettings(loadedSettings);
        setIsSettingsLoaded(true);

        const progress = await StorageService.getProgress(bookId);
        if (progress) {
          setCurrentPage(progress.currentPage);
          setTotalPages(progress.totalPages);
          if (loadedSettings.isRTL && loadedSettings.isHorizontal && progress.totalPages > 0) {
            setInitialPage(progress.totalPages - progress.currentPage);
          } else {
            setInitialPage(progress.currentPage + 1);
          }
        } else {
          setCurrentPage(0);
          setInitialPage(1);
          setTotalPages(0);
        }
      } catch (error) {
        console.error('[ReaderScreen] Error restoring progress and settings:', error);
      } finally {
        setIsProgressRestored(true);
      }
    }

    restoreProgressAndSettings();
  }, [bookId]);

  // ─── Guardar progreso al salir (Cualquier gesto, botón físico o superior) ─
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const bId = bookIdRef.current;
      const page = currentPageRef.current;
      const total = totalPagesRef.current;

      if (bId && total > 0) {
        const pct = total > 1 ? (page / (total - 1)) * 100 : 100;
        const progress: ReadingProgress = {
          bookId: bId,
          currentPage: page,
          totalPages: total,
          percentage: Math.min(100, Math.max(0, pct)),
          lastReadAt: Date.now(),
        };
        StorageService.saveProgress(progress, true).then(() => {
          StorageService.flushProgress();
          useLibraryStore.getState().reloadProgress();
        });
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handlePdfLoadComplete = useCallback((numberOfPages: number) => {
    setTotalPages(numberOfPages);
    totalPagesRef.current = numberOfPages;
    
    const isRtlMode = settingsRef.current && settingsRef.current.isRTL && settingsRef.current.isHorizontal;
    if (isRtlMode && currentPageRef.current === 0 && initialPage === 1) {
      setInitialPage(numberOfPages);
      return;
    }
    
    setIsPdfLoaded(true);
    
    const bId = bookIdRef.current;
    const page = currentPageRef.current;
    
    if (bId) {
      const pct = numberOfPages > 1 ? (page / (numberOfPages - 1)) * 100 : 100;
      const progress: ReadingProgress = {
        bookId: bId,
        currentPage: page,
        totalPages: numberOfPages,
        percentage: Math.min(100, Math.max(0, pct)),
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress);
    }
  }, [initialPage]);

  const handlePdfPageChanged = useCallback((page: number) => {
    const total = totalPagesRef.current;
    const isRtlMode = settingsRef.current && settingsRef.current.isRTL && settingsRef.current.isHorizontal;
    const logicalPage = (isRtlMode && total > 0)
      ? total - page
      : page - 1;

    setCurrentPage(logicalPage);
    currentPageRef.current = logicalPage;
    
    const bId = bookIdRef.current;
    
    // Guardar progreso en segundo plano inmediatamente
    if (bId && total > 0) {
      const pct = total > 1 ? (logicalPage / (total - 1)) * 100 : 100;
      const progress: ReadingProgress = {
        bookId: bId,
        currentPage: logicalPage,
        totalPages: total,
        percentage: Math.min(100, Math.max(0, pct)),
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress);
    }
  }, []);


  const updateSettings = useCallback(async (newSettings: BookSettings) => {
    setSettings(newSettings);
    if (totalPages > 0) {
      const physicalPage = newSettings.isRTL && newSettings.isHorizontal
        ? totalPages - currentPage
        : currentPage + 1;
      setInitialPage(physicalPage);
    }
    await StorageService.saveBookSettings(bookId, newSettings);
  }, [bookId, currentPage, totalPages]);

  const handleResetProgress = useCallback(async () => {
    Alert.alert(
      'Reiniciar lectura',
      '¿Quieres volver al comienzo del libro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, reiniciar',
          onPress: async () => {
            setCurrentPage(0);
            const isRtl = settings && settings.isRTL && settings.isHorizontal;
            const targetPhysicalPage = (isRtl && totalPages > 0) ? totalPages : 1;
            
            // Forzar actualización de initialPage incluso si ya valía 1
            setInitialPage(0);
            setTimeout(() => {
              setInitialPage(targetPhysicalPage);
            }, 10);
            
            if (bookId && totalPages > 0) {
              const progress: ReadingProgress = {
                bookId,
                currentPage: 0,
                totalPages,
                percentage: 0,
                lastReadAt: Date.now(),
              };
              await StorageService.saveProgress(progress, true);
              await StorageService.flushProgress();
              await useLibraryStore.getState().reloadProgress();
            }
            setShowOptionsModal(false);
            setShowMenu(false);
          },
        },
      ]
    );
  }, [bookId, totalPages, settings]);

  const handleGoToPage = useCallback(() => {
    const pageNum = parseInt(inputPage, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      Alert.alert('Error', `Por favor ingresa una página válida entre 1 y ${totalPages}.`);
      return;
    }
    const logicalPage = pageNum - 1;
    setCurrentPage(logicalPage);
    
    const isRtl = settings && settings.isRTL && settings.isHorizontal;
    const targetPhysicalPage = (isRtl && totalPages > 0) ? totalPages - logicalPage : pageNum;
    
    setInitialPage(0);
    setTimeout(() => {
      setInitialPage(targetPhysicalPage);
    }, 10);
    
    if (bookId) {
      const progress: ReadingProgress = {
        bookId,
        currentPage: logicalPage,
        totalPages,
        percentage: (logicalPage) / totalPages * 100,
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress, true);
    }
    
    setShowOptionsModal(false);
    setShowMenu(false);
    setInputPage('');
  }, [inputPage, totalPages, bookId, settings]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Zona táctil superior invisible (7% del alto de la pantalla) para abrir el menú */}
      {!showMenu && isPdfLoaded && (
        <TouchableOpacity
          style={styles.menuTriggerZone}
          onPress={() => setShowMenu(true)}
          activeOpacity={1}
        />
      )}

      {/* Área de lectura - Motor nativo react-native-pdf con renderizado C++ Pdfium de alta nitidez */}
      {isPreparingFile ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      ) : isPdfSupported && localPdfUri && isProgressRestored && isSettingsLoaded && settings ? (() => {
        const pdfSourceUri = Platform.OS === 'android' ? localPdfUri.replace('file://', '') : localPdfUri;

        return (
          <View style={{ flex: 1, width: '100%', height: '100%' }}>
            <PdfComponent
              key={`pdf_${settings.isHorizontal}_${settings.usePaging}_${settings.fitMode}_${settings.isRTL}_${initialPage}`}
              source={{ uri: pdfSourceUri, cache: true }}
              page={initialPage}
              onPageChanged={handlePdfPageChanged}
              onLoadComplete={handlePdfLoadComplete}
              style={[styles.pdfView, { width: W, height: H }]}
              enableAntialiasing={true}
              horizontal={settings.isHorizontal}
              enablePaging={settings.usePaging}
              fitPolicy={settings.fitMode}
              spacing={0}
              enableDoubleTapZoom={settings.enableDoubleTapZoom}
              minScale={1.0}
              maxScale={4.0}
              pointerEvents="auto"
              onError={(error: any) => {
                console.error('[ReaderScreen] Error rendering PDF:', error);
              }}
            />
          </View>
        );
      })() : null}

      {/* Indicador de carga discreto de emergencia si aun no hay Uri */}
      {!localPdfUri && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      )}

      {/* Menú superior que aparece con doble toque */}
      {showMenu && (
        <View style={styles.topMenu}>
          <TouchableOpacity style={styles.menuButton} onPress={handleClose}>
            <Text style={styles.menuButtonText}>Volver</Text>
          </TouchableOpacity>
          <Text style={styles.menuTitle} numberOfLines={1}>
            {currentBook?.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={() => setShowOptionsModal(true)} style={{ padding: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '300' }}>⚙</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMenu(false)} style={{ padding: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '300' }}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal de opciones */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOptionsModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.optionsContainer}>
                <Text style={styles.optionsTitle}>Ajustes de lectura</Text>

                {/* Opción 3: Ir a una página específica */}
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>Ir a página:</Text>
                  <View style={styles.pageSelectInputContainer}>
                    <TextInput
                      style={styles.pageTextInput}
                      keyboardType="number-pad"
                      value={inputPage}
                      placeholder={`${currentPage + 1}`}
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      onChangeText={setInputPage}
                      maxLength={4}
                    />
                    <Text style={styles.pageTotalText}>/ {totalPages}</Text>
                    <TouchableOpacity style={styles.pageGoButton} onPress={handleGoToPage}>
                      <Text style={styles.pageGoButtonText}>Ir</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.divider} />

                {settings && (
                  <View>
                    {/* Orientación */}
                    <View style={styles.optionRow}>
                      <Text style={styles.optionLabel}>Orientación:</Text>
                      <View style={styles.optionButtons}>
                        <TouchableOpacity
                          style={[styles.optionBtn, !settings.isHorizontal && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, isHorizontal: false })}
                        >
                          <Text style={[styles.optionBtnText, !settings.isHorizontal && styles.optionBtnTextActive]}>Vertical</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.isHorizontal && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, isHorizontal: true })}
                        >
                          <Text style={[styles.optionBtnText, settings.isHorizontal && styles.optionBtnTextActive]}>Horizontal</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Paginación */}
                    <View style={styles.optionRow}>
                      <Text style={styles.optionLabel}>Desplazamiento:</Text>
                      <View style={styles.optionButtons}>
                        <TouchableOpacity
                          style={[styles.optionBtn, !settings.usePaging && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, usePaging: false })}
                        >
                          <Text style={[styles.optionBtnText, !settings.usePaging && styles.optionBtnTextActive]}>Continuo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.usePaging && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, usePaging: true })}
                        >
                          <Text style={[styles.optionBtnText, settings.usePaging && styles.optionBtnTextActive]}>Páginas</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Ajustar a */}
                    <View style={styles.optionRow}>
                      <Text style={styles.optionLabel}>Ajustar a:</Text>
                      <View style={styles.optionButtons}>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.fitMode === 0 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, fitMode: 0 })}
                        >
                          <Text style={[styles.optionBtnText, settings.fitMode === 0 && styles.optionBtnTextActive]}>Ancho</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.fitMode === 1 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, fitMode: 1 })}
                        >
                          <Text style={[styles.optionBtnText, settings.fitMode === 1 && styles.optionBtnTextActive]}>Alto</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.fitMode === 2 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, fitMode: 2 })}
                        >
                          <Text style={[styles.optionBtnText, settings.fitMode === 2 && styles.optionBtnTextActive]}>Ambos</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Dirección (Manga RTL) */}
                    {settings.isHorizontal && (
                      <View style={styles.optionRow}>
                        <Text style={styles.optionLabel}>Dirección (Manga):</Text>
                        <View style={styles.optionButtons}>
                          <TouchableOpacity
                            style={[styles.optionBtn, !settings.isRTL && styles.optionBtnActive]}
                            onPress={() => updateSettings({ ...settings, isRTL: false })}
                          >
                            <Text style={[styles.optionBtnText, !settings.isRTL && styles.optionBtnTextActive]}>Izq ➔ Der</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.optionBtn, settings.isRTL && styles.optionBtnActive]}
                            onPress={() => updateSettings({ ...settings, isRTL: true })}
                          >
                            <Text style={[styles.optionBtnText, settings.isRTL && styles.optionBtnTextActive]}>Der ➔ Izq</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Zoom Doble Toque */}
                    <View style={styles.optionRow}>
                      <Text style={styles.optionLabel}>Zoom Doble Toque:</Text>
                      <View style={styles.optionButtons}>
                        <TouchableOpacity
                          style={[styles.optionBtn, !settings.enableDoubleTapZoom && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, enableDoubleTapZoom: false })}
                        >
                          <Text style={[styles.optionBtnText, !settings.enableDoubleTapZoom && styles.optionBtnTextActive]}>No</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.enableDoubleTapZoom && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, enableDoubleTapZoom: true })}
                        >
                          <Text style={[styles.optionBtnText, settings.enableDoubleTapZoom && styles.optionBtnTextActive]}>Sí</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Filtro de brillo */}
                    <View style={styles.optionRow}>
                      <Text style={styles.optionLabel}>Filtro brillo:</Text>
                      <View style={styles.optionButtons}>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.brightnessDimmer === 0 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, brightnessDimmer: 0 })}
                        >
                          <Text style={[styles.optionBtnText, settings.brightnessDimmer === 0 && styles.optionBtnTextActive]}>0%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.brightnessDimmer === 0.2 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, brightnessDimmer: 0.2 })}
                        >
                          <Text style={[styles.optionBtnText, settings.brightnessDimmer === 0.2 && styles.optionBtnTextActive]}>20%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.brightnessDimmer === 0.4 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, brightnessDimmer: 0.4 })}
                        >
                          <Text style={[styles.optionBtnText, settings.brightnessDimmer === 0.4 && styles.optionBtnTextActive]}>40%</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.optionBtn, settings.brightnessDimmer === 0.6 && styles.optionBtnActive]}
                          onPress={() => updateSettings({ ...settings, brightnessDimmer: 0.6 })}
                        >
                          <Text style={[styles.optionBtnText, settings.brightnessDimmer === 0.6 && styles.optionBtnTextActive]}>60%</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.divider} />
                  </View>
                )}

                {/* Acciones Rápidas */}
                <TouchableOpacity style={styles.actionRowButton} onPress={handleResetProgress}>
                  <Text style={styles.actionRowText}>↻ Reiniciar lectura</Text>
                </TouchableOpacity>

                {/* Cerrar Ajustes */}
                <TouchableOpacity
                  style={styles.closeModalButton}
                  onPress={() => setShowOptionsModal(false)}
                >
                  <Text style={styles.closeModalButtonText}>Listo</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Indicador de página (sutil, esquina inferior) */}
      {totalPages > 0 && isPdfLoaded && (
        <View style={styles.pageIndicator}>
          <Text style={styles.pageText}>
            {currentPage + 1} / {totalPages}
          </Text>
        </View>
      )}

      {/* Filtro nocturno / Dimmer overlay */}
      {settings && settings.brightnessDimmer > 0 && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: '#000000',
              opacity: settings.brightnessDimmer,
              zIndex: 9999,
            }
          ]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  pdfView: {
    flex: 1,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text + '90',
  },

  topMenu: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: 'rgba(15, 15, 15, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 1000,
  },
  menuTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  menuButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  closeMenuButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsContainer: {
    width: Dimensions.get('window').width * 0.85,
    maxWidth: 380,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  optionsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  optionLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  optionButtons: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 2,
  },
  optionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  optionBtnActive: {
    backgroundColor: COLORS.accent,
  },
  optionBtnText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  optionBtnTextActive: {
    color: '#0A0A0A',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  actionRowButton: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionRowText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  closeModalButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 14,
    color: '#0A0A0A',
    fontWeight: '700',
  },
  pageSelectInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pageTextInput: {
    width: 44,
    height: 28,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    padding: 0,
  },
  pageTotalText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 8,
    fontWeight: '600',
  },
  pageGoButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pageGoButtonText: {
    color: '#0A0A0A',
    fontSize: 12,
    fontWeight: '700',
  },
  pageIndicator: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pageText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingBarContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(26, 26, 46, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  menuTriggerZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '7%',
    zIndex: 999,
    backgroundColor: 'transparent',
  },
});
