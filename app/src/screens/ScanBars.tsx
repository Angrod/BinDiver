import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { priceLabel } from '../alert/alert';
import { isStale } from '../data/policy';
import type { SortOrder } from '../game/types';
import type { AppDataValue } from '../state/AppData';
import type { AppSettings } from '../user/settings';
import { formatPriceDate } from './resultView';
import type { Theme } from './theme';
import { Icon } from './VersionRow';

const SORTS: ReadonlyArray<[SortOrder, string]> = [
  ['oldest', 'Oldest first'], ['newest', 'Newest first'], ['price', 'Highest price'],
];

interface TopProps {
  theme: Theme;
  priceDate: string | null;
  minCents: number;
  /** The price chip: opens the price sheet. */
  onOpenPrice?: () => void;
  /** The gear: opens Settings. */
  onOpenSettings?: () => void;
}

/** The scan screen's top strip: "Prices as of …" (amber when stale), the price chip and the gear. */
export function TopStrip({ theme, priceDate, minCents, onOpenPrice, onOpenSettings }: TopProps) {
  const today = new Date();
  const stale = priceDate !== null && isStale(priceDate, today);
  const price = priceLabel(minCents);
  return (
    <View style={styles.top}>
      <Text style={[styles.prices, { color: stale ? theme.quiet : theme.muted }, stale && styles.stale]}>
        Prices as of {priceDate !== null ? formatPriceDate(priceDate, today) : 'unknown'}
      </Text>
      <View style={styles.topButtons}>
        <Pressable
          style={[styles.priceChip, { backgroundColor: theme.panel, borderColor: theme.border }]}
          onPress={onOpenPrice}
          accessibilityRole="button"
          accessibilityLabel={`Alert price: ${price.slice(0, -1)} and up. Change`}
        >
          <Text style={[styles.priceText, { color: theme.text }]}>{price}</Text>
          <Icon name="down" size={14} color={theme.text} />
        </Pressable>
        <Pressable style={styles.gear} onPress={onOpenSettings} accessibilityRole="button" accessibilityLabel="Settings">
          <Icon name="gear" size={22} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

interface BottomProps {
  theme: Theme;
  settings: Pick<AppSettings, 'shorthand' | 'sort'>;
  setSetting: AppDataValue['setSetting'];
  onSearch(): void;
  searchDisabled: boolean;
}

/**
 * The scan screen's bottom bar: the Shorthand toggle, the sort menu and Search. Shorthand and sort are
 * remembered through `setSetting`; changing them only redraws the result.
 */
export function BottomBar({ theme, settings, setSetting, onSearch, searchDisabled }: BottomProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = SORTS.find(([o]) => o === settings.sort)?.[1] ?? SORTS[0][1];
  const barButton = [styles.barButton, { backgroundColor: theme.panel, borderColor: theme.border }];
  const barText = [styles.barText, { color: theme.text }];
  return (
    <>
      <View style={styles.bar}>
        <Pressable
          style={barButton}
          onPress={() => setSetting('shorthand', !settings.shorthand)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.shorthand }}
        >
          <View style={[styles.dot, settings.shorthand
            ? { backgroundColor: theme.accent, borderColor: theme.accent }
            : { borderColor: theme.muted }]} />
          <Text style={barText}>Shorthand</Text>
        </Pressable>
        <Pressable
          style={barButton}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort versions: ${sortLabel.toLowerCase()}`}
        >
          <Text style={barText}>{sortLabel}</Text>
          <Icon name="down" size={14} color={theme.text} />
        </Pressable>
        <Pressable
          style={[barButton, searchDisabled && styles.disabled]}
          onPress={onSearch}
          disabled={searchDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: searchDisabled }}
        >
          <Icon name="search" size={16} color={theme.text} />
          <Text style={barText}>Search</Text>
        </Pressable>
      </View>

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <View style={styles.menuWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSortOpen(false)} accessibilityRole="button"
            accessibilityLabel="Close the sort menu" />
          <View style={[styles.menu, { backgroundColor: theme.panel, borderColor: theme.border }]} accessibilityRole="menu">
            {SORTS.map(([order, label]) => {
              const on = order === settings.sort;
              return (
                <Pressable
                  key={order}
                  style={[styles.menuRow, { borderColor: theme.divider }]}
                  onPress={() => {
                    setSetting('sort', order);
                    setSortOpen(false);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.menuText, { color: theme.text }, on && styles.menuOn]}>{label}</Text>
                  {on && <Icon name="check" size={16} color={theme.text} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    minHeight: 60, paddingHorizontal: 16, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  prices: { fontSize: 13, flexShrink: 1 },
  stale: { fontWeight: '600' },
  topButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceChip: {
    height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  priceText: { fontSize: 15, fontWeight: '600' },
  gear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: 10, paddingTop: 12, paddingBottom: 18, flexDirection: 'row', gap: 8 },
  barButton: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  barText: { fontSize: 14, fontWeight: '500' },
  disabled: { opacity: 0.5 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  menuWrap: { flex: 1, justifyContent: 'flex-end', padding: 10, paddingBottom: 96, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    minHeight: 50, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  menuText: { fontSize: 16 },
  menuOn: { fontWeight: '700' },
});
