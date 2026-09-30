/**
 * InkTrick - Guided tour steps
 * Two parts: "intro" (the header, works with an empty library) and "library" (books, collections
 * and reading, which need books to point at). A new user with no books sees the intro, and the
 * library part starts by itself once their first books appear. A replay shows everything.
 */
export type TourIcon = 'enso' | 'folder' | 'refresh' | 'search' | 'chart' | 'read' | 'collection' | 'card' | 'reader';
export type TourPart = 'intro' | 'library';
/** intro: first run with an empty library · library: the rest, once there are books · full: both. */
export type TourRun = 'intro' | 'library' | 'full';

export interface TourStep {
  part: TourPart;
  /** Runs that include this step (every run starts with one of the welcome steps). */
  runs: TourRun[];
  /** TourTarget id to spotlight; without one the bubble is centered over the dimmed screen. */
  target?: string;
  icon: TourIcon;
  title: string;
  body: string;
  /** Shows the reader tap-zone diagram inside the bubble. */
  diagram?: 'tapZones';
}

export const TOUR_STEPS: TourStep[] = [
  {
    part: 'intro',
    runs: ['intro', 'full'],
    icon: 'enso',
    title: '¡Bienvenido a InkTrick!',
    body: 'Tu lector de manga, manhwa, cómics y libros, sin conexión y sin cuentas. Te muestro en un minuto para qué sirve cada cosa.',
  },
  {
    part: 'library',
    runs: ['library'],
    icon: 'enso',
    title: '¡Ya tienes libros!',
    body: 'Ahora que tu biblioteca tiene contenido, te muestro cómo organizarla y cómo se lee.',
  },
  {
    part: 'intro',
    runs: ['intro', 'full'],
    target: 'header.folders',
    icon: 'folder',
    title: 'Tus carpetas',
    body: 'Elige las carpetas donde guardas tus archivos (CBR, CBZ, PDF o EPUB). InkTrick las revisa junto con sus subcarpetas y arma tu biblioteca solo.',
  },
  {
    part: 'intro',
    runs: ['intro', 'full'],
    target: 'header.refresh',
    icon: 'refresh',
    title: 'Actualizar',
    body: 'Cada vez que abres la app se buscan libros nuevos. Con este botón puedes hacerlo cuando quieras.',
  },
  {
    part: 'intro',
    runs: ['intro', 'full'],
    target: 'header.search',
    icon: 'search',
    title: 'Buscar',
    body: 'Encuentra cualquier libro por título, autor, serie o nombre de archivo.',
  },
  {
    part: 'intro',
    runs: ['intro', 'full'],
    target: 'header.stats',
    icon: 'chart',
    title: 'Mi lectura',
    body: 'Tu tiempo de lectura, rachas y libros terminados. También guarda y restaura respaldos, y desde ahí puedes volver a ver este tutorial.',
  },
  {
    part: 'intro',
    runs: ['intro'],
    target: 'home.addFolder',
    icon: 'folder',
    title: 'Empieza por aquí',
    body: 'Agrega la carpeta donde guardas tus archivos. Cuando aparezcan tus libros te muestro el resto: cómo organizarlos y cómo se lee.',
  },
  {
    part: 'library',
    runs: ['library', 'full'],
    target: 'home.hero',
    icon: 'read',
    title: 'Continuar leyendo',
    body: 'El último libro que abriste, con tu progreso. Toca «Continuar» para seguir justo donde lo dejaste; «Recientes» muestra todo lo que leíste.',
  },
  {
    part: 'library',
    runs: ['library', 'full'],
    target: 'home.collection',
    icon: 'collection',
    title: 'Colecciones',
    body: 'Tus libros se agrupan en colecciones (los que no tienen una quedan en «Sin clasificar»). Toca el título para verla completa; dentro, «Ordenar» define el orden de los tomos.',
  },
  {
    part: 'library',
    runs: ['library', 'full'],
    target: 'home.card',
    icon: 'card',
    title: 'Toca o mantén presionado',
    body: 'Toca un libro para leerlo. Mantenlo presionado para seleccionar varios y agregarlos a favoritos, marcarlos como leídos, cambiar la portada o moverlos a una colección.',
  },
  {
    part: 'library',
    runs: ['library', 'full'],
    icon: 'reader',
    title: 'Mientras lees',
    body: 'Toca la franja superior para ver los controles: índice, marcadores y ajustes. Los bordes pasan de página, igual que las teclas de volumen. Pellizca o toca dos veces para hacer zoom.',
    diagram: 'tapZones',
  },
  {
    part: 'library',
    runs: ['library', 'full'],
    icon: 'enso',
    title: '¡Listo!',
    body: 'Cada libro recuerda su página y sus ajustes. Puedes repetir este tutorial desde «Mi lectura» cuando quieras.',
  },
];
