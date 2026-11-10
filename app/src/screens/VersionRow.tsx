import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RowView } from './resultView';
import { SetIcon } from './SetIcon';
import type { Theme } from './theme';

export type IconName = 'down' | 'up' | 'check' | 'search' | 'gear';

const GEAR = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 '
  + '1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1'
  + '-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 '
  + '1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 '
  + '4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 '
  + '1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

const SHAPES: Record<IconName, ReactNode> = {
  down: <Path d="M6 9l6 6 6-6" />,
  up: <Path d="M18 15l-6-6-6 6" />,
  check: <Path d="M5 12l5 5 9-10" />,
  search: <><Circle cx="11" cy="11" r="7" /><Path d="M20 20l-4-4" /></>,
  gear: <><Circle cx="12" cy="12" r="3" /><Path d={GEAR} /></>,
};

/** The scan screen's line icons (the mockup's chevrons, check, search and gear). */
export function Icon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[name]}
    </Svg>
  );
}

interface Props {
  row: RowView;
  /** The set symbol's SVG text, or null. */
  icon: string | null;
  theme: Theme;
  open: boolean;
  onToggle(): void;
  /** Shorthand off: the look-for text shows in the closed row too. */
  shorthand: boolean;
  /** A known card's "Still alert for this version" switch; null when the card isn't known. */
  kept: { value: boolean; onChange(kept: boolean): void } | null;
}

/**
 * One version of a card. Tapping it opens its look-for text, notes and look-alikes (and, for a known
 * card, the "Still alert for this version" switch). The open row's background is `rowOpen`, so the text
 * in it is only `text` and `muted` (accent and quiet text fall under 4.5:1 there in the light theme).
 */
export function VersionRow({ row, icon, theme, open, onToggle, shorthand, kept }: Props) {
  const priced = row.price !== 'unpriced';
  const name = row.numberTag ? `${row.setName} ${row.numberTag}` : row.setName;
  const a11y = [name, row.finishTag, row.price, row.thisVersion ? 'This version' : null].filter(Boolean).join(', ');
  return (
    <View style={[styles.item, { borderColor: theme.divider }, open && { backgroundColor: theme.rowOpen }, open && styles.itemOpen]}>
      <Pressable onPress={onToggle} style={styles.row} accessibilityRole="button" accessibilityLabel={a11y}
        accessibilityState={{ expanded: open }}>
        {row.noSymbol ? (
          <View style={[styles.badge, { borderColor: theme.border }]}>
            <Text style={[styles.badgeText, { color: theme.muted }]}>no set symbol</Text>
          </View>
        ) : icon !== null ? (
          <SetIcon svg={icon} size={20} color={theme.text} />
        ) : (
          <View style={styles.iconSpace} />
        )}
        <View style={styles.main}>
          <View style={styles.nameLine}>
            <Text style={[styles.setName, { color: theme.text }]}>
              {row.setName}
              {row.numberTag && <Text style={[styles.number, { color: theme.muted }]}> {row.numberTag}</Text>}
            </Text>
            {row.finishTag && (
              <View style={[styles.badge, { borderColor: theme.border }]}>
                <Text style={[styles.badgeText, { color: theme.muted }]}>{row.finishTag}</Text>
              </View>
            )}
            {row.thisVersion && (
              <View style={[styles.badge, { borderColor: theme.text }]}>
                <Text style={[styles.badgeText, styles.thisVersion, { color: theme.text }]}>This version</Text>
              </View>
            )}
          </View>
          {!shorthand && row.lookFor !== '' && (
            <Text style={[styles.inlineLookFor, { color: theme.muted }]}>{row.lookFor}</Text>
          )}
        </View>
        <Text style={priced ? [styles.price, { color: theme.text }] : [styles.unpriced, { color: theme.muted }]}>
          {row.price}
        </Text>
        <Icon name={open ? 'up' : 'down'} size={16} color={theme.muted} />
      </Pressable>
      {open && (
        <View style={styles.detail}>
          {shorthand && row.lookFor !== '' && (
            <View style={styles.lookFor}>
              <Text style={[styles.lookForLabel, { color: theme.muted }]}>Look for</Text>
              <Text style={[styles.lookForText, { color: theme.text }]}>{row.lookFor}</Text>
            </View>
          )}
          {row.notes.map((n, i) => (
            <Text key={i} style={[styles.note, { color: theme.muted }]}>{n}</Text>
          ))}
          {row.sameAs !== null && (
            <Text style={[styles.sameAs, {
              color: theme.lookAlikeText, backgroundColor: theme.lookAlikeBg, borderColor: theme.lookAlikeBorder,
            }]}>
              {row.sameAs}
            </Text>
          )}
          {kept !== null && (
            <View style={styles.keptRow}>
              <Text style={[styles.keptText, { color: theme.text }]}>Still alert for this version</Text>
              <Switch value={kept.value} onValueChange={kept.onChange} accessibilityLabel="Still alert for this version" />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { borderBottomWidth: 1 },
  itemOpen: { marginHorizontal: -14, paddingHorizontal: 14, paddingBottom: 12 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingVertical: 6 },
  iconSpace: { width: 20, height: 20 },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 10.5 },
  thisVersion: { fontWeight: '700' },
  main: { flex: 1, gap: 2 },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  setName: { fontSize: 15, fontWeight: '500' },
  number: { fontSize: 13, fontWeight: '400' },
  inlineLookFor: { fontSize: 13, lineHeight: 18 },
  price: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unpriced: { fontSize: 13 },
  detail: { gap: 8, paddingHorizontal: 2 },
  lookFor: { gap: 3 },
  lookForLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, textTransform: 'uppercase' },
  lookForText: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 18 },
  sameAs: {
    fontSize: 13, lineHeight: 18, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    overflow: 'hidden',
  },
  keptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  keptText: { fontSize: 14, flex: 1 },
});
