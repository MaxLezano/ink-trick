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
} from '../services/tabletControlService';
import { DEFAULT_AVATAR, findAvatar } from '../utils/avatars';

interface TabletState {
  isLoaded: boolean;
  isDeviceOwner: boolean;
  eyeComfort: boolean;
  autoRotateInReader: boolean;
  brightness: number; // Slider position 0..1
  avatarId: string; // avatar id or 'photo'
  photoUri: string | null;
  profileName: string;
  googleAccount: string | null;
  loadSettings: () => Promise<void>;
  toggleEyeComfort: () => void;
  toggleAutoRotateInReader: () => void;
  /** Live while dragging; `commit` persists it (on release). */
  setBrightness: (level: number, commit?: boolean) => void;
  setAvatar: (id: string, photoUri?: string) => void;
  setProfileName: (name: string) => void;
  refreshGoogleAccount: () => Promise<void>;
}

const save = (settings: Partial<TabletSettings>) => saveTabletSettings(settings).catch(() => {});

export const useTabletStore = create<TabletState>((set, get) => ({
  isLoaded: false,
  isDeviceOwner: false,
  eyeComfort: false,
  autoRotateInReader: false,
  brightness: 0.6,
  avatarId: DEFAULT_AVATAR.id,
  photoUri: null,
  profileName: '',
  googleAccount: null,

  loadSettings: async () => {
    const [settings, kiosk] = await Promise.all([getTabletSettings().catch(() => null), getKioskInfo()]);
    // Settings of the first builds of this branch used other keys.
    const legacy = (settings ?? {}) as { selectedAvatarId?: string; customProfileName?: string };
    const avatarId = settings?.avatarId ?? (findAvatar(legacy.selectedAvatarId)?.id || DEFAULT_AVATAR.id);
    const brightness = typeof settings?.brightness === 'number' ? settings.brightness : await getHardwareBrightness();
    set({
      isLoaded: true,
      isDeviceOwner: kiosk.isDeviceOwner,
      eyeComfort: settings?.eyeComfort ?? false,
      autoRotateInReader: settings?.autoRotateInReader ?? false,
      brightness,
      avatarId: avatarId === 'photo' && !settings?.photoUri ? DEFAULT_AVATAR.id : avatarId,
      photoUri: settings?.photoUri ?? null,
      profileName: settings?.profileName ?? (legacy.customProfileName && legacy.customProfileName !== 'Invitado' ? legacy.customProfileName : ''),
    });
    get().refreshGoogleAccount();
  },

  toggleEyeComfort: () => {
    const eyeComfort = !get().eyeComfort;
    set({ eyeComfort });
    save({ eyeComfort });
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
}));
