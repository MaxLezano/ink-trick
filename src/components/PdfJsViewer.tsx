import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS } from '../utils/constants';

interface PdfJsViewerProps {
  pdfUri: string;
  initialPage: number;
  isHorizontal: boolean;
  usePaging: boolean;
  onPageChanged: (pageIndex: number) => void;
  onLoadComplete: (totalPages: number) => void;
  onToggleMenu: () => void;
}

export const PdfJsViewer: React.FC<PdfJsViewerProps> = ({
  pdfUri,
  initialPage,
  isHorizontal,
  usePaging,
  onPageChanged,
  onLoadComplete,
  onToggleMenu,
}) => {
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(true);
  const webViewRef = useRef<WebView>(null);
  const isLoadedRef = useRef<boolean>(false);

  // Leer el archivo PDF en base64 para envío seguro a WebView en Android/iOS
  useEffect(() => {
    let active = true;
    async function loadPdfBase64() {
      setIsLoadingFile(true);
      try {
        const cleanPath = Platform.OS === 'android' && pdfUri.startsWith('file://')
          ? pdfUri
          : pdfUri;
        
        console.log('[PdfJsViewer] Reading PDF to base64 from:', cleanPath);
        const data = await FileSystem.readAsStringAsync(cleanPath, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (active) {
          setBase64Data(data);
          setIsLoadingFile(false);
        }
      } catch (err) {
        console.error('[PdfJsViewer] Error reading PDF file as base64:', err);
        if (active) {
          setIsLoadingFile(false);
        }
      }
    }

    loadPdfBase64();
    return () => {
      active = false;
    };
  }, [pdfUri]);

  // Manejar mensajes desde WebView
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'loaded') {
        isLoadedRef.current = true;
        onLoadComplete(data.totalPages);
      } else if (data.type === 'pageChanged') {
        onPageChanged(data.page);
      } else if (data.type === 'toggleMenu') {
        onToggleMenu();
      }
    } catch (e) {
      console.warn('[PdfJsViewer] Error parsing message from WebView:', e);
    }
  }, [onLoadComplete, onPageChanged, onToggleMenu]);

  // Navegar a página específica cuando cambia initialPage
  useEffect(() => {
    if (isLoadedRef.current && webViewRef.current && initialPage >= 1) {
      const jsCode = `if (window.scrollToPage) { window.scrollToPage(${initialPage}); } true;`;
      webViewRef.current.injectJavaScript(jsCode);
    }
  }, [initialPage]);

  // HTML + Javascript embebido con PDF.js para renderizado WebGL/Canvas de alta nitidez
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background-color: #000000;
      overflow-x: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    #viewer-container {
      width: 100%;
      min-height: 100%;
      display: flex;
      flex-direction: ${isHorizontal ? 'row' : 'column'};
      align-items: center;
      background-color: #000000;
      ${isHorizontal ? 'overflow-x: auto; overflow-y: hidden;' : 'overflow-y: auto; overflow-x: hidden;'}
    }
    .page-wrapper {
      position: relative;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #000000;
      margin: 0;
      padding: 0;
    }
    canvas {
      display: block;
      width: 100% !important;
      height: auto !important;
      background-color: #000000;
    }
    .placeholder {
      width: 100%;
      height: 70vh;
      display: flex;
      justify-content: center;
      align-items: center;
      color: rgba(255,255,255,0.3);
      font-size: 14px;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="viewer-container"></div>

  <script>
    (function() {
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      const container = document.getElementById('viewer-container');
      const rawBase64 = "${base64Data || ''}";
      const startPage = ${initialPage || 1};
      let pdfDoc = null;
      let totalPages = 0;
      const renderedPages = new Set();
      const pageContainers = [];

      function sendToRN(msg) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(msg));
        }
      }

      function base64ToUint8Array(base64) {
        const raw = atob(base64);
        const uint8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          uint8Array[i] = raw.charCodeAt(i);
        }
        return uint8Array;
      }

      async function renderPage(pageNum) {
        if (renderedPages.has(pageNum) || pageNum < 1 || pageNum > totalPages) return;
        renderedPages.add(pageNum);

        const pageWrapper = pageContainers[pageNum - 1];
        if (!pageWrapper) return;

        try {
          const page = await pdfDoc.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1.0 });

          const dpr = Math.max(window.devicePixelRatio || 1, 2.5);
          const screenWidth = window.innerWidth || document.documentElement.clientWidth || 1080;
          const scale = (screenWidth / unscaledViewport.width) * dpr;

          const viewport = page.getViewport({ scale: scale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { alpha: false });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';

          pageWrapper.innerHTML = '';
          pageWrapper.appendChild(canvas);

          const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
          };

          await page.render(renderContext).promise;
        } catch (err) {
          console.error('Error rendering page ' + pageNum, err);
          renderedPages.delete(pageNum);
        }
      }

      window.scrollToPage = function(pageNum) {
        const target = pageContainers[pageNum - 1];
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          renderPage(pageNum);
        }
      };

      async function initPdf() {
        if (!rawBase64) return;
        try {
          const dataArray = base64ToUint8Array(rawBase64);
          pdfDoc = await pdfjsLib.getDocument({ data: dataArray }).promise;
          totalPages = pdfDoc.numPages;

          sendToRN({ type: 'loaded', totalPages: totalPages });

          for (let i = 1; i <= totalPages; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'page-wrapper';
            wrapper.id = 'page-' + i;

            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder';
            placeholder.innerText = 'Cargando página ' + i + '...';
            wrapper.appendChild(placeholder);

            wrapper.addEventListener('click', function() {
              sendToRN({ type: 'toggleMenu' });
            });

            container.appendChild(wrapper);
            pageContainers.push(wrapper);
          }

          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const idStr = entry.target.id.replace('page-', '');
                const pageNum = parseInt(idStr, 10);
                if (!isNaN(pageNum)) {
                  sendToRN({ type: 'pageChanged', page: pageNum });
                  renderPage(pageNum);
                  renderPage(pageNum + 1);
                  renderPage(pageNum + 2);
                  renderPage(pageNum + 3);
                  renderPage(pageNum - 1);
                }
              }
            });
          }, { threshold: 0.05 });

          pageContainers.forEach(el => observer.observe(el));

          if (startPage > 1) {
            setTimeout(function() {
              window.scrollToPage(startPage);
            }, 200);
          } else {
            renderPage(1);
            renderPage(2);
          }
        } catch (err) {
          console.error('Error loading PDF in JS:', err);
        }
      }

      initPdf();
    })();
  </script>
</body>
</html>
  `;

  if (isLoadingFile || !base64Data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Cargando documento en motor PDF.js...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        scalesPageToFit={false}
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={styles.webview}
        overScrollMode="never"
        bounces={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
});
