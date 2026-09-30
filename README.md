# InkTrick

**Lector de manga, manhwa, cómics y PDF para tablets Android** · *Manga, manhwa, comic and PDF reader for Android tablets*

InkTrick lee tus archivos **CBR, CBZ y PDF** directamente desde tus carpetas, sin cuentas, sin internet y sin publicidad. Todo se procesa en el dispositivo.

---

## Español

### Lectura

- **Modos rápidos**: Manga (páginas, derecha → izquierda), Manhwa (vertical continuo), Cómic y Libro.
- **Doble página** en horizontal para leer las ilustraciones a doble página (automático, siempre o nunca).
- **Zoom** con pellizco y doble toque, con desplazamiento libre.
- **Recorte automático** de márgenes blancos o negros.
- **Calidad adaptada a cada pantalla**: las páginas se muestran a la resolución física de la tablet (HD, Full HD, 2K).
- **Pasar página tocando los bordes**; el menú se abre tocando la parte superior.
- **Siguiente tomo** al terminar un libro, respetando el orden de la colección.
- Pantalla completa, pantalla siempre encendida y atenuación de brillo.

### Biblioteca

- Busca libros automáticamente en las carpetas que elijas (incluidas subcarpetas).
- Colecciones con **orden de lectura personalizable** (arrastrar y soltar).
- Favoritos, recientes, búsqueda y portadas personalizadas.
- Progreso guardado por libro y **estadísticas de lectura** (tiempo, páginas, racha).
- **Respaldo** exportable e importable para no perder tu progreso o pasarlo a otra tablet.

### Privacidad

InkTrick no pide permisos, no usa internet y no recopila datos. Los libros solo se descomprimen mientras los lees y se borran al cerrarlos.

---

## English

InkTrick reads your **CBR, CBZ and PDF** files straight from your folders: no accounts, no internet, no ads.

- Reading presets (Manga RTL, Manhwa vertical, Comic, Book), double-page spreads, pinch and double-tap zoom, auto crop.
- Pages render at the device's physical resolution.
- Collections with drag-and-drop reading order, "next volume" button, favorites, search and custom covers.
- Reading statistics and exportable backups.
- No permissions, no network access, no data collection.

---

## Development

Requirements: Node.js, JDK 17+, Android SDK.

```bash
npm install          # also applies patches/ (patch-package)
npx tsc --noEmit     # typecheck
npm run android      # debug build on a connected device / emulator
```

### Release builds

```bash
cd android
./gradlew assembleRelease   # APK  -> android/app/build/outputs/apk/release/inkTrick.apk
./gradlew bundleRelease     # AAB  -> android/app/build/outputs/bundle/release/app-release.aab (Google Play)
```

Release builds are signed with the upload key described in `android/keystore.properties`
(not versioned). Without that file they fall back to the debug key, for local testing only.

```properties
# android/keystore.properties
storeFile=upload.keystore
storePassword=...
keyAlias=inktrick-upload
keyPassword=...
```

## License

[MIT](LICENSE)
