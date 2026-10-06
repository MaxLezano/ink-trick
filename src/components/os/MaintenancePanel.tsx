/**
 * InkTrick OS maintenance (long-press "Ajustes rápidos"): Play Store visibility, Android settings
 * and turning the dedicated mode off.
 */
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../utils/constants';
import { ChevronLeftIcon } from '../Icons';
import { useTabletStore } from '../../store/tabletStore';
import {
  isPlayStoreHidden,
  openAndroidSettings,
  releaseKiosk,
  setPlayStoreHidden,
} from '../../services/tabletControlService';

export default function MaintenancePanel({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [playHidden, setPlayHidden] = useState<boolean | null>(null);

  useEffect(() => {
    isPlayStoreHidden().then(setPlayHidden);
  }, []);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.roundBtn} onPress={onBack} accessibilityLabel="Volver">
        <ChevronLeftIcon size={18} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.title}>Mantenimiento</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  const confirmRelease = () =>
    Alert.alert(
      '¿Desactivar InkTrick OS?',
      'La tablet vuelve a ser una tablet Android normal: vuelven la pantalla de bloqueo, las demás apps y la barra de notificaciones. Tus libros y tu progreso se conservan. Para activarlo otra vez hay que usar setup-tablet.ps1 desde una computadora.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar',
          onPress: async () => {
            const ok = await releaseKiosk();
            if (ok) useTabletStore.setState({ isDeviceOwner: false });
            onClose();
            Alert.alert('InkTrick OS', ok ? 'Modo dedicado desactivado.' : 'No se pudo desactivar el modo dedicado.');
          },
        },
      ],
    );

  return (
    <View>
      {header}

      <Row
        title="Play Store"
        sub={playHidden ? 'Oculta: sin descargas ni avisos en segundo plano' : 'Visible: permite instalar y actualizar apps'}
        action={playHidden ? 'Mostrar' : 'Ocultar'}
        onPress={async () => {
          if (playHidden === null) return;
          if (await setPlayStoreHidden(!playHidden)) setPlayHidden(!playHidden);
        }}
      />

      <Row
        title="Ajustes de Android"
        sub="Sale del modo InkTrick; el botón de inicio te trae de vuelta"
        action="Abrir"
        onPress={() => {
          onClose();
          openAndroidSettings();
        }}
      />
      <Row title="Desactivar InkTrick OS" sub="La tablet vuelve a ser Android normal" action="Desactivar" onPress={confirmRelease} />
    </View>
  );
}

function Row({ title, sub, action, onPress }: { title: string; sub: string; action: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Text style={styles.link}>{action}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  rowText: { flex: 1 },
  rowTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  rowSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  link: { color: COLORS.gold, fontSize: 12, fontWeight: '600' },
});
