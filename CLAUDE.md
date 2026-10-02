# InkTrick — Claude working notes

Offline manga / manhwa / comic / book (PDF, EPUB) reader for Android tablets, headed for Google Play.
Marketing copy lists "Manga · Manhwa · Cómics · Libros" (never "PDF").
React Native 0.81 + Expo SDK 54 (bare workflow, custom native module), TypeScript, Zustand.
This file is the **only** project doc: keep it in sync whenever behavior changes.

## Rules

- UI copy is **Spanish** using `tú` ("¿Quieres…?", "Elige…"), never `vos`, matching existing strings.
  Code, identifiers, comments, commit messages and docs are **English**.
- Conventional commits only. Never add AI attribution / `Co-Authored-By` lines.
- Commit or push only when asked. Never delete files, uninstall packages or wipe data without
  explicit approval (the user may run the destructive step themselves).
- Verify claims against code or a device before stating them. Test on the emulator (and the
  tablet when connected) after changes that touch reading, gestures, storage or native code.
- `/android` is **versioned** and contains hand-written native code. Never run
  `expo prebuild --clean` (it would wipe it); `android/.gitignore` excludes build output.
- Quality must adapt to each screen (HD 800×1280 tablet, 2K tablet): decode images at the device's
  physical size, never hardcode pixel sizes (use `PixelRatio`).
- Never use text glyphs (→ ★ ▶ ✓) as icons; use `src/components/Icons.tsx`.
- No permissions, no network: do not add dependencies that need them (see Release).

## Product behavior

**Principles**: dark minimalist look (black / grays / white; the only accents come from the logo: kin-iro gold
`COLORS.gold` and fuji-iro wisteria `COLORS.wisteria` — no reds or pinks; Japanese ink-brush icon motifs); the page owns the screen;
100% offline and local, no telemetry or accounts.

**Library (Dashboard)**
- Folders are picked with SAF and scanned recursively for `.pdf/.cbr/.cbz/.epub` (+ `cover.jpg`
  next to files). Rescans on launch (silent) and with the refresh button (spinner + banner).
