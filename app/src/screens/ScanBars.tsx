import { Pressable, StyleSheet, Text, View } from 'react-native';
import { priceLabel } from '../alert/alert';
import { isStale } from '../data/policy';
import { formatPriceDate } from './resultView';
import type { Theme } from './theme';
import { Icon } from './VersionRow';

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
});
