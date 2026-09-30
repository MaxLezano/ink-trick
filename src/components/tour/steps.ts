/**
 * InkTrick - Guided tour steps
 * One stop per key element of the home screen, then how reading works.
 */
export type TourIcon = 'enso' | 'folder' | 'refresh' | 'search' | 'chart' | 'read' | 'collection' | 'card' | 'reader';

export interface TourStep {
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
    icon: 'enso',
    title: '¡Bienvenido a InkTrick!',
    body: 'Tu lector de manga, manhwa, cómics y libros, sin conexión y sin cuentas. Te muestro en un minuto para qué sirve cada cosa.',
  },
  {
    target: 'header.folders',
    icon: 'folder',
    title: 'Tus carpetas',
    body: 'Elige las carpetas donde guardas tus archivos (CBR, CBZ, PDF o EPUB). InkTrick las revisa junto con sus subcarpetas y arma tu biblioteca solo.',
  },
  {
    target: 'header.refresh',
    icon: 'refresh',
    title: 'Actualizar',
    body: 'Cada vez que abres la app se buscan libros nuevos. Con este botón puedes hacerlo cuando quieras.',
  },
  {
    target: 'header.search',
    icon: 'search',
    title: 'Buscar',
    body: 'Encuentra cualquier libro por título, autor, serie o nombre de archivo.',
  },
  {
    target: 'header.stats',
    icon: 'chart',
    title: 'Mi lectura',
    body: 'Tu tiempo de lectura, rachas y libros terminados. También guarda y restaura respaldos, y desde ahí puedes volver a ver este tutorial.',
  },
  {
    target: 'home.hero',
    icon: 'read',
    title: 'Continuar leyendo',
    body: 'El último libro que abriste, con tu progreso. Toca «Continuar» para seguir justo donde lo dejaste; «Recientes» muestra todo lo que leíste.',
  },
  {
    target: 'home.collection',
    icon: 'collection',
    title: 'Colecciones',
    body: 'Tus libros se agrupan en colecciones (los que no tienen una quedan en «Sin clasificar»). Toca el título para verla completa; dentro, «Ordenar» define el orden de los tomos.',
  },
  {
    target: 'home.card',
    icon: 'card',
    title: 'Toca o mantén presionado',
    body: 'Toca un libro para leerlo. Mantenlo presionado para seleccionar varios y agregarlos a favoritos, marcarlos como leídos, cambiar la portada o moverlos a una colección.',
  },
  {
    icon: 'reader',
    title: 'Mientras lees',
    body: 'Toca la franja superior para ver los controles: índice, marcadores y ajustes. Los bordes pasan de página, igual que las teclas de volumen. Pellizca o toca dos veces para hacer zoom.',
    diagram: 'tapZones',
  },
  {
    icon: 'enso',
    title: '¡Listo!',
    body: 'Cada libro recuerda su página y sus ajustes. Puedes repetir este tutorial desde «Mi lectura» cuando quieras.',
  },
];
