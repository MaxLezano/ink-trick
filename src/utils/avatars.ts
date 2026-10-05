/**
 * Reader avatars for InkTrick OS (people, animals and yōkai): sumi-e ink portraits with gold leaf (generated with the local
 * ComfyUI, DreamShaper XL Turbo), 384 px WebP.
 */
export interface Avatar {
  id: string;
  name: string;
  source: number;
}

export const AVATARS: Avatar[] = [
  { id: 'avatar_01', name: 'Akane', source: require('../../assets/avatars/avatar_01.webp') },
  { id: 'avatar_02', name: 'Ren', source: require('../../assets/avatars/avatar_02.webp') },
  { id: 'avatar_03', name: 'Yuki', source: require('../../assets/avatars/avatar_03.webp') },
  { id: 'avatar_04', name: 'Sensei', source: require('../../assets/avatars/avatar_04.webp') },
  { id: 'avatar_05', name: 'Haru', source: require('../../assets/avatars/avatar_05.webp') },
  { id: 'avatar_06', name: 'Hana', source: require('../../assets/avatars/avatar_06.webp') },
  { id: 'avatar_07', name: 'Kaito', source: require('../../assets/avatars/avatar_07.webp') },
  { id: 'avatar_08', name: 'Mei', source: require('../../assets/avatars/avatar_08.webp') },
  { id: 'avatar_09', name: 'Sora', source: require('../../assets/avatars/avatar_09.webp') },
  { id: 'avatar_10', name: 'Rin', source: require('../../assets/avatars/avatar_10.webp') },
  { id: 'avatar_11', name: 'Taro', source: require('../../assets/avatars/avatar_11.webp') },
  { id: 'avatar_12', name: 'Aiko', source: require('../../assets/avatars/avatar_12.webp') },
  { id: 'avatar_13', name: 'Kuro', source: require('../../assets/avatars/avatar_13.webp') },
  { id: 'avatar_14', name: 'Kitsune', source: require('../../assets/avatars/avatar_14.webp') },
  { id: 'avatar_15', name: 'Tanuki', source: require('../../assets/avatars/avatar_15.webp') },
  { id: 'avatar_16', name: 'Rōnin', source: require('../../assets/avatars/avatar_16.webp') },
  { id: 'avatar_17', name: 'Kappa', source: require('../../assets/avatars/avatar_17.webp') },
  { id: 'avatar_18', name: 'Tengu', source: require('../../assets/avatars/avatar_18.webp') },
  { id: 'avatar_19', name: 'Maneki', source: require('../../assets/avatars/avatar_19.webp') },
  { id: 'avatar_20', name: 'Ryū', source: require('../../assets/avatars/avatar_20.webp') },
  { id: 'avatar_21', name: 'Usagi', source: require('../../assets/avatars/avatar_21.webp') },
  { id: 'avatar_22', name: 'Sayuri', source: require('../../assets/avatars/avatar_22.webp') },
  { id: 'avatar_23', name: 'Kage', source: require('../../assets/avatars/avatar_23.webp') },
  { id: 'avatar_24', name: 'Jun', source: require('../../assets/avatars/avatar_24.webp') },
  { id: 'avatar_25', name: 'Nami', source: require('../../assets/avatars/avatar_25.webp') },
  { id: 'avatar_26', name: 'Gorō', source: require('../../assets/avatars/avatar_26.webp') },
];

export const DEFAULT_AVATAR = AVATARS[12]; // Kuro, the black cat

export const findAvatar = (id: string | undefined) => AVATARS.find(a => a.id === id);
