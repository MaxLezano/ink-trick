/**
 * InkTrick - Reader settings dialog
 * Centered dialog with every per-book reading option. Changes apply instantly.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookSettings, DoublePageMode, TextFont, TextTheme } from '../../utils/types';
import { COLORS } from '../../utils/constants';
import { RefreshIcon } from '../Icons';

interface Props {
  visible: boolean;
  settings: BookSettings;
  isComic: boolean;
  isEpub: boolean;
  onChange: (settings: BookSettings) => void;
  onResetProgress: () => void;
  onClose: () => void;
}

interface Choice<T> {
  label: string;
  value: T;
}

function Segmented<T>({ label, hint, choices, value, onSelect }: {
  label: string;
  hint?: string;
  choices: Choice<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.segment}>
        {choices.map(choice => {
          const active = choice.value === value;
          return (
            <TouchableOpacity
              key={choice.label}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => onSelect(choice.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{choice.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const TEXT_SIZES = [85, 100, 115, 130, 150, 175];

const onOff: Choice<boolean>[] = [
  { label: 'No', value: false },
  { label: 'Sí', value: true },
];

type PresetValues = Pick<BookSettings, 'isHorizontal' | 'usePaging' | 'isRTL' | 'fitMode' | 'doublePage'>;

// The four typical ways of reading. "Libro" is a comic without spreads: always one page.
const PRESETS: { id: string; title: string; hint: string; values: PresetValues }[] = [
  { id: 'manga', title: 'Manga', hint: 'Páginas · Der → Izq', values: { isHorizontal: true, usePaging: true, isRTL: true, fitMode: 2, doublePage: 'auto' } },
  { id: 'manhwa', title: 'Manhwa', hint: 'Vertical continuo', values: { isHorizontal: false, usePaging: false, isRTL: false, fitMode: 0, doublePage: 'off' } },
  { id: 'comic', title: 'Cómic', hint: 'Páginas · Izq → Der', values: { isHorizontal: true, usePaging: true, isRTL: false, fitMode: 2, doublePage: 'auto' } },
  { id: 'book', title: 'Libro', hint: 'Una página a la vez', values: { isHorizontal: true, usePaging: true, isRTL: false, fitMode: 2, doublePage: 'off' } },
];

function matchesPreset(settings: BookSettings, values: PresetValues): boolean {
  // Vertical layouts ignore direction and spreads, so only compare what applies.
  if (!values.isHorizontal) {
    return !settings.isHorizontal && settings.usePaging === values.usePaging && settings.fitMode === values.fitMode;
  }
  return (
    settings.isHorizontal &&
    settings.usePaging === values.usePaging &&
    settings.isRTL === values.isRTL &&
    settings.fitMode === values.fitMode &&
    (settings.doublePage ?? 'auto') === values.doublePage
  );
}

export default function ReaderSettingsSheet({ visible, settings, isComic, isEpub, onChange, onResetProgress, onClose }: Props) {
  const set = <K extends keyof BookSettings>(key: K, value: BookSettings[K]) => onChange({ ...settings, [key]: value });

  const activePreset = PRESETS.find(p => matchesPreset(settings, p.values))?.id;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrapper} pointerEvents="box-none">
      <View style={styles.sheet}>
        <Text style={styles.title}>Ajustes de lectura</Text>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isEpub ? (
            <>
              <Text style={styles.section}>Texto</Text>
              <Segmented
                label="Tamaño de letra"
                choices={TEXT_SIZES.map(v => ({ label: `${v}%`, value: v }))}
                value={settings.textSize ?? 100}
                onSelect={v => set('textSize', v)}
              />
              <Segmented
                label="Colores"
                choices={[
                  { label: 'Oscuro', value: 'dark' as TextTheme },
                  { label: 'Sepia', value: 'sepia' as TextTheme },
                  { label: 'Claro', value: 'light' as TextTheme },
                ]}
                value={settings.textTheme ?? 'dark'}
                onSelect={v => set('textTheme', v)}
              />
              <Segmented
                label="Tipo de letra"
                choices={[
                  { label: 'Del libro', value: 'book' as TextFont },
                  { label: 'Serif', value: 'serif' as TextFont },
                  { label: 'Sans', value: 'sans' as TextFont },
                ]}
                value={settings.textFont ?? 'book'}
                onSelect={v => set('textFont', v)}
              />
              <Segmented
                label="Interlineado"
                choices={[
                  { label: 'Compacto', value: 1.35 },
                  { label: 'Normal', value: 1.6 },
                  { label: 'Amplio', value: 1.9 },
                ]}
                value={settings.lineHeight ?? 1.6}
                onSelect={v => set('lineHeight', v)}
              />
            </>
          ) : (
          <>
          <Text style={styles.section}>Modo rápido</Text>
          <View style={styles.presets}>
            {PRESETS.map(preset => {
              const active = preset.id === activePreset;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[styles.preset, active && styles.presetActive]}
                  onPress={() => onChange({ ...settings, ...preset.values })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.presetTitle, active && styles.presetTitleActive]}>
                    {preset.title}
                  </Text>
                  <Text style={[styles.presetHint, active && styles.presetHintActive]}>{preset.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!activePreset && <Text style={styles.customHint}>Configuración personalizada</Text>}

          <Text style={styles.section}>Diseño</Text>
          <Segmented
            label="Dirección de scroll"
            choices={[{ label: 'Vertical', value: false }, { label: 'Horizontal', value: true }]}
            value={settings.isHorizontal}
            onSelect={v => set('isHorizontal', v)}
          />
          <Segmented
            label="Desplazamiento"
            choices={[{ label: 'Continuo', value: false }, { label: 'Por página', value: true }]}
            value={settings.usePaging}
            onSelect={v => set('usePaging', v)}
          />
          {settings.isHorizontal && (
            <Segmented
              label="Sentido de lectura"
              hint="Der → Izq es el formato manga japonés"
              choices={[{ label: 'Izq → Der', value: false }, { label: 'Der → Izq', value: true }]}
              value={settings.isRTL}
              onSelect={v => set('isRTL', v)}
            />
          )}
          <Segmented
            label="Ajustar página"
            choices={[{ label: 'Ancho', value: 0 }, { label: 'Alto', value: 1 }, { label: 'Completa', value: 2 }]}
            value={settings.fitMode}
            onSelect={v => set('fitMode', v)}
          />
          {isComic && settings.isHorizontal && settings.usePaging && (
            <Segmented
              label="Doble página"
              hint="Automático: dos páginas solo en horizontal"
              choices={[
                { label: 'No', value: 'off' as DoublePageMode },
                { label: 'Auto', value: 'auto' as DoublePageMode },
                { label: 'Sí', value: 'on' as DoublePageMode },
              ]}
              value={settings.doublePage ?? 'auto'}
              onSelect={v => set('doublePage', v)}
            />
          )}
          {isComic && (settings.isHorizontal || settings.usePaging) && (
            <Segmented
              label="Recortar márgenes"
              hint="Quita bordes blancos o negros de cada página"
              choices={onOff}
              value={settings.autoCrop ?? false}
              onSelect={v => set('autoCrop', v)}
            />
          )}
          </>
          )}

          <Text style={styles.section}>Gestos</Text>
          <Segmented label="Zoom con doble toque" choices={onOff} value={settings.enableDoubleTapZoom} onSelect={v => set('enableDoubleTapZoom', v)} />
          {(isComic || isEpub || settings.usePaging) && (
            <Segmented
              label="Tocar bordes para pasar página"
              hint="El menú se abre tocando arriba"
              choices={onOff}
              value={settings.tapToTurn ?? true}
              onSelect={v => set('tapToTurn', v)}
            />
          )}
          <Segmented
            label="Teclas de volumen"
            hint="Bajar volumen avanza, subir retrocede"
            choices={onOff}
            value={settings.volumeKeys ?? true}
            onSelect={v => set('volumeKeys', v)}
          />
          {(settings.volumeKeys ?? true) && (
            <Segmented
              label="Invertir teclas de volumen"
              hint="Subir volumen avanza, bajar retrocede"
              choices={onOff}
              value={settings.invertVolumeKeys ?? false}
              onSelect={v => set('invertVolumeKeys', v)}
            />
          )}

          <Text style={styles.section}>Pantalla</Text>
          <Segmented
            label="Atenuar brillo"
            choices={[0, 0.2, 0.4, 0.6].map(v => ({ label: `${v * 100}%`, value: v }))}
            value={settings.brightnessDimmer}
            onSelect={v => set('brightnessDimmer', v)}
          />
          <Segmented
            label="Tono cálido"
            hint="Menos luz azul para leer de noche"
            choices={[0, 0.1, 0.2, 0.3].map(v => ({ label: v ? `${Math.round(v * 100)}%` : 'No', value: v }))}
            value={settings.warmth ?? 0}
            onSelect={v => set('warmth', v)}
          />
          <Segmented
            label="Pantalla completa"
            hint="Oculta la barra de navegación de Android"
            choices={onOff}
            value={settings.fullscreen ?? true}
            onSelect={v => set('fullscreen', v)}
          />
          <Segmented label="Mantener pantalla encendida" choices={onOff} value={settings.keepAwake ?? true} onSelect={v => set('keepAwake', v)} />

          <TouchableOpacity style={styles.resetBtn} onPress={onResetProgress}>
            <RefreshIcon size={16} color="#FFF" />
            <Text style={styles.resetText}>Volver al inicio del libro</Text>
          </TouchableOpacity>
        </ScrollView>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneText}>Listo</Text>
        </TouchableOpacity>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    backgroundColor: '#161616',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  content: {
    paddingBottom: 12,
  },
  section: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  preset: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  presetTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  presetActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  presetTitleActive: {
    color: '#0A0A0A',
  },
  presetHintActive: {
    color: 'rgba(10,10,10,0.7)',
  },
  customHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    marginTop: 8,
  },
  presetHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: COLORS.accent,
  },
  segmentText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#0A0A0A',
  },
  resetBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  resetText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  doneBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  doneText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '800',
  },
});