- Embedded metadata is read once per book after the covers (`infoChecked`): `ComicInfo.xml` in CBZ
  (not CBR: scanning solid RARs is too slow) and the OPF of EPUBs. It sets title ("Series Vol. N:
  Title"), author, series, volume, summary; rescans keep it. Search also matches author / series.
- Home: header icons (search, "Mi lectura", folders, refresh) · "Continuar leyendo" hero (opens ONLY
  from its "Continuar" button) with a "Recientes →" link · Favoritos carousel · one carousel per
  collection. No greeting, week strip or "in progress" carousel (user removed them).
- Collection grid → "Ordenar": long-press drag or arrows, spring-animated (`ReorderGrid`; holding a
  dragged card near the top / bottom edge auto-scrolls; while dragging, the drag owns the scroll
  offset on the UI thread: `scrollEnabled` via animated props and any other drift is undone each frame); saved
  as `BookFile.order`, used by carousels and "Siguiente tomo". "Por nombre" resets to natural order.
- Long press a card → selection mode → ⋮ menu: add/remove favorites (label reflects state), mark
  read / unread, change cover (page number), move to collection (dismissable), remove from library
  (files stay on disk and are skipped by future scans).
- Finished books show a gold hanko-style "LEÍDO" seal; favorites a filled wisteria-colored sakura.
- Guided tour (`src/components/tour/`, ported from the user's GymBro app): dims the screen and
  spotlights one element at a time (gold ring) with a bubble (Atrás / Siguiente / Saltar). Two parts
  (`steps.ts`): **intro** = welcome + header buttons (folders, refresh, search, Mi lectura) and, in
  an empty library, "Agregar carpeta"; **library** = hero, first collection header, its first card,
  reader tap zones (diagram from `tapZones.ts`), done. Runs: `intro` auto-starts on a brand new empty
  library, `library` auto-starts when the first books appear, `full` when the first launch already
  has books and for the replay ("Mi lectura" → "Ver tutorial"). Stops whose target is not mounted
  are left out when leaving the welcome step. Seen parts are stored in `tourParts` (data.json;
  legacy `tourSeenAt` = both); a replay with no books never marks the library part.

**Reader**
- Tap zones (`src/components/reader/tapZones.ts`, shared by comic + PDF): the top band (~9.5% of
  the height) opens the controls; narrow edge strips (17% width, 12–90% height) turn pages
  (mirrored in RTL); everything else does nothing. Controls close ONLY with their ✕ button.
- Controls: top bar (back, title + author/collection, índice, bookmark toggle, settings, ✕) + bottom
  page scrubber (reversed in RTL, gold ticks at bookmarks).
- Índice dialog: "Capítulos" (PDF outline from `onLoadComplete`'s tableContents, EPUB nav/NCX, CBZ
  chapter folders when there are ≥ 2) and "Marcadores" (jump / remove). Many PDFs have no outline
  (e.g. the user's Solo Leveling arcs: empty `/Outlines`): then the dialog is just "Marcadores"
  (no tabs, no empty chapter list).
- Volume keys turn pages (down = next, up = previous; setting "Teclas de volumen", default on):
  `ReaderKeysModule` + `MainActivity.dispatchKeyEvent`, enabled only while a reader is ready.
  The keys are logical (next / previous), never mirrored by RTL; their physical side depends on the
  tablet and its rotation, so the per-book setting "Invertir teclas de volumen" swaps them.
- Next volume is preloaded (extraction / PDF copy / EPUB unpack) once the reader passes 90%, via
  `preloadBook` (a retain claim released 5 s after leaving, so "Siguiente" takes it over).
- Settings: centered dialog, per book. Presets Manga (paged RTL) / Manhwa (vertical continuous) /
  Cómic (paged LTR) / Libro (paged, never double page); the active one is highlighted by color only.
  Options: scroll direction, paging, reading direction, fit (width / height / full), double page
  (off / auto in landscape / on; cover and wide pages stay single), auto crop, double-tap zoom,
  tap-to-turn, dimmer (0–60%), fullscreen (hides the nav bar), keep awake.
- New books inherit the last settings of the same series (collection name, else parent folder).
- Pinch zoom up to 5x with focal point, pan with inertia, double tap zooms at the tapped point.
- Last page → "Terminaste este tomo" card with a "Siguiente" button (next book of the series).
- Double page and auto crop are comic-only (Pdfium cannot do them).

**EPUB** (`EpubReader`): unpacked natively to `cache/inktrick_epub/<id>/` while open; each spine
file loads in a WebView and is paginated with CSS columns (injected `window.__ink` engine: swipes,
edge taps, links → chapter/anchor, web links blocked). Text settings: size (`textZoom`), theme
(Oscuro / Sepia / Claro), font (del libro / serif / sans), line height. Progress is a *position*
0..`EPUB_POSITIONS`-1 (10000) proportional to chapter file sizes, never stored as `pageCount`;
the reader reports page turns explicitly for stats. Bookmarks / toc use positions too.
Right-to-left EPUBs (`page-progression-direction="rtl"`, Japanese vertical text) are shown
horizontally left to right, with a 7 s notice saying so (no vertical layout support).

**Mi lectura (Stats)**: today / week / streak / finished tiles, 14-day minutes chart, most-read
books, backup export (JSON to a picked folder) and import (merge; books matched by path, then name
+ size; bookmarks merged). Weekly automatic backup (optional): folder picked once
(`autoBackup` in data.json), written ~8 s after launch and when the app goes to background if 7
days passed, as `inktrick-auto-<stamp>.json`; only the newest 3 of those files are kept. Reading time accumulates between page turns (gaps > 5 min ignored); only 1–2 page steps
count as read pages (scrubber jumps do not).

**Splash**: `src/components/SplashScreen.tsx` over the navigator: "InkTrick", インクトリック and an
animated bar, at least 1.4 s, then fades. The native window background is `#0A0A0A` (no logo).

## Commands

```bash
npx tsc --noEmit                               # typecheck (must be clean)
cd android && ./gradlew assembleRelease        # APK -> android/app/build/outputs/apk/release/inkTrick.apk
cd android && ./gradlew bundleRelease          # AAB -> android/app/build/outputs/bundle/release/app-release.aab
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/inkTrick.apk
adb -s emulator-5554 shell am start -n com.lezma.InkTrick/.MainActivity
npx expo install <pkg>                         # always (keeps SDK 54 versions aligned)
```

- A change to **only** image assets (no `.ts/.tsx`) leaves `createBundleReleaseJsAndAssets` UP-TO-DATE
  and the APK ships the old images: build with
  `./gradlew createBundleReleaseJsAndAssets --rerun assembleRelease`.
- Release build ≈ 10 min cold (needs `-Xmx4096m -XX:MaxMetaspaceSize=1536m`, set in
  `android/gradle.properties`, or lint dies with Metaspace OOM), ≈ 1–2 min when only JS changed.
- Versions live in **two** places: `app.json` (`version`, `android.versionCode`) and
  `android/app/build.gradle` (`versionName`, `versionCode`). Bump both; Play needs a new
  `versionCode` for every upload.

## Release (Google Play)

- Upload an **AAB** (`bundleRelease`), not the APK. Package: `com.lezma.InkTrick`.
- Signing: `android/app/build.gradle` reads `android/keystore.properties` (`storeFile` relative to
  `android/`, `storePassword`, `keyAlias`, `keyPassword`). Both it and `*.keystore` are gitignored
  (except `android/app/debug.keystore`). Without it, release falls back to the debug key.
- Upload key: `D:\TRABAJO\Claves\InkTrick\inktrick-upload.jks` (alias `inktrick-upload`, RSA 4096,
  created 2026-09-30); `keystore.properties` points to it as `../../Claves/InkTrick/...`. The
  user keeps the file + password backed up. Upload cert (CN=Max Lezano, O=LezMa, C=AR) SHA-256 starts `7E:F5:6E:56`.
- Switching a device from a debug-signed build to an upload-key build requires uninstalling
  (Android refuses a different signature) → export a backup from "Mi lectura" first.
- Permissions: the main manifest strips everything libraries merge in (`tools:node="remove"`);
  the merged release manifest must only contain `WAKE_LOCK` and the app's own
  `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Debug manifests re-add `INTERNET` and
  `SYSTEM_ALERT_WINDOW` for Metro. `app.json` mirrors this in `android.blockedPermissions`.
- Minify/R8 is off. Before enabling it, add keep rules for JNI libs
  (`me.zhanghai.android.libarchive`, pdfium) and test every reader path.

## Brand assets

- Logo: the user's koi pair (CorelDRAW export) recolored in `assets/source/logo-koi.svg`: gold-gradient brush ensō with both koi cut out by an SVG mask
  (the background shows through).
  Launcher icons are adaptive: `mipmap-*/ic_launcher_{foreground,background,monochrome}.webp`
  (logo at 47% of the 108dp canvas; monochrome = ensō with the koi cut out) + legacy
  `ic_launcher{,_round}.webp` (logo at 50%). Background: 45° black → violet gradient (mostly
  black, violet in the bottom-right) with a soft halo behind the logo.
  `assets/icon.png` / `adaptive-*.png` mirror them for Expo.
- Home decorations (the user's ink SVGs, pre-rendered to `assets/decor/`): a faint
  sakura branch wallpaper (two dim grays + wisteria blossoms) falling diagonally from the
  top-right corner (the trunk runs off it) towards the bottom-left, and a very faint torii in the "Continuar leyendo" hero bleeding off its edges.
- Play Store listing art lives in `store/`: `play_icon_512.png` and `feature_graphic_1024x500.png`
  (background generated with local ComfyUI, DreamShaper XL Turbo; logo and text composited on top).
- ComfyUI Desktop runs locally at `http://127.0.0.1:8000` (RTX 3080, 12 GB). MCP server `comfyui`
  (npm `comfyui-mcp`, user scope, `COMFYUI_URL` set) exposes it; the HTTP API works too.

## Architecture

```
App.tsx                      clears reading cache, loads library, splash overlay
src/navigation/AppNavigator  Stack: Dashboard -> Reader { bookId } / Stats
src/screens/DashboardScreen  home, grids, search, selection/batch actions, reorder, folder manager
src/screens/ReaderScreen     loading, progress, stats tracking, controls, next volume
src/screens/StatsScreen      "Mi lectura": stats + chart, backup export/import
src/components/
  Icons.tsx                  SVG brush icons (react-native-svg): ensō, sakura, bamboo, makimono, Fuji
  SplashScreen.tsx           launch screen
  library/BookCard.tsx       memoized cover card (expo-image), LEÍDO seal, progress, favorite
  library/ReorderGrid.tsx    sortable grid (RNGH pan after long press + Reanimated springs)
  reader/ComicReader.tsx     CBR/CBZ: 1–2 page "slots" (spreads), paged H (LTR/RTL), paged V, webtoon
                             strip; exact getItemLayout; auto-crop boxes; full-res decode while zoomed
  reader/EpubReader.tsx      EPUB: WebView per chapter, CSS-column pagination, positions
  reader/ReaderIndexSheet.tsx  chapters + bookmarks dialog
  reader/ZoomableView.tsx    pinch / pan with decay / double tap / single tap
  reader/PageScrubber.tsx    draggable page slider
  reader/ReaderSettingsSheet.tsx  settings dialog + presets
  reader/BambooLoader.tsx    loading animation (bamboo cut by progress)
  reader/tapZones.ts         shared tap zone geometry
  tour/                      guided tour: tour.ts (store), TourTarget, steps.ts, TourOverlay (App.tsx)
src/store/libraryStore.ts    Zustand store + pure selectors (selectActiveBooks, selectRecent, ...)
src/services/
  bookCacheService.ts        ONLY bridge to ComicArchiveModule: pages, PDF copies, covers, cache
  storageService.ts          JSON persistence (atomic write), progress, settings, exclusions, stats
  backupService.ts           export/import JSON backup via SAF, weekly automatic backup
  fileScanner.ts             recursive SAF scan (yields to the UI between folders)
src/utils/format.ts          natural sort, sortSeries, short titles, seriesKeyOf, bytes, durations
android/app/src/main/java/com/lezma/InkTrick/ComicArchiveModule.kt   native module (libarchive)
android/app/src/main/java/com/lezma/InkTrick/ReaderKeysModule.kt     volume keys -> onVolumeKey
patches/react-native-pdf+7.0.4.patch   PdfView.java: ARGB_8888 tiles, fitEachPage, RTL page fix
```

Native module methods: `extractAllImages`, `getCachedPages`, `computeTrimBoxes` (auto crop,
cached in `trim.json`), `extractCover` / `createThumbnail` / `renderPdfCover` / `extractEpubCover` (covers,
margins cropped), `getPdfPageCount`, `copyToLocalFile`, `readBookInfo` (ComicInfo / OPF),
`openEpub` (unpack + spine + toc; `epub.json` is its completion marker; zip-slip safe).

### Rendering pipeline

- **Books are never kept decompressed** (user decision): temporary files exist only while a book
  is open. `ReaderScreen` calls `releaseBookFiles(bookId)` on unmount (after any extraction in
  progress settles) and `App.tsx` runs `clearReadingCache()` on every launch. Only covers,
  progress, settings and stats persist. Reopening a book re-extracts it (a few seconds).
- **PDF**: `react-native-pdf` (Pdfium, vector, tile rendering). SAF files are copied atomically
  to `cache/inktrick_pdf/<id>.pdf` while open. Page count is fetched natively **before** mounting.
- Loading screen: `BambooLoader` (reader/), a row of bamboo stalks cut by a gold stroke. Stalks are
  ComfyUI sprites recolored washi white (`assets/loader/bamboo_stalk_{0,1}.png`, flat canes with
  small leaves, mirrored per stalk) drawn twice through SVG `ClipPath`s, each with its own cut
  slope; gold cut face; the blade is a short curved crescent fading to points at both ends. Comics
  report real progress: 0–90% = compressed bytes read (fd offset via `Os.lseek`, or a counting
  stream in the zip fallback), 90–99% = pages renamed + measured, 100 = manifest written; each
  stalk is an equal share. PDF / EPUB (no progress) loop.
- **CBR/CBZ**: native extraction to `cache/inktrick_comics_v2/<id>/page_NNNN.ext`, sorted by the
  original archive path (natural order). `manifest.json` (version 3, each page's w/h and archive
  folder = chapter) is the completion marker — a folder without it is a partial extraction and gets rebuilt.
- Images render with `expo-image`, `cachePolicy="memory"` (no disk cache of local files).
- Covers: JPEG thumbnails sized to the screen density (~240dp), margins cropped, in
  `files/inktrick/covers/<id>_c2_p<page>.jpg` (persistent). Bump `COVER_VERSION` to regenerate all.
- While a comic page is zoomed it is re-decoded at full source resolution (`allowDownscaling`).

### Data model / persistence

- `files/inktrick/data.json`: library, progress, bookSettings, seriesSettings, scannedFolders,
  excludedPaths, stats (days / books / finished), bookmarks, autoBackup, tourParts. Writes are serialized through `data.json.tmp` → move.
- Book identity = `filePath`; rescans merge by path, falling back to `fileName + fileSize`.
- Progress: `currentPage` is the 0-based logical page; `percentage` 0–100. A finished book reopens
  at page 1. Progress is flushed on `beforeRemove` and when the app goes to background.

## Gotchas learned the hard way

- `expo-file-system` `File.move()` **mutates the instance uri**; create fresh `File` instances.
- `useMemo` / effects must depend on **state**, not refs (a memo reading a ref computed the PDF
  start page before the page count existed and never recomputed).
- react-native-pdf RTL: pages are reversed natively; `page` and `onPageChanged` use the
  *displayed* index. Logical = `total - displayed`. The library's `if (page != 1) page = pageCount`
  override was removed in the patch (it broke reopening).
- Animated page turns: ignore scroll events until the target page lands, or the indicator flickers
  back to the old page (`pendingDisplayRef` in `ComicReader`).
- Folder scans are synchronous SAF listing: they must yield (`yieldToUI`) or loaders never paint.
- Buttons floating over the page must be gesture-handler touchables, or page gestures swallow taps.
- libarchive reads SAF files via `readOpenFd` on a `ParcelFileDescriptor` (no temp copy).
- `patch-package` fails on Windows (git CRLF warnings): edit the `.patch` by hand (fix hunk
  headers) and verify with `npx patch-package --reverse && npx patch-package`. Patches must contain
  only real source hunks.
- The user's editor is **Antigravity** (VS Code fork) with the Java pack + Gradle extension. They
  import the Gradle plugins inside `node_modules` and run a Gradle Build Server with a bundled
  Gradle 8.9 ("Minimum supported Gradle version is 8.13", "non existing library junit/truth", junk
  `.classpath/.project/.settings`). All IDE-only: the CLI build uses the wrapper (8.14.3). Disabled
  in `.vscode/settings.json` (`java.import.gradle.enabled: false`,
  `java.gradle.buildServer.enabled: "off"`, `gradle.autoDetect: "off"`); stale errors need
  "Java: Clean Java Language Server Workspace" + reload.
- Storage reads share one in-flight promise (`pendingRead`): parallel first reads used to parse
  separate copies and drop writes. A corrupt `data.json` falls back to the temp file, else is kept
  as `data.corrupt-<ts>.json` — never silently replaced by an empty library.
- Book temp files are reference counted (`retainBookFiles` / `releaseBookFiles`): reopening a book
  while the previous reader is still closing must not delete the pages the new one uses.
- Scan merge: name + size only re-identifies a *moved* file (old path gone, id unused), so two
  copies of a file never share an id. Hidden entries (`.xxx`, macOS `._` forks) are skipped.
- Callbacks created on mount (animation `.start(cb)`, listeners) must read props through refs:
  the splash once checked a stale `ready === false` and never closed on fast devices.
- `navigation.replace` ("Siguiente") mounts the new reader *before* the old one unmounts: global
  switches owned by a reader (volume keys, book files) must be reference counted, or the old
  reader's cleanup turns them off under the new one.
- react-native-webview must keep `scalesPageToFit={false}` (else pages lay out 980 px wide) and
  the EPUB engine blocks `touchmove` so the page never free-scrolls between columns.
- Git Bash here lacks `rg`/`sd`/`fd`; use the Grep/Glob tools, or `grep`/`python` in scripts.
  Bash heredocs choke on some quoting: write Python edit scripts to a file first.

## Devices

- Physical tablet: `Tab_C10Pro` (Allwinner A523, 4 GB RAM, Android 13, 800×1280 @ 160 dpi), adb id
  `C10P91468240029`. If it shows `offline`, accept the USB debugging prompt on the tablet.
  Its library lives in `/sdcard/Libros/Anime` (PDF + CBR). The user also reads on a 2K tablet.
- Emulator: AVD `Medium_Tablet` (`emulator-5554`, 1600×2560, reports itself as "Pixel Tablet").
  Test data in `/sdcard/Manga` (JJK `.cbr` volumes, Solo Leveling webtoon `.pdf` arcs).
  Launch from Bash with `run_in_background` (`emulator.exe -avd Medium_Tablet`); a plain `&` dies
  with the shell. If mouse clicks land offset from the pointer (window resized / moved between
  monitors with different Windows scaling), restart the emulator.
- Screenshots shown to the model are scaled: multiply displayed coordinates by 1.28 for
  `adb shell input tap`. On the emulator, taps at y < ~60 px open the system caption bar; use
  y ≈ 130 for the reader's top band.
- Smoke test: splash → home → open CBR (restores exact page) → top band (controls) → scrubber jump →
  preset Manga (keeps page, reversed scrubber) → edge tap turns page → double tap zoom + pan →
  ✕ → back → reopen (same page). Repeat with a PDF in RTL. Reorder a collection by drag.
