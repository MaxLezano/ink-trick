/**
 * InkTrick OS quick settings: profile, battery / Wi-Fi, brightness, eye comfort, rotation in the
 * reader, screen sleep, Google Drive, files and USB transfer. Long-pressing the title opens
 * Android settings (leaves the kiosk; Home brings InkTrick back).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../utils/constants';
import {
  BatteryIcon,
  CheckDoneIcon,
  ChevronLeftIcon,
  CloseIcon,
  EyeIcon,
  FilesFolderIcon,
  GoogleDriveIcon,
  ImageIcon,
  MoonIcon,
  RotateIcon,
  UsbIcon,
  WifiIcon,
} from './Icons';
import {
  addGoogleAccount,
  getScreenTimeout,
  openGoogleDrive,
  pickProfilePhoto,
  setScreenTimeout,
} from '../services/tabletControlService';
import { useTabletStore, WARMTH_LEVELS } from '../store/tabletStore';
import { importFromDownloads } from '../services/importService';
import { AVATARS } from '../utils/avatars';
import ProfileAvatar from './os/ProfileAvatar';
import BrightnessSlider from './os/BrightnessSlider';
import WifiPanel from './os/WifiPanel';
import MaintenancePanel from './os/MaintenancePanel';
import { useDeviceStatus } from './os/useDeviceStatus';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type View_ = 'settings' | 'profile' | 'wifi' | 'maintenance';

const SLEEP_MODES: { label: string; value: 'art' | 'book' }[] = [
  { label: 'Libro actual', value: 'book' },
  { label: 'Arte', value: 'art' },
];

const TIMEOUTS = [
  { label: '2 min', value: 120000 },
  { label: '5 min', value: 300000 },
  { label: '10 min', value: 600000 },
  { label: '30 min', value: 1800000 },
];

export default function InkTrickQuickMenu({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<View_>('settings');
  const status = useDeviceStatus(visible);
  const [timeout, setTimeoutValue] = useState<number | null>(null);

  const profileName = useTabletStore(s => s.profileName);
  const googleAccount = useTabletStore(s => s.googleAccount);
  const warmth = useTabletStore(s => s.warmth);
  const autoRotate = useTabletStore(s => s.autoRotateInReader);
  const sleepMode = useTabletStore(s => s.sleepMode);

  useEffect(() => {
    if (!visible) return;
    setView('settings');
    getScreenTimeout().then(setTimeoutValue);
    useTabletStore.getState().refreshGoogleAccount();
  }, [visible]);

  const openDrive = async () => {
    if (!googleAccount) {
      setView('profile');
      return;
    }
    if (await openGoogleDrive()) onClose();
    else Alert.alert('Google Drive', 'Google Drive no está instalado en esta tablet. Puedes copiar tus libros con el cable USB.');
  };

  const importBooks = () => {
    onClose();
    importFromDownloads();
  };

  // Short: it shares a row. The full how-to lives in /sdcard/InkTrick/LEEME.txt.
  const usbSubtitle = !status.isUsbConnected ? 'Sin cable' : status.isMtpActive ? 'Conectada a la PC' : 'Solo carga';

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={view === 'settings' ? onClose : () => setView('settings')}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.panel, { marginTop: Math.max(insets.top, 12) + 8 }]} onPress={e => e.stopPropagation()}>
          {view === 'wifi' ? (
            <WifiPanel onBack={() => setView('settings')} />
          ) : view === 'maintenance' ? (
            <MaintenancePanel onBack={() => setView('settings')} onClose={onClose} />
          ) : view === 'profile' ? (
            <ProfilePanel onBack={() => setView('settings')} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.topRow}>
                <Pressable onLongPress={() => setView('maintenance')} delayLongPress={1500}>
                  <Text style={styles.title}>Ajustes rápidos</Text>
                </Pressable>
                <TouchableOpacity style={styles.roundBtn} onPress={onClose} accessibilityLabel="Cerrar">
                  <CloseIcon size={18} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.card} onPress={() => setView('profile')} activeOpacity={0.8}>
                <ProfileAvatar size={52} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {profileName || 'Lector'}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {googleAccount ?? 'Sin cuenta de Google'}
                  </Text>
                </View>
                <Text style={styles.link}>Editar</Text>
              </TouchableOpacity>

              <View style={styles.row2}>
                <View style={[styles.tile, styles.tileStatic]}>
                  <BatteryIcon size={22} color={COLORS.gold} level={Math.max(0, status.batteryLevel)} charging={status.isCharging} />
                  <View style={styles.cardText}>
                    <Text style={styles.tileTitle}>{status.batteryLevel >= 0 ? `${status.batteryLevel}%` : '—'}</Text>
                    <Text style={styles.cardSub}>{status.isCharging ? 'Cargando' : 'Batería'}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.tile} onPress={() => setView('wifi')} activeOpacity={0.7}>
                  <WifiIcon size={20} color={status.isWifiConnected ? COLORS.gold : 'rgba(255,255,255,0.4)'} />
                  <View style={styles.cardText}>
                    <Text style={styles.tileTitle} numberOfLines={1}>
                      {status.wifiSsid ?? (status.isWifiEnabled ? 'Sin conexión' : 'Apagado')}
                    </Text>
                    <Text style={styles.cardSub}>Wi-Fi</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <BrightnessSlider />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <EyeIcon size={17} color={COLORS.gold} />
                  <Text style={styles.sectionLabel}>Tono cálido</Text>
                </View>
                <View style={styles.segmented}>
                  {WARMTH_LEVELS.map(l => (
                    <TouchableOpacity
                      key={l.value}
                      style={[styles.segment, warmth === l.value && styles.segmentActive]}
                      onPress={() => useTabletStore.getState().setWarmth(l.value)}
                    >
                      <Text style={[styles.segmentText, warmth === l.value && styles.segmentTextActive]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row2}>
                <Toggle
                  icon={<RotateIcon size={18} color={autoRotate ? COLORS.background : COLORS.text} />}
                  label="Giro automático"
                  status={autoRotate ? 'Al leer' : 'Siempre vertical'}
                  active={autoRotate}
                  onPress={useTabletStore.getState().toggleAutoRotateInReader}
                />
                <View style={[styles.tile, styles.tileStatic, status.isMtpActive && styles.usbActive]}>
                  <UsbIcon size={18} color={status.isUsbConnected ? COLORS.gold : COLORS.accent} />
                  <View style={styles.cardText}>
                    <Text style={styles.tileTitle}>Transferencia USB</Text>
                    <Text style={[styles.cardSub, status.isMtpActive && { color: COLORS.gold }]} numberOfLines={1}>
                      {usbSubtitle}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <MoonIcon size={17} color={COLORS.gold} />
                  <Text style={styles.sectionLabel}>Apagar pantalla tras</Text>
                </View>
                <View style={styles.segmented}>
                  {TIMEOUTS.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.segment, timeout === t.value && styles.segmentActive]}
                      onPress={async () => {
                        if (await setScreenTimeout(t.value)) setTimeoutValue(t.value);
                      }}
                    >
                      <Text style={[styles.segmentText, timeout === t.value && styles.segmentTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <MoonIcon size={17} color={COLORS.gold} />
                  <Text style={styles.sectionLabel}>Pantalla de reposo</Text>
                </View>
                <View style={styles.segmented}>
                  {SLEEP_MODES.map(m => (
                    <TouchableOpacity
                      key={m.value}
                      style={[styles.segment, sleepMode === m.value && styles.segmentActive]}
                      onPress={() => useTabletStore.getState().setSleepMode(m.value)}
                    >
                      <Text style={[styles.segmentText, sleepMode === m.value && styles.segmentTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.row2}>
                <TouchableOpacity style={[styles.tile, !googleAccount && styles.dim]} onPress={openDrive} activeOpacity={0.7}>
                  <View style={styles.iconBox}>
                    <GoogleDriveIcon size={20} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.tileTitle}>Google Drive</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {googleAccount ? 'Descargar libros' : 'Requiere cuenta'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.tile} onPress={importBooks} activeOpacity={0.7}>
                  <View style={styles.iconBox}>
                    <FilesFolderIcon size={20} color={COLORS.gold} />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.tileTitle}>Importar libros</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      Desde Descargas
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Toggle({ icon, label, status, active, onPress }: {
  icon: React.ReactNode;
  label: string;
  status: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, active && styles.toggleActive]}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
    >
      {icon}
      <View style={styles.cardText}>
        <Text style={[styles.tileTitle, active && { color: COLORS.background }]}>{label}</Text>
        <Text style={[styles.cardSub, active && { color: 'rgba(10,10,10,0.7)' }]}>{status}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ProfilePanel({ onBack }: { onBack: () => void }) {
  const avatarId = useTabletStore(s => s.avatarId);
  const photoUri = useTabletStore(s => s.photoUri);
  const profileName = useTabletStore(s => s.profileName);
  const googleAccount = useTabletStore(s => s.googleAccount);
  const [name, setName] = useState(profileName);
  const [gridWidth, setGridWidth] = useState(0);
  // Four avatars per row, filling the panel width exactly.
  const cell = gridWidth > 0 ? { width: Math.floor((gridWidth - GRID_GAP * 3) / 4) } : null;
  const { setAvatar, setProfileName, refreshGoogleAccount } = useTabletStore.getState();

  const googlePhotoUri = useTabletStore(s => s.googlePhotoUri);
  const googleName = useTabletStore(s => s.googleName);
  const [syncing, setSyncing] = useState(false);

  const applyGooglePhoto = async () => {
    setSyncing(true);
    const result = await useTabletStore.getState().syncGoogleProfile(true);
    setSyncing(false);
    if (result === 'ok') {
      if (useTabletStore.getState().googlePhotoUri) setAvatar('google');
    } else if (result === 'error') {
      Alert.alert('Foto de Google', 'No se pudo obtener tu foto de Google. Revisa la conexión Wi-Fi e inténtalo de nuevo.');
    }
  };

  const choosePhoto = async () => {
    const uri = await pickProfilePhoto();
    if (uri) setAvatar('photo', uri);
  };

  return (
    <View>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.roundBtn} onPress={onBack} accessibilityLabel="Volver">
          <ChevronLeftIcon size={18} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Perfil</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.nameRow}>
        <ProfileAvatar size={64} />
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          onEndEditing={() => setProfileName(name)}
          placeholder="Tu nombre"
          placeholderTextColor="rgba(255,255,255,0.35)"
          maxLength={32}
          returnKeyType="done"
        />
      </View>

      <Text style={styles.sectionCaps}>Elige tu avatar</Text>
      <ScrollView
        style={styles.avatarScroll}
        contentContainerStyle={styles.avatarGrid}
        showsVerticalScrollIndicator={false}
        onLayout={e => setGridWidth(e.nativeEvent.layout.width)}
      >
        {googleAccount ? (
          <TouchableOpacity
            style={[styles.avatarCell, cell, avatarId === 'google' && styles.avatarCellActive]}
            onPress={googlePhotoUri ? () => setAvatar('google') : applyGooglePhoto}
            accessibilityLabel="Foto de Google"
          >
            {googlePhotoUri ? (
              <Image source={{ uri: googlePhotoUri }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory" />
            ) : (
              <View style={styles.photoEmpty}>
                {syncing ? <ActivityIndicator color={COLORS.gold} /> : <ImageIcon size={22} color={COLORS.gold} />}
                <Text style={styles.photoText}>Google</Text>
              </View>
            )}
            {avatarId === 'google' ? <Check /> : null}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.avatarCell, cell, avatarId === 'photo' && styles.avatarCellActive]}
          onPress={photoUri && avatarId !== 'photo' ? () => setAvatar('photo') : choosePhoto}
          onLongPress={choosePhoto}
          accessibilityLabel="Tu foto"
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" cachePolicy="memory" />
          ) : (
            <View style={styles.photoEmpty}>
              <ImageIcon size={22} color={COLORS.gold} />
              <Text style={styles.photoText}>Tu foto</Text>
            </View>
          )}
          {avatarId === 'photo' ? <Check /> : null}
        </TouchableOpacity>
        {AVATARS.map(a => (
          <TouchableOpacity
            key={a.id}
            style={[styles.avatarCell, cell, avatarId === a.id && styles.avatarCellActive]}
            onPress={() => setAvatar(a.id)}
            accessibilityLabel={`Avatar ${a.name}`}
          >
            <Image source={a.source} style={styles.avatarImg} contentFit="cover" cachePolicy="memory" />
            {avatarId === a.id ? <Check /> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
      {photoUri ? <Text style={styles.hint}>Mantén presionada tu foto para cambiarla.</Text> : null}

      <Text style={styles.sectionCaps}>Cuenta de Google</Text>
      {googleAccount ? (
        <View style={styles.card}>
          <View style={styles.cardText}>
            <Text style={styles.tileTitle} numberOfLines={1}>
              {googleAccount}
            </Text>
            <Text style={styles.cardSub}>{googleName ?? 'Para descargar libros desde Google Drive'}</Text>
          </View>
          <TouchableOpacity onPress={applyGooglePhoto} disabled={syncing}>
            <Text style={styles.link}>{googlePhotoUri ? 'Actualizar foto' : 'Usar su foto'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.card}
          onPress={async () => {
            await addGoogleAccount();
            refreshGoogleAccount();
          }}
        >
          <View style={styles.cardText}>
            <Text style={styles.tileTitle}>Agregar cuenta de Google</Text>
            <Text style={styles.cardSub}>Para descargar libros desde Google Drive</Text>
          </View>
          <Text style={styles.link}>Agregar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const GRID_GAP = 10;

const Check = () => (
  <View style={styles.check}>
    <CheckDoneIcon size={12} color={COLORS.background} />
  </View>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center' },
  panel: {
    width: '92%',
    maxWidth: 560,
    maxHeight: '92%',
    backgroundColor: '#121216',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(169,139,208,0.16)',
    elevation: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  roundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardText: { flex: 1 },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  cardSub: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  link: { color: COLORS.gold, fontSize: 12, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  tileStatic: { backgroundColor: 'rgba(255,255,255,0.025)' },
  tileTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  toggleActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  dim: { opacity: 0.5 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: { marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: COLORS.gold },
  segmentText: { color: COLORS.accent, fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: COLORS.background, fontWeight: '700' },
  usb: { marginBottom: 0 },
  usbActive: { borderColor: 'rgba(226,184,78,0.45)', backgroundColor: 'rgba(226,184,78,0.08)' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: COLORS.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionCaps: {
    color: COLORS.wisteria,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  avatarScroll: { maxHeight: 300, marginBottom: 6 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  avatarCell: {
    width: '22.5%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.surface,
  },
  avatarCellActive: { borderColor: COLORS.gold },
  avatarImg: { width: '100%', height: '100%' },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoText: { color: COLORS.gold, fontSize: 11, fontWeight: '600' },
  check: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 12 },
});
