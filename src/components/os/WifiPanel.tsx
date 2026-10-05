/**
 * In-app Wi-Fi picker (InkTrick OS): scan, connect with a password, forget. Keeps the reader
 * out of Android settings, which would leave the kiosk.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../utils/constants';
import { ChevronLeftIcon, LockIcon, WifiIcon } from '../Icons';
import {
  connectWifi,
  forgetWifi,
  getWifiNetworks,
  setWifiEnabled,
  startWifiScan,
  subscribe,
  WifiNetwork,
} from '../../services/tabletControlService';
import { useDeviceStatus } from './useDeviceStatus';

const SCAN_EVERY_MS = 15000;
const CONNECT_TIMEOUT_MS = 20000;

export default function WifiPanel({ onBack }: { onBack: () => void }) {
  const status = useDeviceStatus();
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<{ ssid: string; message: string } | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While typing a password the list keeps its order (scans re-sort it by signal).
  const frozen = useRef(false);
  frozen.current = expanded !== null;

  const refresh = useCallback(
    () =>
      getWifiNetworks().then(list => {
        if (!frozen.current) setNetworks(list);
      }),
    [],
  );

  // Scan while the panel is open (Android throttles scans; results also arrive from the system).
  useEffect(() => {
    if (!status.isWifiEnabled) return;
    const scan = () => {
      setScanning(true);
      startWifiScan().then(ok => !ok && setScanning(false));
    };
    refresh();
    scan();
    const timer = setInterval(scan, SCAN_EVERY_MS);
    const unsub = subscribe('onWifiScan', () => {
      setScanning(false);
      refresh();
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, [status.isWifiEnabled, refresh]);

  // Connection outcome.
  useEffect(() => {
    refresh();
    if (connecting && status.wifiSsid === connecting) {
      setConnecting(null);
      setExpanded(null);
      setPassword('');
    }
  }, [status.wifiSsid, status.isWifiConnected, connecting, refresh]);

  useEffect(
    () =>
      subscribe('onWifiAuthError', () => {
        setConnecting(current => {
          if (current) setError({ ssid: current, message: 'Contraseña incorrecta' });
          return null;
        });
      }),
    [],
  );

  useEffect(() => () => {
    if (connectTimer.current) clearTimeout(connectTimer.current);
  }, []);

  const connect = async (net: WifiNetwork, pass: string | null) => {
    setError(null);
    setConnecting(net.ssid);
    const ok = await connectWifi(net.ssid, pass, net.security);
    if (!ok) {
      setConnecting(null);
      setError({ ssid: net.ssid, message: 'No se pudo conectar' });
      return;
    }
    if (connectTimer.current) clearTimeout(connectTimer.current);
    connectTimer.current = setTimeout(() => {
      setConnecting(current => {
        if (current === net.ssid) setError({ ssid: net.ssid, message: 'No se pudo conectar. Revisa la contraseña.' });
        return current === net.ssid ? null : current;
      });
    }, CONNECT_TIMEOUT_MS);
  };

  const onPressNetwork = (net: WifiNetwork) => {
    if (net.connected) {
      Alert.alert(net.ssid, 'Estás conectado a esta red.', [
        { text: 'Cerrar', style: 'cancel' },
        { text: 'Olvidar red', style: 'destructive', onPress: () => forgetWifi(net.ssid).then(refresh) },
      ]);
      return;
    }
    if (net.security === 'eap') {
      Alert.alert('Red no compatible', 'Las redes empresariales (EAP) no se pueden configurar desde InkTrick.');
      return;
    }
    if (net.saved || net.security === 'open') {
      connect(net, null);
      return;
    }
    setError(null);
    setPassword('');
    setShowPassword(false);
    setExpanded(expanded === net.ssid ? null : net.ssid);
  };

  const subtitle = (net: WifiNetwork) => {
    if (connecting === net.ssid) return 'Conectando…';
    if (error?.ssid === net.ssid) return error.message;
    if (net.connected) return 'Conectado';
    if (net.saved) return 'Guardada';
    return net.security === 'open' ? 'Abierta' : 'Protegida';
  };

  return (
    <View>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityLabel="Volver">
          <ChevronLeftIcon size={18} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Wi-Fi</Text>
        {scanning && status.isWifiEnabled ? <ActivityIndicator size="small" color={COLORS.gold} /> : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.switch, status.isWifiEnabled && styles.switchOn]}
          onPress={() => setWifiEnabled(!status.isWifiEnabled)}
          accessibilityRole="switch"
          accessibilityState={{ checked: status.isWifiEnabled }}
          accessibilityLabel="Wi-Fi"
        >
          <View style={[styles.knob, status.isWifiEnabled && styles.knobOn]} />
        </TouchableOpacity>
      </View>

      {!status.isWifiEnabled ? (
        <Text style={styles.empty}>El Wi-Fi está apagado.</Text>
      ) : networks.length === 0 ? (
        <Text style={styles.empty}>{scanning ? 'Buscando redes…' : 'No se encontraron redes.'}</Text>
      ) : (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {networks.map(net => (
            <View key={net.ssid} style={[styles.row, net.connected && styles.rowConnected]}>
              <TouchableOpacity style={styles.rowMain} onPress={() => onPressNetwork(net)} activeOpacity={0.7}>
                <WifiIcon size={20} color={net.connected ? COLORS.gold : COLORS.text} signal={net.signal} />
                <View style={styles.rowText}>
                  <Text style={styles.ssid} numberOfLines={1}>
                    {net.ssid}
                  </Text>
                  <Text
                    style={[
                      styles.sub,
                      net.connected && { color: COLORS.gold },
                      error?.ssid === net.ssid && { color: COLORS.wisteria },
                    ]}
                  >
                    {subtitle(net)}
                  </Text>
                </View>
                {connecting === net.ssid ? (
                  <ActivityIndicator size="small" color={COLORS.gold} />
                ) : net.security !== 'open' ? (
                  <LockIcon size={14} color="rgba(255,255,255,0.4)" />
                ) : null}
              </TouchableOpacity>
              {expanded === net.ssid ? (
                <View style={styles.passRow}>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Contraseña"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    secureTextEntry={!showPassword}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => password.length >= 5 && connect(net, password)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.showBtn}>
                    <Text style={styles.showText}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.connectBtn, password.length < 5 && { opacity: 0.4 }]}
                    disabled={password.length < 5 || connecting === net.ssid}
                    onPress={() => connect(net, password)}
                  >
                    <Text style={styles.connectText}>Conectar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.15)', padding: 3 },
  switchOn: { backgroundColor: COLORS.gold },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.text },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: COLORS.background },
  empty: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', paddingVertical: 28 },
  list: { maxHeight: 460 },
  row: {
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowConnected: { borderColor: 'rgba(226,184,78,0.45)', backgroundColor: 'rgba(226,184,78,0.08)' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  rowText: { flex: 1 },
  ssid: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  sub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  showBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  showText: { color: COLORS.accent, fontSize: 12 },
  connectBtn: { backgroundColor: COLORS.gold, borderRadius: 10, paddingHorizontal: 14, height: 40, justifyContent: 'center' },
  connectText: { color: COLORS.background, fontWeight: '700', fontSize: 13 },
});
