/**
 * InkTrick - Book card
 * Memoized cover card used by carousels and grids. Re-renders only when its own data changes.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BookFile } from '../../utils/types';
import { COLORS } from '../../utils/constants';
import { StarIcon } from '../Icons';

interface Props {
  book: BookFile;
  title: string;
  width: number;
  percentage: number;
  selectionMode: boolean;
  selected: boolean;
  onPress: (book: BookFile) => void;
  onLongPress: (book: BookFile) => void;
}

function BookCard({ book, title, width, percentage, selectionMode, selected, onPress, onLongPress }: Props) {
  const formatLabel = book.format.replace('.', '').toUpperCase();

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          width,
          borderColor: selected ? COLORS.accent : COLORS.border,
          borderWidth: selected ? 2 : 1,
          opacity: selectionMode && !selected ? 0.55 : 1,
        },
      ]}
      onPress={() => onPress(book)}
      onLongPress={() => onLongPress(book)}
      delayLongPress={350}
      activeOpacity={0.75}
      accessibilityLabel={`${book.title}${percentage > 0 ? `, ${percentage}% leído` : ''}`}
    >
      <View style={styles.cover}>
        {book.coverUri ? (
          <Image cachePolicy="memory"
            source={{ uri: book.coverUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            recyclingKey={book.id}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{formatLabel}</Text>
          </View>
        )}

        {percentage >= 100 ? (
          // Hanko-style seal in the logo's gold.
          <View style={styles.readSeal} accessibilityLabel="Leído">
            <Text style={styles.readSealText}>LEÍDO</Text>
          </View>
        ) : percentage > 0 ? (
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.progressOverlay}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percentage}%` }]} />
            </View>
            <Text style={styles.progressText}>{percentage}%</Text>
          </LinearGradient>
        ) : null}

        {book.isFavorite && !selectionMode && (
          <View style={styles.favorite}>
            <StarIcon size={16} color={COLORS.wisteria} filled />
          </View>
        )}

        {selectionMode && (
          <View style={[styles.checkbox, { backgroundColor: selected ? '#FFFFFF' : 'rgba(0,0,0,0.5)' }]}>
            {selected && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default memo(BookCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    elevation: 3,
  },
  cover: {
    width: '100%',
    aspectRatio: 0.7,
    backgroundColor: '#1A1A1A',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  progressOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 18,
    paddingBottom: 7,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
  },
  progressText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
  readSeal: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(36,16,64,0.55)',
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  readSealText: {
    color: COLORS.inkViolet,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  favorite: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  checkbox: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMark: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '900',
  },
  info: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 50,
  },
  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
});
