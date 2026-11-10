import { memo, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { resultModel, type ResultModel, type Shown } from '../scan/result';
import { useAppData } from '../state/AppData';
import { NOTE_MAX_LINES, noteLines, resultCardLines } from './resultCard';
import { Label } from './ResultPanel';
import { useTheme } from './theme';
import { Icon } from './VersionRow';

interface Props {
  /** The last card read or picked; null before the first. */
  shown: Shown | null;
  /** Opens the full list. */
  onOpen(): void;
  /** The most height the card may take: from its top, under the outline, to the bottom safe area. */
  room: number;
}

const PAD_V = 10;
const TEXT_GAP = 3;
const NOTE_LINE = 18;

/**
 * The small card over the bottom of the camera: the shown card's label, name and count at the current price
 * and known marks, with the read-as and "This version" lines when they apply. Tapping it opens the full list.
 * It never grows past `room`: notes are cut to fewer lines first.
 *
 * Like the panel, it only draws: it redraws when the price, sort or a known mark changes and never records
 * a scan or signals an alert.
 */
export const ResultCard = memo(function ResultCard({ shown, onOpen, room }: Props) {
  const { game, settings, marks } = useAppData();
  const theme = useTheme();
  const { minCents, sort } = settings;
  const model = useMemo((): ResultModel | null => {
    if (game === null || shown === null) return null;
    try {
      return resultModel(game, shown, minCents, sort, marks);
    } catch (e) {
      console.warn('lookup failed', e);
      return null;
    }
  }, [game, shown, minCents, sort, marks]);
  // The label, name and count's height, so the notes can be cut to what fits below them.
  const [head, setHead] = useState<number | null>(null);
  const onHeadLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setHead((prev) => (prev === h ? prev : h));
  };

  // Before a card is read, while cards load, or when the lookup fails: what the panel shows then.
  if (game === null || shown === null || model === null) {
    const note = game === null ? 'Loading cards…' : shown === null ? 'No card read yet' : null;
    return (
      <View style={[styles.card, styles.plain, { maxHeight: room, backgroundColor: theme.panel, borderColor: theme.greyPanelBorder }]}>
        {shown !== null && <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{shown.match.name}</Text>}
        {note !== null && <Text style={[styles.count, { color: theme.muted }]}>{note}</Text>}
      </View>
    );
  }

  const lines = resultCardLines(model, shown, minCents);
  const { kind } = model.alert;
  const border = kind === 'full' ? { borderWidth: 3, borderColor: theme.accent }
    : kind === 'quiet' ? { borderWidth: 1.5, borderColor: theme.quiet }
      : { borderWidth: 1, borderColor: theme.greyPanelBorder };
  const spare = head === null ? Infinity : room - 2 * (PAD_V + border.borderWidth) - head;
  const noteMax = lines.notes.length === 0 ? NOTE_MAX_LINES
    : noteLines(spare, lines.notes.length, NOTE_LINE * PixelRatio.getFontScale(), TEXT_GAP);
  return (
    <Pressable style={[styles.card, border, { maxHeight: room, backgroundColor: theme.panel }]} onPress={onOpen}
      accessibilityRole="button">
      <View style={styles.text}>
        <View style={styles.head} onLayout={onHeadLayout}>
          {lines.label !== null && (
            <View style={styles.labelRow}>
              <Label kind={kind} label={lines.label} theme={theme} />
            </View>
          )}
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{lines.name}</Text>
          <Text style={[styles.count, { color: theme.text }]} numberOfLines={1}>{lines.count}</Text>
        </View>
        {lines.notes.map((note) => (
          <Text key={note} style={[styles.note, { color: theme.muted }]} numberOfLines={noteMax}>{note}</Text>
        ))}
      </View>
      <Icon name="up" size={18} color={theme.muted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // maxHeight (room) and overflow: past the cut notes, the card is clipped at the bottom, never moved up.
  card: {
    overflow: 'hidden', borderRadius: 14, paddingHorizontal: 14, paddingVertical: PAD_V,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  plain: { borderWidth: 1, flexDirection: 'column', gap: 4 },
  text: { flex: 1, gap: TEXT_GAP },
  head: { gap: TEXT_GAP },
  labelRow: { flexDirection: 'row', marginBottom: 2 },
  name: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  count: { fontSize: 15, fontWeight: '500' },
  note: { fontSize: 13, lineHeight: NOTE_LINE },
});
