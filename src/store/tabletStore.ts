/**
 * InkTrick OS state: device controls and the reader's profile (avatar / photo, name).
 */
import { create } from 'zustand';
import { getTabletSettings, saveTabletSettings, TabletSettings } from '../services/storageService';
import {
  getGoogleAccounts,
  getHardwareBrightness,
  getKioskInfo,
  setHardwareBrightness,
  setSleepMode,
  fetchGoogleProfile,
} from '../services/tabletControlService';
import { DEFAULT_AVATAR, findAvatar } from '../utils/avatars';

interface TabletState {
  isLoaded: boolean;
  isDeviceOwner: boolean;
  warmth: number; // "Tono cálido": amber overlay opacity 0..0.3, whole tablet
  autoRotateInReader: boolean;
  brightness: number; // Slider position 0..1
  avatarId: string; // avatar id or 'photo'
  photoUri: string | null;
  profileName: string;
  googleAccount: string | null;
  sleepMode: 'art' | 'book';
  googlePhotoUri: string | null;
  googleName: string | null;
  loadSettings: () => Promise<void>;
  setWarmth: (warmth: number) => void;
  toggleAutoRotateInReader: () => void;
  /** Live while dragging; `commit` persists it (on release). */
  setBrightness: (level: number, commit?: boolean) => void;
  setAvatar: (id: string, photoUri?: string) => void;
  setProfileName: (name: string) => void;
  refreshGoogleAccount: () => Promise<void>;
  setSleepMode: (mode: 'art' | 'book') => void;
  /**
   * Reads the Google account's name and photo. `interactive` comes from a tap (shows errors and
   * asks again after a cancelled consent); at launch it runs silently.
   */
  syncGoogleProfile: (interactive?: boolean) => Promise<'ok' | 'none' | 'cancelled' | 'error'>;
}

/** "Tono cálido" levels, shared by quick settings and the reader settings. */
export const WARMTH_LEVELS = [0, 0.1, 0.2, 0.3].map(v => ({ label: v ? `${Math.round(v * 100)}%` : 'No', value: v }));

/** Amber (kin-iro family): cuts blue light without a red cast. */
export const WARM_TINT = 'rgb(255, 170, 60)';

const save = (settings: Partial<TabletSettings>) => saveTabletSettings(settings).catch(() => {});

export const useTabletStore = create<TabletState>((set, get) => ({
  isLoaded: false,
  isDeviceOwner: false,
  warmth: 0,
  autoRotateInReader: false,
  brightness: 0.6,
  avatarId: DEFAULT_AVATAR.id,
  photoUri: null,
  profileName: '',
  googleAccount: null,
  sleepMode: 'book',
  googlePhotoUri: null,
  googleName: null,

  loadSettings: async () => {
    const [settings, kiosk] = await Promise.all([getTabletSettings().catch(() => null), getKioskInfo()]);
    // Settings of the first builds of this branch used other keys.
    const legacy = (settings ?? {}) as { selectedAvatarId?: string; customProfileName?: string };
    const avatarId = settings?.avatarId ?? (findAvatar(legacy.selectedAvatarId)?.id || DEFAULT_AVATAR.id);
    const brightness = typeof settings?.brightness === 'number' ? settings.brightness : await getHardwareBrightness();
    set({
      isLoaded: true,
      isDeviceOwner: kiosk.isDeviceOwner,
      warmth: settings?.warmth ?? (settings?.eyeComfort ? 0.2 : 0),
      autoRotateInReader: settings?.autoRotateInReader ?? false,
      brightness,
      avatarId:
        (avatarId === 'photo' && !settings?.photoUri) || (avatarId === 'google' && !settings?.googlePhotoUri)
          ? DEFAULT_AVATAR.id
          : avatarId,
      photoUri: settings?.photoUri ?? null,
      profileName: settings?.profileName ?? (legacy.customProfileName && legacy.customProfileName !== 'Invitado' ? legacy.customProfileName : ''),
      sleepMode: settings?.sleepMode ?? 'book',
      googlePhotoUri: settings?.googlePhotoUri ?? null,
      googleName: settings?.googleName ?? null,
    });
    setSleepMode(settings?.sleepMode ?? 'book');
    await get().refreshGoogleAccount();
    if (!settings?.googleDeclined) get().syncGoogleProfile();
  },

  setWarmth: warmth => {
    set({ warmth });
    save({ warmth, eyeComfort: undefined });
  },

  toggleAutoRotateInReader: () => {
    const autoRotateInReader = !get().autoRotateInReader;
    set({ autoRotateInReader });
    save({ autoRotateInReader });
  },

  setBrightness: (level, commit = true) => {
    const brightness = Math.max(0, Math.min(1, Math.round(level * 100) / 100));
    if (brightness !== get().brightness) {
      set({ brightness });
      setHardwareBrightness(brightness);
    }
    if (commit) save({ brightness });
  },

  setAvatar: (avatarId, photoUri) => {
    const next = photoUri ? { avatarId, photoUri } : { avatarId };
    set(next);
    save(next);
  },

  setProfileName: name => {
    const profileName = name.trim().slice(0, 32);
    set({ profileName });
    save({ profileName });
  },

  refreshGoogleAccount: async () => {
    const accounts = await getGoogleAccounts();
    set({ googleAccount: accounts[0] ?? null });
  },

  syncGoogleProfile: async (interactive = false) => {
    const email = get().googleAccount;
    if (!email) return 'none';
    const result = await fetchGoogleProfile(email);
    if ('error' in result) {
      if (result.error === 'CANCELLED') {
        save({ googleDeclined: true });
        return 'cancelled';
      }
      return 'error';
    }
    const first = !get().googlePhotoUri;
    const next: Partial<TabletState> = { googleName: result.name, googlePhotoUri: result.photoUri ?? get().googlePhotoUri };
    // The Google photo becomes the avatar the first time it arrives; later choices are kept.
    if (first && result.photoUri) next.avatarId = 'google';
    if (!get().profileName && result.name) next.profileName = result.name;
    set(next);
    save({
      googleName: next.googleName ?? undefined,
      googlePhotoUri: next.googlePhotoUri ?? undefined,
      googleDeclined: false,
      ...(next.avatarId ? { avatarId: next.avatarId } : {}),
      ...(next.profileName ? { profileName: next.profileName } : {}),
    });
    return 'ok';
  },

  setSleepMode: sleepMode => {
    set({ sleepMode });
    setSleepMode(sleepMode);
    save({ sleepMode });
  },
}));
