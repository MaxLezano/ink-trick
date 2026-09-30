/**
 * InkTrick - Reader index dialog
 * Two tabs: the book's chapters (PDF outline, EPUB table of contents, CBZ chapter folders) and the
 * user's bookmarks. Books without a table of contents only show the bookmarks (no tabs).
 * Tapping an entry jumps there; bookmarks can be removed from the list.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bookmark, TocItem } from '../../utils/types';
import { COLORS } from '../../utils/constants';
import { formatRelativeDate } from '../../utils/format';
import { BookmarkIcon, CloseIcon } from '../Icons';

interface Props {
  visible: boolean;
  toc: TocItem[];
  bookmarks: Bookmark[];
  current: number;
  /** Human label of a logical page ("Página 12", "34%"). */
  labelFor: (page: number) => string;
  onSelectToc: (item: TocItem) => void;
  onSelectPage: (page: number) => void;
  onRemoveBookmark: (page: number) => void;
  onClose: () => void;
}

type Tab = 'toc' | 'marks';
const ROW_HEIGHT = 52;

export default function ReaderIndexSheet({
  visible,
  toc,
  bookmarks,
  current,
  labelFor,
  onSelectToc,
  onSelectPage,
  onRemoveBookmark,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('toc');
  const hasToc = toc.length > 0;
  const listRef = useRef<FlatList<TocItem>>(null);

  // Chapter being read: the last entry that starts at or before the current page.
  const activeIndex = useMemo(() => {
    let found = -1;
    toc.forEach((item, i) => {
      if (item.page <= current) found = i;
    });
    return found;
  }, [current, toc]);

  useEffect(() => {
    if (visible) setTab(hasToc ? 'toc' : 'marks');
  }, [hasToc, visible]);

  const sortedMarks = useMemo(() => [...bookmarks].sort((a, b) => a.page - b.page), [bookmarks]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.wrapper} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{hasToc ? 'Índice' : 'Marcadores'}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Cerrar">
              <CloseIcon size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {hasToc ? (
            <View style={styles.tabs}>
              {([
                { id: 'toc', label: 'Capítulos' },
                { id: 'marks', label: `Marcadores${bookmarks.length ? ` · ${bookmarks.length}` : ''}` },
              ] as { id: Tab; label: string }[]).map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tab, tab === t.id && styles.tabActive]}
                  onPress={() => setTab(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.id }}
                >
                  <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.spacer} />
          )}

          {tab === 'toc' && hasToc ? (
            <FlatList
              ref={listRef}
              data={toc}
              keyExtractor={(item, i) => `${i}-${item.page}`}
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
              initialScrollIndex={Math.max(0, activeIndex - 2)}
              style={styles.list}
              renderItem={({ item, index }) => {
                const active = index === activeIndex;
                return (
                  <TouchableOpacity
                    style={[styles.row, { paddingLeft: 12 + Math.min(item.depth, 4) * 18 }, active && styles.rowActive]}
                    onPress={() => onSelectToc(item)}
                  >
                    <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta}>{labelFor(item.page)}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          ) : sortedMarks.length === 0 ? (
            <View style={styles.emptyBox}>
              <BookmarkIcon size={26} color="rgba(255,255,255,0.35)" />
              <Text style={styles.empty}>Aún no tienes marcadores. Toca el marcador de la barra superior para guardar la página actual.</Text>
            </View>
          ) : (
            <FlatList
              data={sortedMarks}
              keyExtractor={item => `${item.page}`}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={[styles.row, item.page === current && styles.rowActive]}>
                  <TouchableOpacity style={styles.markMain} onPress={() => onSelectPage(item.page)}>
                    <BookmarkIcon size={16} color={COLORS.gold} filled />
                    <Text style={styles.rowTitle}>{labelFor(item.page)}</Text>
                    <Text style={styles.rowMeta}>{formatRelativeDate(item.createdAt)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onRemoveBookmark(item.page)}
                    accessibilityLabel="Quitar marcador"
                  >
                    <CloseIcon size={14} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    maxHeight: '86%',
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#161616',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 3,
    marginTop: 14,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#0A0A0A',
  },
  list: {
    flexGrow: 0,
  },
  spacer: {
    height: 10,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowActive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  rowTitle: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  rowTitleActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  rowMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  markMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: '100%',
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  empty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});
