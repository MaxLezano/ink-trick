/**
 * InkTrick - "Mi lectura"
 * Reading statistics and backup (export / import).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ReadingStats, RootStackParamList } from '../utils/types';
import { COLORS } from '../utils/constants';
import { useLibraryStore } from '../store/libraryStore';
import * as StorageService from '../services/storageService';
import * as BackupService from '../services/backupService';
import { formatDuration, formatRelativeDate } from '../utils/format';
import { BackIcon } from '../components/Icons';

type Props = {
  navigation: StackNavigationProp<RootStackParamList, 'Stats'>;
};

const CHART_DAYS = 14;
const CHART_HEIGHT = 140;
const pagesLabel = (n: number) => `${n} ${n === 1 ? 'página' : 'páginas'}`;
const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MIN_ACTIVE_SECONDS = 60;

function lastDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

/** Consecutive days with reading, ending today (or yesterday if today has none yet). */
function currentStreak(stats: ReadingStats): number {
  const active = (d: Date) => (stats.days[StorageService.dayKey(d)]?.seconds ?? 0) >= MIN_ACTIVE_SECONDS;
  const day = new Date();
  if (!active(day)) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (active(day)) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

function bestStreak(stats: ReadingStats): number {
  const keys = Object.keys(stats.days)
    .filter(k => stats.days[k].seconds >= MIN_ACTIVE_SECONDS)
    .sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of keys) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const consecutive = prev && Math.round((date.getTime() - prev.getTime()) / 86400000) === 1;
    run = consecutive ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

export default function StatsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const books = useLibraryStore(s => s.books);
  const progress = useLibraryStore(s => s.progress);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'auto' | null>(null);
  const [auto, setAuto] = useState<StorageService.AutoBackupConfig | null>(null);

  const reload = useCallback(() => {
    StorageService.getStats().then(setStats);
    StorageService.getAutoBackup().then(setAuto);
  }, []);
  useEffect(reload, [reload]);

  const summary = useMemo(() => {
    if (!stats) return null;
    const days = lastDays(CHART_DAYS).map(d => ({ date: d, ...(stats.days[StorageService.dayKey(d)] ?? { seconds: 0, pages: 0 }) }));
    const week = days.slice(-7);
    const all = Object.values(stats.days);
    const finishedIds = new Set([
      ...Object.keys(stats.finished),
      ...Object.values(progress).filter(p => p.percentage >= 100).map(p => p.bookId),
    ]);
    const topBooks = Object.entries(stats.books)
      .map(([id, value]) => ({ book: books.find(b => b.id === id), ...value }))
      .filter(entry => entry.book && entry.seconds >= MIN_ACTIVE_SECONDS)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5);
    return {
      days,
      today: days[days.length - 1],
      weekSeconds: week.reduce((a, d) => a + d.seconds, 0),
      weekPages: week.reduce((a, d) => a + d.pages, 0),
      totalSeconds: all.reduce((a, d) => a + d.seconds, 0),
      totalPages: all.reduce((a, d) => a + d.pages, 0),
      streak: currentStreak(stats),
      best: bestStreak(stats),
      finished: [...finishedIds].filter(id => books.some(b => b.id === id)).length,
      inProgress: Object.values(progress).filter(p => p.percentage > 0 && p.percentage < 100).length,
      topBooks,
      // At least a 30 min scale so a few seconds never look like a full bar.
      maxSeconds: Math.max(1800, ...days.map(d => d.seconds)),
    };
  }, [books, progress, stats]);

  const handleExport = useCallback(async () => {
    setBusy('export');
    try {
      const name = await BackupService.exportBackup();
      if (name) Alert.alert('Respaldo guardado', `Se creó "${name}" en la carpeta elegida.`);
    } catch (error: any) {
      Alert.alert('No se pudo exportar', error?.message ?? 'Intenta elegir otra carpeta.');
    } finally {
      setBusy(null);
    }
  }, []);

  const handleImport = useCallback(async () => {
    setBusy('import');
    try {
      const result = await BackupService.importBackup(useLibraryStore.getState().books);
      if (!result) return;
      await useLibraryStore.getState().loadLibrary();
      reload();
      Alert.alert(
        'Respaldo restaurado',
        result.matched === result.total
          ? `Se recuperó el progreso de tus ${result.total} libros.`
          : `Se recuperó el progreso de ${result.matched} de ${result.total} libros. Los demás no están en tus carpetas actuales.`,
      );
    } catch (error: any) {
      Alert.alert('No se pudo importar', error?.message ?? 'El archivo no es válido.');
    } finally {
      setBusy(null);
    }
  }, [reload]);

  const handleEnableAuto = useCallback(async () => {
    setBusy('auto');
    try {
      const config = await BackupService.enableAutoBackup();
      if (config) setAuto(config);
      if (config?.lastError) Alert.alert('No se pudo guardar', config.lastError);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleDisableAuto = useCallback(() => {
    Alert.alert('Respaldo automático', '¿Quieres desactivarlo? Los respaldos ya guardados se quedan en la carpeta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desactivar',
        style: 'destructive',
        onPress: async () => {
          await BackupService.disableAutoBackup();
          setAuto(null);
        },
      },
    ]);
  }, []);

  const chartWidth = Math.min(width, 900) - 40 - 32;
  const barSlot = chartWidth / CHART_DAYS;
  const barWidth = Math.max(8, Math.min(22, barSlot - 8));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <BackIcon size={18} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi lectura</Text>
      </View>

      {!summary ? (
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.tiles}>
            <Tile label="Hoy" value={formatDuration(summary.today.seconds)} hint={pagesLabel(summary.today.pages)} />
            <Tile label="Esta semana" value={formatDuration(summary.weekSeconds)} hint={pagesLabel(summary.weekPages)} />
            <Tile label="Racha" value={`${summary.streak} ${summary.streak === 1 ? 'día' : 'días'}`} hint={`Mejor: ${summary.best}`} />
            <Tile label="Terminados" value={`${summary.finished}`} hint={`${summary.inProgress} en curso`} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Minutos leídos · últimos {CHART_DAYS} días</Text>
            <Text style={styles.cardHint}>
              {selectedDay !== null
                ? `${summary.days[selectedDay].date.toLocaleDateString()} · ${formatDuration(summary.days[selectedDay].seconds)} · ${pagesLabel(summary.days[selectedDay].pages)}`
                : 'Toca una barra para ver el detalle'}
            </Text>
            <View style={[styles.chart, { height: CHART_HEIGHT + 22 }]}>
              <View style={[styles.gridLine, { bottom: 22 + CHART_HEIGHT / 2 }]} />
              <View style={[styles.baseline, { bottom: 22 }]} />
              {summary.days.map((day, i) => {
                const h = day.seconds >= 30 ? Math.max(4, (day.seconds / summary.maxSeconds) * CHART_HEIGHT) : 0;
                const isToday = i === summary.days.length - 1;
                const isSelected = i === selectedDay;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.barSlot, { width: barSlot }]}
                    onPress={() => setSelectedDay(isSelected ? null : i)}
                    activeOpacity={0.7}
                    accessibilityLabel={`${day.date.toLocaleDateString()}: ${formatDuration(day.seconds)}`}
                  >
                    <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end' }}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: barWidth,
                            height: h,
                            backgroundColor: isSelected || isToday ? '#FFFFFF' : 'rgba(255,255,255,0.38)',
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, (isToday || isSelected) && styles.barLabelStrong]}>
                      {isToday ? 'Hoy' : WEEKDAYS[day.date.getDay()]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.cardFoot}>
              Total: {formatDuration(summary.totalSeconds)} · {pagesLabel(summary.totalPages)}
            </Text>
          </View>

          {summary.topBooks.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Lo que más leíste</Text>
              {summary.topBooks.map(({ book, seconds, pages }) => (
                <View key={book!.id} style={styles.topRow}>
                  {book!.coverUri ? (
                    <Image cachePolicy="memory" source={{ uri: book!.coverUri }} style={styles.topCover} contentFit="cover" />
                  ) : (
                    <View style={[styles.topCover, { backgroundColor: '#222' }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topTitle} numberOfLines={1}>{book!.title}</Text>
                    <Text style={styles.topMeta}>{formatDuration(seconds)} · {pagesLabel(pages)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Respaldo</Text>
            <Text style={styles.cardText}>
              Guarda tu progreso, favoritos, colecciones, ajustes y estadísticas en un archivo. Sirve para no perder nada al
              reinstalar la app o para pasarlo a otra tablet (los libros se reconocen por nombre y tamaño).
            </Text>
            <View style={[styles.row, styles.rowEnd]}>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleExport} disabled={!!busy}>
                {busy === 'export' ? <ActivityIndicator color="#0A0A0A" /> : <Text style={styles.primaryBtnText}>Exportar respaldo</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.outlineBtn} onPress={handleImport} disabled={!!busy}>
                {busy === 'import' ? <ActivityIndicator color={COLORS.accent} /> : <Text style={styles.outlineBtnText}>Importar</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Respaldo automático semanal</Text>
            <Text style={styles.cardText}>
              Una vez por semana se guarda una copia en la carpeta que elijas (se conservan las 3 más recientes). Si la
              carpeta se sincroniza con otra tablet, allí puedes importarla.
            </Text>
            {auto ? (
              <Text style={[styles.cardHint, auto.lastError ? { color: COLORS.seal } : null]}>
                {auto.lastError
                  ? `Último intento falló: ${auto.lastError}`
                  : `Activo en "${auto.folderName}"${auto.lastAt ? ` · último ${formatRelativeDate(auto.lastAt)}` : ''}`}
              </Text>
            ) : null}
            <View style={[styles.row, styles.rowEnd]}>
              {auto ? (
                <TouchableOpacity style={styles.outlineBtn} onPress={handleDisableAuto} disabled={!!busy}>
                  <Text style={styles.outlineBtnText}>Desactivar</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleEnableAuto} disabled={!!busy}>
                {busy === 'auto' ? (
                  <ActivityIndicator color="#0A0A0A" />
                ) : (
                  <Text style={styles.primaryBtnText}>{auto ? 'Cambiar carpeta' : 'Elegir carpeta'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      )}
    </View>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  content: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 140,
    padding: 16,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tileLabel: {
    color: 'rgba(240,240,240,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileValue: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  tileHint: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardHint: {
    color: 'rgba(240,240,240,0.55)',
    fontSize: 12,
  },
  cardText: {
    color: 'rgba(240,240,240,0.65)',
    fontSize: 13,
    lineHeight: 19,
  },
  cardFoot: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 12,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  barSlot: {
    alignItems: 'center',
  },
  bar: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabel: {
    height: 22,
    paddingTop: 5,
    color: 'rgba(240,240,240,0.45)',
    fontSize: 10,
    fontWeight: '700',
  },
  barLabelStrong: {
    color: COLORS.text,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  topCover: {
    width: 36,
    height: 52,
    borderRadius: 6,
  },
  topTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  topMeta: {
    color: 'rgba(240,240,240,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
  primaryBtn: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '800',
  },
  outlineBtn: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
