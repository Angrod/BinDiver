import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { priceLabel } from '../alert/alert';
import type { AlertStyle } from '../alert/signal';
import type { SortOrder } from '../game/types';
import { APP_TOO_OLD, useAppData } from '../state/AppData';
import { useUpdateStatus } from '../updates/useUpdateStatus';
import { KnownCardsScreen } from './KnownCardsScreen';
import { PriceSheet } from './PriceSheet';
import { formatBytes, formatPriceDate } from './resultView';
import { shareRunCsv } from './RunScreen';
import { useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose(): void;
}

const STYLES: ReadonlyArray<[AlertStyle, string]> = [
  ['vibration', 'Vibration'], ['sound', 'Sound'], ['both', 'Both'], ['screen', 'Screen only'],
];
const SORTS: ReadonlyArray<[SortOrder, string]> = [
  ['oldest', 'Oldest first'], ['newest', 'Newest first'], ['price', 'Highest price'],
];

const SCRYFALL = 'Card data and prices from Scryfall.';
const FAN_CONTENT = 'BinDiver is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.';

export function SettingsScreen({ visible, onClose }: Props) {
  const {
    user, priceDate, settings, setSetting, checkNow, lastCheckError, appTooOld, dataBytes,
  } = useAppData();
  const theme = useTheme();
  const codeStatus = useUpdateStatus();
  const [priceOpen, setPriceOpen] = useState(false);
  const [knownOpen, setKnownOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const knownCount = visible ? user.knownCards().length : 0;
  const run = visible ? user.latestRun() : null;

  const check = async (confirmed: boolean) => {
    setOffline(false);
    setChecking(true);
    try {
      const result = await checkNow(confirmed);
      if (result === 'ask') {
        Alert.alert('Download on cellular?', undefined, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download', onPress: () => void check(true) },
        ]);
      } else if (result === 'offline') {
        setOffline(true);
      }
    } finally {
      setChecking(false);
    }
  };

  const exportRun = async () => {
    if (!run) return;
    setExporting(true);
    try {
      await shareRunCsv(user, run.id);
    } finally {
      setExporting(false);
    }
  };

  const section = (title: string, children: ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.divider }]}>{children}</View>
    </View>
  );
  const button = (label: string, onPress: () => void, opts: { value?: string; disabled?: boolean } = {}) => (
    <Pressable
      style={[styles.row, opts.disabled && styles.disabled]}
      onPress={onPress}
      disabled={opts.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: opts.disabled === true }}
    >
      <Text style={[styles.rowText, { color: theme.link }]}>{label}</Text>
      {opts.value !== undefined && <Text style={[styles.value, { color: theme.text }]}>{opts.value}</Text>}
    </Pressable>
  );
  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.row}>
      <Text style={[styles.rowText, { color: theme.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
  const choices = <T extends string>(options: ReadonlyArray<[T, string]>, current: T, onPick: (v: T) => void) => (
    <View style={styles.choices}>
      {options.map(([value, label]) => {
        const on = value === current;
        return (
          <Pressable
            key={value}
            style={[styles.choice, {
              borderColor: on ? theme.accent : theme.border,
              backgroundColor: on ? theme.lookAlikeBg : theme.rowOpen,
            }]}
            onPress={() => onPick(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.choiceText, { color: on ? theme.lookAlikeText : theme.text }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.closeText, { color: theme.link }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {section('Alert price', button('Alert at or above', () => setPriceOpen(true), { value: priceLabel(settings.minCents) }))}

          {section('Alert style', choices(STYLES, settings.alertStyle, (v) => setSetting('alertStyle', v)))}

          {section('View', (
            <>
              {toggle('Shorthand', settings.shorthand, (v) => setSetting('shorthand', v))}
              {choices(SORTS, settings.sort, (v) => setSetting('sort', v))}
            </>
          ))}

          {section('Card data', (
            <>
              <View style={styles.row}>
                <Text style={[styles.rowText, { color: theme.text }]}>
                  Prices as of {priceDate !== null ? formatPriceDate(priceDate, new Date()) : 'unknown'}
                </Text>
                {dataBytes !== null && <Text style={[styles.value, { color: theme.muted }]}>{formatBytes(dataBytes)}</Text>}
              </View>
              {button('Check for new prices now', () => void check(false), { disabled: checking })}
              {offline && <Text style={[styles.note, { color: theme.muted }]}>No connection</Text>}
              {toggle('Allow downloads on cellular', settings.allowCellular, (v) => setSetting('allowCellular', v))}
              {lastCheckError !== null && <Text style={[styles.note, { color: theme.quiet }]}>{lastCheckError}</Text>}
              {appTooOld && <Text style={[styles.note, { color: theme.quiet }]}>{APP_TOO_OLD}</Text>}
            </>
          ))}

          {section('Known cards', button(`Known cards (${knownCount})`, () => setKnownOpen(true)))}

          {section('Camera test', (
            <>
              {toggle('Test mode', settings.testMode, (v) => setSetting('testMode', v))}
              {button('Export', () => void exportRun(), { disabled: run === null || exporting })}
            </>
          ))}

          {section('About', (
            <View style={styles.about}>
              <Text style={[styles.aboutText, { color: theme.text }]}>{SCRYFALL}</Text>
              <Text style={[styles.aboutText, { color: theme.text }]}>{FAN_CONTENT}</Text>
              <Text style={[styles.aboutText, { color: theme.muted }]}>{codeStatus}</Text>
            </View>
          ))}
        </ScrollView>

        <PriceSheet visible={priceOpen} onClose={() => setPriceOpen(false)} />
        <KnownCardsScreen visible={knownOpen} onClose={() => setKnownOpen(false)} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  closeText: { fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 32, gap: 18 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, paddingHorizontal: 14 },
  rowText: { fontSize: 16, flexShrink: 1 },
  value: { fontSize: 16 },
  disabled: { opacity: 0.4 },
  note: { fontSize: 13, paddingHorizontal: 14, paddingBottom: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  choice: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  choiceText: { fontSize: 15, fontWeight: '600' },
  about: { padding: 14, gap: 10 },
  aboutText: { fontSize: 14, lineHeight: 20 },
});
