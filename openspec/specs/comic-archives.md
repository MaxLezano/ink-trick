# Spec: Comic Archive Support (CBR / CBZ)

## Purpose & Scope
Provides native Android extraction, image caching, and page indexing for comic book archives (.cbz, .cbr).

## Requirements

### Archive Extraction & Handling
- Native Kotlin module (`ComicArchiveModule`) handles background extraction and image stream parsing.
- Support standard ZIP-compressed archives (`.cbz`) and RAR archives (`.cbr`).
- Naturally sort extracted page filenames numerically/alphabetically (e.g., `01.jpg`, `02.jpg`, `10.jpg`).

### Image Caching & Thumbnail Generation
- Cache extracted page images in application cache directory to avoid repeated extraction.
- Extract the first page as the cover thumbnail for library presentation.
- Provide cleanup mechanisms for temporary extraction artifacts when books are removed or cache is pruned.

### Background Preloading
- `bookPreloadService` handles pre-extracting upcoming pages or books to ensure zero-lag entry into the Reader.
