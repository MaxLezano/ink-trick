# Spec: Reader & Viewport

## Purpose & Scope
Defines the reading experience, gesture navigation, viewport layout, reading orientations, and display filters for viewing manga and PDF content.

## Requirements

### Uninterrupted Full-Screen Viewport
- The reader canvas occupies 100% of the screen by default.
- Navigation toolbars, chapter progress indicators, and settings overlays remain hidden during reading.
- Designate a discrete touch zone (top 7% of screen) to toggle the options overlay on/off without interfering with swipe or zoom gestures.

### Reading Modes & Settings
- **Orientation**: Support both vertical continuous scroll and horizontal single-page / double-page view.
- **Paging / Scroll**: Support discrete paging mode or smooth continuous scrolling.
- **Reading Direction**: Configurable Left-to-Right (LTR) and Right-to-Left (RTL, traditional manga format).
- **Fit Modes**: Support Fit Width, Fit Height, or Fit Both.
- **Double-Tap & Pinch Zoom**: Native gesture-based multi-touch zoom and pan.
- **Dimmer Overlay**: Configurable black opacity dimmer (0.0 to 0.7) for comfortable low-light / night reading.

### Persistence of Per-Book Settings
- Persist reading mode and settings per book so user preferences are retained upon reopening.
