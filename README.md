# InkTrick

**Lector de PDF y Manga Minimalista e Independiente para Android** / **Minimalist Standalone PDF Manga Reader for Android**

---

## Español

InkTrick es una app para dispositivos android que te permite cargar múltiples libros/mangas/comics, visualizarlos cómodamente y guardar tu progreso de lectura en cada uno de ellos, así como separarlos por conjunto, reciente, favoritos, etc. Actualmente está en desarrollo y adquiriendo nuevas características, pero se puede descargar y usar sin restricciones y así se mantendrá siempre. Espero si estás viendo esta app y decides usarla que te sea útil y disfrutes tus lecturas.

### Características Principales

* **Interfaz en Escala de Grises**: Diseño visual completamente minimalista en tonos negros, grises y blancos para una lectura inmersiva sin distracciones.
* **Visualizador Ininterrumpido**: Área táctil superior oculta (7% superior de la pantalla) para abrir el menú de opciones. El resto de la pantalla queda 100% libre para el gesto nativo de zoom con doble dedo y scroll.
* **Gestor de Carpetas**: Sistema multi-selección de directorios sin límites ni prefijos complejos. Limpieza automática de nombres.
* **Agrupamiento Rápido**: Capacidad de arrastrar y clasificar tus mangas seleccionados a colecciones existentes de manera inmediata con un carrusel de píldoras.
* **Iconografía Plana y Limpia**: Iconos minimalistas monótonos y componentes vectoriales adaptados a la estética general.
* **Pantalla de Carga Estilizada**: Pantalla de presentación (Splash) personalizada con el título y traducción oficial al japonés (*インクトリック*).

### Instalación

1. Descarga el archivo de producción [app-release.apk](android/app/build/outputs/apk/release/app-release.apk) desde la sección de compilaciones o el directorio correspondiente.
2. Habilita la instalación de fuentes desconocidas en los ajustes de seguridad de tu tablet/dispositivo Android.
3. Abre el archivo APK e instala la aplicación nativa de forma standalone (funciona 100% offline).

### Desarrollo y Compilación

Para correr el proyecto localmente en desarrollo:

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo Metro
npm run start
```

Para generar un nuevo compilado APK de producción:

```bash
# Ingresar al directorio de Android y compilar
cd android
./gradlew assembleRelease
```

---

## English

InkTrick is an Android app that lets you load multiple books, manga, and comics, view them easily, and save your reading progress for each one. You can also organize them by collection, recent reads, favorites, and more. It's currently under development and receiving new features, but you can download and use it without restrictions, and it will remain that way. I hope that if you're looking at this app and decide to use it, you find it useful and enjoy your reading.

### Main Features

* **Grayscale Interface**: Completely minimalist visual design in black, gray, and white tones for an immersive, distraction-free reading experience.
* **Uninterrupted Viewer**: Hidden top touch area (top 7% of the screen) to open the options menu. The rest of the screen remains 100% free for native two-finger zoom and scroll gestures.
* **Folder Manager**: Multi-selection directory system with no limits or complex prefixes. Automatic name cleaning.
* **Quick Grouping**: Ability to immediately drag and sort your selected mangas into existing collections using a pill carousel.
* **Flat and Clean Iconography**: Monotone minimalist icons and vector components adapted to the overall aesthetic.
* **Stylized Loading Screen**: Custom splash screen featuring the title and official Japanese translation (*インクトリック*).

### Installation

1. Download the production file [app-release.apk](android/app/build/outputs/apk/release/app-release.apk) from the releases section or the corresponding directory.
2. Enable installation from unknown sources in your Android tablet/device security settings.
3. Open the APK file and install the native application standalone (works 100% offline).

### Development and Build

To run the project locally in development mode:

```bash
# Install dependencies
npm install

# Start Metro development server
npm run start
```

To generate a new production APK build:

```bash
# Enter the Android directory and compile
cd android
./gradlew assembleRelease
```
