import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SortOrder } from '../game/types';
import type { Shown } from '../scan/result';
import { useAppData, type AppDataValue } from '../state/AppData';
import type { AppSettings } from '../user/settings';
import { ResultPanel } from './ResultPanel';
import { useTheme, type Theme } from './theme';
import { Icon } from './VersionRow';

const SORTS: ReadonlyArray<[SortOrder, string]> = [
  ['oldest', 'Oldest first'], ['newest', 'Newest first'], ['price', 'Highest price'],
];

interface Props {
  visible: boolean;
  /** The last card read or picked; null before the first. */
  shown: Shown | null;
  /** Counts shown cards, so the panel starts fresh (rows closed, scrolled to the top) for each. */
  shownId: number;
  onClose(): void;
}

/**
 * The full list: the result panel in a sheet over most of the screen, opened from the result card, with the
 * Shorthand switch and the sort menu at its top. The scan screen turns the camera off while it is open.
 */
export function ResultSheet({ visible, shown, shownId, onClose }: Props) {
  const { settings, setSetting } = useAppData();
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={styles.scrim}>
        <Pressable style={styles.gap} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.bg, borderColor: theme.greyPanelBorder }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <ListControls theme={theme} settings={settings} setSetting={setSetting} />
            <Pressable style={styles.done} onPress={onClose} accessibilityRole="button">
              <Text style={[styles.doneText, { color: theme.link }]}>Done</Text>
            </Pressable>
          </View>
          <ResultPanel key={shownId} shown={shown} />
        </SafeAreaView>
      </SafeAreaView>
    </Modal>
  );
}

interface ControlProps {
  theme: Theme;
  settings: Pick<AppSettings, 'shorthand' | 'sort'>;
  setSetting: AppDataValue['setSetting'];
}

/**
 * The Shorthand toggle and the sort menu. Both are remembered through `setSetting`; changing them only
 * redraws the list.
 */
function ListControls({ theme, settings, setSetting }: ControlProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel = SORTS.find(([o]) => o === settings.sort)?.[1] ?? SORTS[0][1];
  const button = [styles.button, { backgroundColor: theme.panel, borderColor: theme.border }];
  const buttonText = [styles.buttonText, { color: theme.text }];
  return (
    <>
      <View style={styles.controls}>
        <Pressable
          style={button}
          onPress={() => setSetting('shorthand', !settings.shorthand)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.shorthand }}
        >
          <View style={[styles.dot, settings.shorthand
            ? { backgroundColor: theme.accent, borderColor: theme.accent }
            : { borderColor: theme.muted }]} />
          <Text style={buttonText}>Shorthand</Text>
        </Pressable>
        <Pressable
          style={button}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort versions: ${sortLabel.toLowerCase()}`}
        >
          <Text style={buttonText}>{sortLabel}</Text>
          <Icon name="down" size={14} color={theme.text} />
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
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  gap: { height: 24 },
  sheet: {
    flex: 1, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 4, paddingTop: 8 },
  controls: { flex: 1, flexDirection: 'row', gap: 8 },
  button: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonText: { fontSize: 14, fontWeight: '500' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  doneText: { fontSize: 17, fontWeight: '600' },
  menuWrap: { flex: 1, justifyContent: 'flex-end', padding: 10, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.35)' },
  menu: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  menuRow: {
    minHeight: 50, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  menuText: { fontSize: 16 },
  menuOn: { fontWeight: '700' },
});
