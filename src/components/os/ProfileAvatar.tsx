/**
 * The reader's avatar: an ink portrait from src/utils/avatars.ts, their own photo or their Google photo.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTabletStore } from '../../store/tabletStore';
import { DEFAULT_AVATAR, findAvatar } from '../../utils/avatars';
import { COLORS } from '../../utils/constants';

export default function ProfileAvatar({ size, ring = true }: { size: number; ring?: boolean }) {
  const avatarId = useTabletStore(s => s.avatarId);
  const photoUri = useTabletStore(s => s.photoUri);
  const googlePhotoUri = useTabletStore(s => s.googlePhotoUri);
  const source =
    avatarId === 'photo' && photoUri
      ? { uri: photoUri }
      : avatarId === 'google' && googlePhotoUri
        ? { uri: googlePhotoUri }
        : (findAvatar(avatarId) ?? DEFAULT_AVATAR).source;
  return (
    <Image
      source={source}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        ring && { borderWidth: Math.max(1.5, size / 24), borderColor: COLORS.gold },
        styles.base,
      ]}
      contentFit="cover"
      cachePolicy="memory"
      transition={120}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: COLORS.surface },
});
