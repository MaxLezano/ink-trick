/**
 * InkTrick - Reader Screen
 * Lector de PDF manga/anime con scroll infinito vertical (de abajo hacia arriba).
 * Sin paginación forzada, sin overlay de controles, sin temas.
 * Solo lectura continua y botón de volver.
 */
import React, { useEffect, useCallback, useState, useRef } from 'react';
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
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { RootStackParamList } from '../utils/types';
import { COLORS } from '../utils/constants';
import { useLibraryStore } from '../store/libraryStore';
import * as StorageService from '../services/storageService';
import { ReadingProgress } from '../utils/types';

let PdfComponent: any = null;
let isPdfSupported = false;

try {
  const requirePdf = require('react-native-pdf');
  PdfComponent = requirePdf.default || requirePdf;
  isPdfSupported = !!PdfComponent;
} catch (error) {
  console.log('[ReaderScreen] react-native-pdf not supported in this environment.');
}

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
        if (isPdfSupported && path.startsWith('content://')) {
          // Usamos el ID único del libro como nombre de archivo para evitar
          // problemas de ENOENT por caracteres especiales (espacios, paréntesis, #)
          const safeFileName = `${currentBook.id}.pdf`;
          const tempUri = `${FileSystem.cacheDirectory}${safeFileName}`;
          
          console.log('[ReaderScreen] Cache target path:', tempUri);

          // Verificar si ya existe para no copiar de nuevo inútilmente
          const info = await FileSystem.getInfoAsync(tempUri);
          if (!info.exists) {
            console.log('[ReaderScreen] Copying to cache...');
            await FileSystem.copyAsync({
              from: path,
              to: tempUri,
            });
            console.log('[ReaderScreen] Copy complete.');
          } else {
            console.log('[ReaderScreen] File already in cache, skipping copy.');
          }

          if (active) {
            setLocalPdfUri(tempUri);
          }
        } else {
          // Si es ruta local directa (file:///) o no requiere copiado
          console.log('[ReaderScreen] Local path, no copy needed.');
          if (active) {
            setLocalPdfUri(path);
          }
        }
      } catch (error) {
        console.error('[ReaderScreen] Error preparing local PDF cache:', error);
        // Intentar abrir el original como fallback en caso de error
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

  // ─── Restaurar progreso guardado ───────────────────────────────────────
  useEffect(() => {
    // Reiniciar estados locales para evitar arrastrar datos de otros libros
    setCurrentPage(0);
    setTotalPages(0);
    setInitialPage(1);
    setIsPdfLoaded(false);
    setIsProgressRestored(false);

    async function restoreProgress() {
      try {
        const progress = await StorageService.getProgress(bookId);
        if (progress) {
          setCurrentPage(progress.currentPage);
          setInitialPage(progress.currentPage + 1);
          setTotalPages(progress.totalPages);
        } else {
          setCurrentPage(0);
          setInitialPage(1);
          setTotalPages(0);
        }
      } catch (error) {
        console.error('[ReaderScreen] Error restoring progress:', error);
      } finally {
        setIsProgressRestored(true);
      }
    }

    restoreProgress();
  }, [bookId]);

  // ─── Guardar progreso al salir (Cualquier gesto, botón físico o superior) ─
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const bId = bookIdRef.current;
      const page = currentPageRef.current;
      const total = totalPagesRef.current;

      if (bId && total > 0) {
        const progress: ReadingProgress = {
          bookId: bId,
          currentPage: page,
          totalPages: total,
          percentage: (page / total) * 100,
          lastReadAt: Date.now(),
        };
        StorageService.saveProgress(progress).then(() => {
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
    setIsPdfLoaded(true);
    
    const bId = bookIdRef.current;
    const page = currentPageRef.current;
    
    if (bId) {
      const progress: ReadingProgress = {
        bookId: bId,
        currentPage: page,
        totalPages: numberOfPages,
        percentage: numberOfPages > 0 ? (page / numberOfPages) * 100 : 0,
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress);
    }
  }, []);

  const handlePdfPageChanged = useCallback((page: number) => {
    const newPage = page - 1;
    setCurrentPage(newPage); // react-native-pdf usa 1-indexed
    currentPageRef.current = newPage;
    
    const bId = bookIdRef.current;
    const total = totalPagesRef.current;
    
    // Guardar progreso en segundo plano inmediatamente
    if (bId && total > 0) {
      const progress: ReadingProgress = {
        bookId: bId,
        currentPage: newPage,
        totalPages: total,
        percentage: (newPage / total) * 100,
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress);
    }
  }, []);

  const handleOpenWithSystem = useCallback(async () => {
    if (!currentBook?.filePath) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(currentBook.filePath, {
          mimeType: 'application/pdf',
          dialogTitle: currentBook.title,
        });
      } else {
        Alert.alert('Error', 'El visualizador del sistema no está disponible.');
      }
    } catch (error) {
      console.error('[ReaderScreen] Error opening PDF with system:', error);
      Alert.alert('Error', 'No se pudo abrir el archivo PDF.');
    }
  }, [currentBook]);



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
            setInitialPage(1);
            if (bookId && totalPages > 0) {
              const progress: ReadingProgress = {
                bookId,
                currentPage: 0,
                totalPages,
                percentage: 0,
                lastReadAt: Date.now(),
              };
              await StorageService.saveProgress(progress);
              await useLibraryStore.getState().reloadProgress();
            }
            setShowOptionsModal(false);
            setShowMenu(false);
            // Forzar recarga rápida del visualizador de PDF al principio
            const temp = localPdfUri;
            setLocalPdfUri(null);
            setTimeout(() => setLocalPdfUri(temp), 50);
          },
        },
      ]
    );
  }, [bookId, totalPages, localPdfUri]);

  const handleGoToPage = useCallback(() => {
    const pageNum = parseInt(inputPage, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
      Alert.alert('Error', `Por favor ingresa una página válida entre 1 y ${totalPages}.`);
      return;
    }
    setCurrentPage(pageNum - 1);
    setInitialPage(pageNum);
    
    if (bookId) {
      const progress: ReadingProgress = {
        bookId,
        currentPage: pageNum - 1,
        totalPages,
        percentage: (pageNum - 1) / totalPages * 100,
        lastReadAt: Date.now(),
      };
      StorageService.saveProgress(progress);
    }
    
    setShowOptionsModal(false);
    setShowMenu(false);
    setInputPage('');
    
    // Forzar recreación del PDF al inicio
    const temp = localPdfUri;
    setLocalPdfUri(null);
    setTimeout(() => setLocalPdfUri(temp), 50);
  }, [inputPage, totalPages, localPdfUri, bookId]);

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

      {/* Área de lectura - Scroll infinito vertical */}
      {isPreparingFile ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>
            Cargando...
          </Text>
        </View>
      ) : isPdfSupported && localPdfUri ? (() => {
        // En Android, react-native-pdf requiere ruta absoluta sin esquema 'file://'
        const pdfSourceUri = Platform.OS === 'android'
          ? localPdfUri.replace('file://', '')
          : localPdfUri;
        console.log('[ReaderScreen] Feeding PDF source to component:', pdfSourceUri);
        return (
          <View
            style={[
              { flex: 1, width: '100%', height: '100%', opacity: isPdfLoaded ? 1 : 0 }
            ]}
          >
            {isProgressRestored && (
              <PdfComponent
                key="V_fixed_width"
                source={{ uri: pdfSourceUri, cache: false }}
                page={initialPage}
                onPageChanged={handlePdfPageChanged}
                onLoadComplete={handlePdfLoadComplete}
                style={[styles.pdfView, { width: W, height: H }]}
                enableAntialiasing={true}
                horizontal={false}
                enablePaging={false}
                fitPolicy={0}
                spacing={0}
                enableDoubleTapZoom={false}
                minScale={1.0}
                maxScale={4.0}
                pointerEvents="auto"
                onError={(error: any) => {
                  console.error('[ReaderScreen] Error rendering PDF:', error);
                }}
              />
            )}
          </View>
        );
      })() : (
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackIcon}>⊞</Text>
          <Text style={styles.fallbackTitle}>
            {currentBook?.title ?? 'Cargando...'}
          </Text>
          <Text style={styles.fallbackWarning}>
            Modo lectura limitada (Expo Go)
          </Text>
          <Text style={styles.fallbackDescription}>
            El motor de lectura integrado requiere compilar un Development Build de InkTrick.
            Sin embargo, puedes leer este archivo usando el visor de PDF nativo de tu sistema.
          </Text>
          <TouchableOpacity
            style={styles.openSystemButton}
            onPress={handleOpenWithSystem}
            activeOpacity={0.8}
          >
            <Text style={styles.openSystemButtonText}>
              ⊞ Abrir con visor del sistema
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pantalla/Barra inferior de "Abriendo..." */}
      {(!isPdfLoaded || isPreparingFile) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 24 }} />
          <View style={styles.loadingBarContainer}>
            <Text style={styles.loadingTitle} numberOfLines={1}>
              Abriendo: {currentBook?.title}
            </Text>
            <Text style={styles.loadingSubtitle}>
              Cargando documento en memoria para evitar lag...
            </Text>
          </View>
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
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  fallbackIcon: {
    fontSize: 80,
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    color: COLORS.text,
  },
  fallbackWarning: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
    color: COLORS.accent,
  },
  fallbackDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 24,
    color: COLORS.text + '80',
  },
  openSystemButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  openSystemButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0A0A0A',
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
    color: '#FFFFFF',
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
