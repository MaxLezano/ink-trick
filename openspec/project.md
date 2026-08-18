# InkTrick — Project Overview

## Vision & Summary
InkTrick is a minimalist, offline-first Manga, Comic, and PDF reader for Android built with React Native and Expo. It is designed around an immersive, distraction-free grayscale visual identity with uninterrupted reading gestures, robust folder-based library organization, reading progress persistence, and support for PDF, CBR, and CBZ formats.

## Technology Stack
- **Framework / Runtime**: React Native 0.81.5, Expo SDK 54, React 19
- **Language**: TypeScript 5.9
- **State Management**: Zustand 5.0 (persisted via AsyncStorage)
- **Navigation**: React Navigation 7 (Native Stack)
- **PDF Rendering**: `react-native-pdf`, `react-native-pdf-thumbnail`, with fallback / web viewer `PdfJsViewer`
- **Native Android Modules**: Custom Kotlin `ComicArchiveModule.kt` for native CBR/CBZ decompression and caching
- **Storage / File System**: `expo-file-system`, Android Storage Access Framework (SAF)

## Architecture & Codebase Structure
- `src/screens/`:
  - `DashboardScreen.tsx`: Main library interface (Recents, Favorites, Folders, multi-select batch organizer, search, and directory importer).
  - `ReaderScreen.tsx`: Full-screen reading canvas with top gesture area (top 7%), zoom, dimmer, RTL/LTR paging, and fit modes.
- `src/services/`:
  - `fileScanner.ts`: SAF directory tree traversal, file filtering, and metadata extraction.
  - `comicService.ts`: Integration with native `ComicArchiveModule` to unpack CBR/CBZ and extract page lists/thumbnails.
  - `bookPreloadService.ts`: Background unpacking and caching for seamless reader transition.
  - `storageService.ts`: Local storage persistence for library metadata, bookmarks, and per-book settings.
- `src/store/`:
  - `libraryStore.ts`: Central Zustand store handling books catalog, reading progress, folder collections, and UI filters.
- `src/components/`:
  - `PdfJsViewer.tsx`: Webview-based alternative PDF reader.
- `src/utils/`:
  - `types.ts`: Core data structures (`BookFile`, `ReadingProgress`, `BookSettings`, `SupportedFormat`).
  - `constants.ts`: UI theme tokens, dimensions, and default configurations.
- `android/`:
  - Custom native Android code including `ComicArchiveModule.kt` for high-performance comic decompression.

## Core Design Principles
1. **Grayscale Minimalist Aesthetic**: High-contrast, clean monotone palette (black, dark grays, white) tailored for distraction-free reading.
2. **Uninterrupted Viewing**: Reading viewport prioritizes content. Menus and toolbars stay hidden unless explicitly invoked via the designated touch zone.
3. **Offline & Privacy First**: 100% local processing; no telemetry, cloud accounts, or remote dependencies required.
