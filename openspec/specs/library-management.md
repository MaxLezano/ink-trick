# Spec: Library Management

## Purpose & Scope
Provides cataloging, persistent storage, folder categorization, search, and reading progress tracking for all imported books, manga, and comics.

## Requirements

### Catalog & Metadata
- Must support discovering and storing `.pdf`, `.cbr`, and `.cbz` files.
- Each book entry stores: `id`, `title`, `fileName`, `filePath`, `format`, `fileSize`, `coverUri`, `addedAt`, `lastOpenedAt`, `isFavorite`, and optional `folder`.
- Metadata and catalog must be persisted locally in `storageService` across app launches.

### Organization & Filtering
- **Sections**: Support filtering the library into `recent` (sorted by `lastOpenedAt`), `favorites` (where `isFavorite == true`), and `folders`.
- **Folder Categorization**: Books can be grouped into user-defined or auto-detected directory folders.
- **Batch Operations**: Allow selecting multiple books to assign/move to a folder, delete, or mark as favorites in bulk.
- **Search**: Case-insensitive search matching book title or file name.

### Reading Progress Tracking
- Record `currentPage`, `totalPages`, `percentage`, and `lastReadAt` for every opened book.
- Update progress on page changes in the reader.
- Expose reading completion metrics on dashboard cards.
