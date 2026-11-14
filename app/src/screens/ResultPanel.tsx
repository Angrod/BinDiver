import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { AlertKind } from '../alert/alert';
import type { CardGroup, Game } from '../game/types';
import { missingVersion, resultModel, type ResultModel, type Shown } from '../scan/result';
import { useAppData } from '../state/AppData';
import { showsReadAs } from './format';
import {
  countLine, missingVersionLine, nothingLines, readAsLine, rowViews, stickyLine, type RowView,
} from './resultView';
import { useTheme, type Theme } from './theme';
import { Icon, VersionRow } from './VersionRow';

interface Props {
  /** The last card read or picked; null before the first. */
  shown: Shown | null;
}

/** Each set symbol's SVG text, read from the card data once per set while this game is open. */
function iconCache(game: Game | null): (code: string | null) => string | null {
  const cache = new Map<string, string | null>();
  return (code) => {
    if (game === null || code === null) return null;
    if (!cache.has(code)) {
      let svg: string | null = null;
      try {
        svg = game.setIcon(code);
      } catch (e) {
        console.warn('set icon failed', e);
      }
      cache.set(code, svg);
    }
    return cache.get(code) ?? null;
  };
}

/**
 * The full list (in the sheet the result card opens): the shown card at the current price, sort and known marks.
 *
 * This component only draws. It recomputes the result in a useMemo whenever the price, the sort or a
 * known mark changes, and it never records a scan or signals an alert: only the scan screen's commit
 * handler and search pick do that, once per newly read or picked card.
 */
export const ResultPanel = memo(function ResultPanel({ shown }: Props) {
  const { game, settings, marks, markKnown, unmarkKnown, setKept } = useAppData();
  const theme = useTheme();
  const { minCents, sort, shorthand } = settings;
  const model = useMemo((): ResultModel | null => {
    if (game === null || shown === null) return null;
    try {
      return resultModel(game, shown, minCents, sort, marks);
    } catch (e) {
      console.warn('lookup failed', e);
      return null;
    }
  }, [game, shown, minCents, sort, marks]);
  const iconFor = useMemo(() => iconCache(game), [game]);

  // Open rows (by version key) and open unpriced folds (by oracle ID). The scan screen remounts the
  // panel for each new card, so these start closed.
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(() => new Set());
  const [openFolds, setOpenFolds] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (set: (f: (s: ReadonlySet<string>) => ReadonlySet<string>) => void, key: string) =>
    set((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // The sticky line: each group header's place in the scroll content, and the group whose header
  // has scrolled away (the last group starting above the top edge), if any.
  const headers = useRef<Array<{ top: number; bottom: number }>>([]);
  const [sticky, setSticky] = useState<number | null>(null);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    let current = -1;
    headers.current.forEach((h, i) => {
      if (h !== undefined && h.top <= y) current = i;
    });
    const next = current >= 0 && y >= headers.current[current].bottom ? current : null;
    setSticky((s) => (s === next ? s : next));
  }, []);
  const onHeaderLayout = (i: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    headers.current[i] = { top: y, bottom: y + height };
  };

  if (game === null || shown === null || model === null) {
    const note = game === null ? 'Loading cards…' : shown === null ? 'No card read yet' : null;
    return (
      <View style={[styles.panel, styles.quietPanel, { backgroundColor: theme.panel, borderColor: theme.greyPanelBorder }]}>
        {shown !== null && <Text style={[styles.name, { color: theme.text }]}>{shown.match.name}</Text>}
        {note !== null && <Text style={[styles.muted, { color: theme.muted }]}>{note}</Text>}
      </View>
    );
  }

  const { match } = shown;
  const readAs = showsReadAs(match.match) ? readAsLine(match.lineUsed) : null;
  if (match.isToken) {
    return (
      <View style={[styles.panel, styles.quietPanel, { backgroundColor: theme.panel, borderColor: theme.greyPanelBorder }]}>
        <Text style={[styles.name, { color: theme.text }]}>{match.name}</Text>
        {readAs !== null && <Text style={[styles.small, { color: theme.muted }]}>{readAs}</Text>}
        <Text style={[styles.muted, { color: theme.muted }]}>Token, not tracked</Text>
      </View>
    );
  }

  const { groups, alert } = model;
  const several = groups.length > 1;
  const missing = missingVersion(groups, shown.thisVersion);
  const missingLine = missing === null ? null : missingVersionLine(missing.setCode, missing.collectorNumber, minCents);
  const border = alert.kind === 'full' ? { borderWidth: 3, borderColor: theme.accent }
    : alert.kind === 'quiet' ? { borderWidth: 1.5, borderColor: theme.quiet }
      : { borderWidth: 1, borderColor: theme.greyPanelBorder };

  const markButton = (g: CardGroup) => {
    const isKnown = marks.isKnown(g.oracleId);
    return (
      <Pressable
        style={[styles.markButton, { borderColor: theme.border }]}
        onPress={() => (isKnown ? unmarkKnown(g.oracleId) : markKnown({ oracleId: g.oracleId, name: g.name }))}
        accessibilityRole="button"
        accessibilityLabel={several ? `${isKnown ? 'Unmark' : 'Mark known'}: ${g.name}` : undefined}
      >
        {!isKnown && <Icon name="check" size={16} color={theme.text} />}
        <Text style={[styles.markText, { color: theme.text }]}>{isKnown ? 'Unmark' : 'Mark known'}</Text>
      </Pressable>
    );
  };

  const rows = (g: CardGroup, list: RowView[], kept: ReadonlySet<string> | null) => list.map((row) => (
    <VersionRow
      key={row.key}
      row={row}
      icon={iconFor(row.symbolSet)}
      theme={theme}
      open={openRows.has(row.key)}
      onToggle={() => toggle(setOpenRows, row.key)}
      shorthand={shorthand}
      kept={kept === null ? null : { value: kept.has(row.key), onChange: (v) => setKept(g.oracleId, row.key, v) }}
    />
  ));

  const readAsText = readAs === null ? null : <Text style={[styles.small, { color: theme.muted }]}>{readAs}</Text>;
  const missingText = missingLine === null ? null
    : <Text style={[styles.small, { color: theme.text }]}>{missingLine}</Text>;

  const stuck = sticky !== null ? groups[sticky] : undefined;
  return (
    <View style={[styles.panel, border, { backgroundColor: theme.panel }]}>
      <ScrollView contentContainerStyle={styles.content} onScroll={onScroll} scrollEventThrottle={16}>
        {(alert.label !== null || !several) && (
          <View style={styles.chipRow}>
            <Label kind={alert.kind} label={alert.label} theme={theme} />
            {groups.length === 1 && markButton(groups[0])}
          </View>
        )}
        {several && readAsText}
        {several && missingText}
        {groups.flatMap((g, i) => {
          const nothing = g.qualifying.length === 0 && alert.kind === 'none';
          const [nothingTitle, nothingDetail] = nothingLines(g.totalVersions, minCents);
          const kept = marks.isKnown(g.oracleId) ? marks.kept(g.oracleId) : null;
          const folded = !openFolds.has(g.oracleId);
          return [
            <View key={`h:${g.oracleId}`} style={styles.header} onLayout={onHeaderLayout(i)}>
              {several ? (
                <View style={styles.groupTitle}>
                  <Text style={[styles.groupName, { color: theme.text }]}>{g.name}</Text>
                  {markButton(g)}
                </View>
              ) : (
                <Text style={[styles.name, { color: theme.text }]}>{g.name}</Text>
              )}
              {!several && readAsText}
              {nothing ? (
                <View style={[styles.nothing, { borderColor: theme.divider }]}>
                  <Text style={[styles.nothingTitle, { color: theme.muted }]}>{nothingTitle}</Text>
                  <Text style={[styles.count, { color: theme.muted }]}>{nothingDetail}</Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.count, { color: theme.muted }]}>
                    {countLine(g.qualifying.length, g.totalVersions, minCents)}
                  </Text>
                  {g.summary !== '' && <Text style={[styles.summary, { color: theme.text }]}>{g.summary}</Text>}
                </>
              )}
              {!several && missingText}
            </View>,
            <View key={`l:${g.oracleId}`} style={[styles.list, { borderColor: theme.divider }, nothing && styles.listAfterNothing]}>
              {rows(g, rowViews(g.qualifying, g.versionsByKey, shown.thisVersion), kept)}
              {g.unpriced.length > 0 && (
                <Pressable
                  style={[styles.fold, { borderColor: theme.divider }, !folded && styles.foldOpen]}
                  onPress={() => toggle(setOpenFolds, g.oracleId)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !folded }}
                >
                  <Text style={[styles.foldText, { color: theme.muted }]}>Unpriced ({g.unpriced.length})</Text>
                  <Icon name={folded ? 'down' : 'up'} size={16} color={theme.muted} />
                </Pressable>
              )}
              {!folded && rows(g, rowViews(g.unpriced, g.versionsByKey, shown.thisVersion), kept)}
            </View>,
          ];
        })}
      </ScrollView>
      {stuck !== undefined && (
        <View style={[styles.sticky, { backgroundColor: theme.panel, borderColor: theme.divider }]}
          accessibilityLabel={`${stuck.name} · ${stickyLine(stuck.qualifying.length, stuck.unpriced.length, minCents)}`}>
          <Text style={[styles.stickyName, { color: theme.text }]} numberOfLines={1}>{stuck.name}</Text>
          <Text style={[styles.stickyLine, { color: theme.link }]}>
            {stickyLine(stuck.qualifying.length, stuck.unpriced.length, minCents)}
          </Text>
        </View>
      )}
    </View>
  );
});

