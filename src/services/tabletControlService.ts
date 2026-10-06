/**
 * Bridge to TabletControlModule (InkTrick OS: the app is the tablet's device owner / home).
 * Every call degrades gracefully when the native module is missing.
 */
import { NativeEventEmitter, NativeModules } from 'react-native';

const { TabletControlModule: Native } = NativeModules;
const emitter = Native ? new NativeEventEmitter(Native) : null;

export interface DeviceStatus {
  batteryLevel: number; // -1 when unknown
  isCharging: boolean;
  isWifiEnabled: boolean;
  isWifiConnected: boolean;
  wifiSsid: string | null;
  isUsbConnected: boolean;
  isMtpActive: boolean;
}

export interface KioskInfo {
  isDeviceOwner: boolean;
  canWriteSettings: boolean;
}

export type WifiSecurity = 'open' | 'wep' | 'wpa' | 'sae' | 'eap';

export interface WifiNetwork {
  ssid: string;
  signal: number; // 0..3
  security: WifiSecurity;
  saved: boolean;
  connected: boolean;
}

export const EMPTY_STATUS: DeviceStatus = {
  batteryLevel: -1,
  isCharging: false,
  isWifiEnabled: false,
  isWifiConnected: false,
  wifiSsid: null,
  isUsbConnected: false,
  isMtpActive: false,
};

async function call<T>(method: string, fallback: T, ...args: unknown[]): Promise<T> {
  if (!Native?.[method]) return fallback;
  try {
    return await Native[method](...args);
  } catch {
    return fallback;
  }
}

export const getKioskInfo = () => call<KioskInfo>('getKioskInfo', { isDeviceOwner: false, canWriteSettings: false });
export const getDeviceStatus = () => call<DeviceStatus>('getDeviceStatus', EMPTY_STATUS);

/** `level` is the slider position 0..1 (mapped natively to a gamma curve). */
export const setHardwareBrightness = (level: number) => call<number>('setBrightness', level, level);
export const getHardwareBrightness = () => call<number>('getBrightness', 0.5);
export const getScreenTimeout = () => call<number>('getScreenTimeout', 120000);
export const setScreenTimeout = (ms: number) => call<boolean>('setScreenTimeout', false, ms);
export const setOrientation = (orientation: 'portrait' | 'auto') => call<string>('setOrientation', orientation, orientation);

export const setWifiEnabled = (enabled: boolean) => call<boolean>('setWifiEnabled', false, enabled);
export const startWifiScan = () => call<boolean>('startWifiScan', false);
export const getWifiNetworks = () => call<WifiNetwork[]>('getWifiNetworks', []);
/** `password` null reuses a saved network. The outcome arrives through the status events. */
export const connectWifi = (ssid: string, password: string | null, security: WifiSecurity) =>
  call<boolean>('connectWifi', false, ssid, password, security);
export const forgetWifi = (ssid: string) => call<boolean>('forgetWifi', false, ssid);

export const getGoogleAccounts = () => call<string[]>('getGoogleAccounts', []);
export const addGoogleAccount = () => call<boolean>('addGoogleAccount', false);
/** Android's account picker; returns the chosen email or null. */
export const chooseGoogleAccount = () => call<string | null>('chooseGoogleAccount', null);

export type GoogleProfileResult = { name: string | null; photoUri: string | null } | { error: string };

/** Name and photo of the Google account (Google's "Allow" screen appears the first time). */
export async function fetchGoogleProfile(email: string): Promise<GoogleProfileResult> {
  if (!Native?.fetchGoogleProfile) return { error: 'UNAVAILABLE' };
  try {
    return await Native.fetchGoogleProfile(email);
  } catch (e: any) {
    return { error: e?.code ?? 'ERROR' };
  }
}
export const openGoogleDrive = () => call<boolean>('openGoogleDrive', false);
export const openAndroidSettings = () => call<boolean>('openAndroidSettings', false);
/** Turns InkTrick OS off and gives up the device owner (the app can then be uninstalled). */
export const releaseKiosk = () => call<boolean>('releaseKiosk', false);
export const isPlayStoreHidden = () => call<boolean>('isPlayStoreHidden', false);
export const setPlayStoreHidden = (hidden: boolean) => call<boolean>('setPlayStoreHidden', false, hidden);

export function setSleepMode(mode: 'art' | 'book') {
  Native?.setSleepMode?.(mode);
}

/** Tells the sleep screen which book is open in the reader (cover, title, progress). */
export function setSleepBook(bookId: string, coverUri: string | undefined, title: string, percentage: number) {
  Native?.setSleepBook?.(bookId, coverUri ?? null, title, percentage);
}

/** The reader closed: the sleep screen shows the art again (ignored if another book took over). */
export function clearSleepBook(bookId: string) {
  Native?.clearSleepBook?.(bookId);
}
/** Returns a file:// uri of a small square JPEG, or null if cancelled. */
export const pickProfilePhoto = () => call<string | null>('pickProfilePhoto', null);

type DeviceEvent = 'onDeviceStatusChanged' | 'onWifiScan' | 'onWifiAuthError' | 'onImportRequest';

/** Native receivers only run while there is at least one subscriber. */
export function subscribe(event: DeviceEvent, callback: () => void): () => void {
  if (!emitter) return () => {};
  const sub = emitter.addListener(event, callback);
  return () => sub.remove();
}