/**
 * The result's label (the alert's, or the result card's): a chip for a full alert or a known card with nothing
 * alerting, text for a quiet one.
 */
export function Label({ kind, label, theme }: { kind: AlertKind; label: string | null; theme: Theme }): ReactNode {
  if (label === null) return <View />;
  if (kind === 'quiet') {
    return <Text style={[styles.quietLabel, { color: theme.quiet }]}>{label}</Text>;
  }
  const full = kind === 'full';
  return (
    <View style={[styles.chip, { backgroundColor: full ? theme.accent : theme.border }]}>
      <Text style={[styles.chipText, { color: full ? theme.onAccent : theme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, marginHorizontal: 10, marginTop: 10, borderRadius: 16, overflow: 'hidden' },
  quietPanel: { borderWidth: 1, padding: 16, gap: 8 },
  content: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexShrink: 1 },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  quietLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  markButton: {
    minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  markText: { fontSize: 14, fontWeight: '500' },
  header: { gap: 2 },
  name: { fontSize: 26, fontWeight: '700', letterSpacing: -0.26 },
  groupTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupName: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  count: { fontSize: 14 },
  summary: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  small: { fontSize: 13, lineHeight: 18 },
  muted: { fontSize: 16 },
  nothing: { gap: 4, paddingVertical: 16, marginTop: 10, borderTopWidth: 1 },
  nothingTitle: { fontSize: 20, fontWeight: '600' },
  list: { borderTopWidth: 1, marginBottom: 8 },
  listAfterNothing: { marginTop: -8 },
  fold: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  foldOpen: { borderBottomWidth: 1 },
  foldText: { fontSize: 14 },
  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, minHeight: 46, paddingHorizontal: 14, borderBottomWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  stickyName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  stickyLine: { fontSize: 13, fontWeight: '600' },
});
