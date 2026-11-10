import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, FlatList, Modal, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { unmatchedToCsv, type UnmatchedRow } from '../scan/unmatched';
import { useAppData } from '../state/AppData';
import { runToCsv, summarizeRun } from '../user/runReport';
import type { Scan, TestRun, UserStore } from '../user/store';
import { formatReadRight, formatSecondsPerCard, parseStackCount, showsReadAs, timeOfDay } from './format';

const UNMATCHED_SHOWN = 50;

/** Writes a CSV to the cache and opens the share sheet; a failure shows an alert. */
async function shareCsvFile(name: string, csv: () => string): Promise<void> {
  try {
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    await file.write(csv());
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  } catch (e) {
    Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
  }
}

/** Shares one run's scans as a CSV. */
export function shareRunCsv(user: UserStore, runId: number): Promise<void> {
  return shareCsvFile(`bindiver-run-${runId}.csv`, () => runToCsv(user.runScans(runId)));
}

interface Props {
  visible: boolean;
  /** The candidate texts that matched nothing in the run just stopped (kept in memory only). */
  unmatched: { runId: number; rows: UnmatchedRow[] } | null;
  onStart(stackCount: number): void;
  onClose(): void;
}

/** Test runs: start one, and review, mark and export the last finished one. */
export function RunScreen({ visible, unmatched, onStart, onClose }: Props) {
  const { user } = useAppData();
  const [stackText, setStackText] = useState('');
  const [last, setLast] = useState<TestRun | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [exporting, setExporting] = useState(false);

  // Re-read the last finished run each time the screen opens.
  useEffect(() => {
    if (!visible) return;
    const r = user.latestRun();
    const done = r && r.stoppedAt !== null ? r : null;
    setLast(done);
    setScans(done ? user.runScans(done.id) : []);
  }, [visible, user]);

  const summary = useMemo(() => (last ? summarizeRun(last, scans) : null), [last, scans]);
  const newestFirst = useMemo(() => [...scans].reverse(), [scans]);
  const stackCount = parseStackCount(stackText);

  const markWrong = (scan: Scan, wrong: boolean) => {
    user.setMarkedWrong(scan.id, wrong);
    setScans((list) => list.map((s) => (s.id === scan.id ? { ...s, markedWrong: wrong } : s)));
  };

  const unmatchedRows = last && unmatched?.runId === last.id ? unmatched.rows : null;

  const shareCsv = async (name: string, csv: () => string) => {
    setExporting(true);
    try {
      await shareCsvFile(name, csv);
    } finally {
      setExporting(false);
    }
  };
  const exportRun = async () => {
    if (!last) return;
    const id = last.id;
    setExporting(true);
    try {
      await shareRunCsv(user, id);
    } finally {
      setExporting(false);
    }
  };
  const exportUnmatched = async () => {
    if (!last || !unmatchedRows) return;
    const rows = unmatchedRows;
    await shareCsv(`bindiver-run-${last.id}-unmatched.csv`, () => unmatchedToCsv(rows));
  };

  const start = () => {
    if (stackCount === null) return;
    setStackText('');
    onStart(stackCount);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Test run</Text>
        <Button title="Close" onPress={onClose} />
      </View>

      <Text style={styles.label}>English cards in the stack</Text>
      <View style={styles.startRow}>
        <TextInput
          style={styles.input}
          value={stackText}
          onChangeText={setStackText}
          keyboardType="number-pad"
          accessibilityLabel="English cards in the stack"
          placeholder="50"
          placeholderTextColor="#999"
        />
        <Button title="Start" onPress={start} disabled={stackCount === null} />
      </View>

      {last && summary && (
        <View style={styles.summary}>
          <Text style={styles.section}>Last run</Text>
          <Row label="Cards read" value={String(summary.cardsRead)} />
          <Row label="Read right" value={formatReadRight(summary.readRate, summary.rightReads, last.stackCount)} />
          <Row label="Wrong" value={String(summary.wrongReads)} />
          <Row label="Missed" value={String(summary.missed)} />
          <Row label="Seconds per card" value={formatSecondsPerCard(summary.avgSecondsPerCard)} />
          <View style={styles.export}>
            <Button title="Export" onPress={() => void exportRun()} disabled={exporting} />
          </View>
          {unmatchedRows && (
            <>
              <Text style={styles.section}>Lines that matched nothing</Text>
              {unmatchedRows.length === 0 && <Text style={styles.rowLabel}>None</Text>}
              {unmatchedRows.slice(0, UNMATCHED_SHOWN).map((r) => (
                <View key={r.text} style={styles.row}>
                  <Text style={[styles.rowLabel, styles.unmatchedText]} numberOfLines={1}>{r.text}</Text>
                  <Text style={styles.rowValue}>{r.count}</Text>
                </View>
              ))}
              <View style={styles.export}>
                <Button
                  title="Export unmatched"
                  onPress={() => void exportUnmatched()}
                  disabled={exporting || unmatchedRows.length === 0}
                />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <FlatList
          data={newestFirst}
          keyExtractor={(s) => String(s.id)}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.scan}>
              <View style={styles.scanText}>
                <Text style={styles.scanName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.scanDetail} numberOfLines={1}>
                  {timeOfDay(item.at)} · {item.source} · {item.match}
                  {showsReadAs(item.match) ? ` · “${item.lineUsed}”` : ''}
                </Text>
              </View>
              <Text style={styles.wrongLabel}>Wrong</Text>
              <Switch
                value={item.markedWrong}
                onValueChange={(v) => markWrong(item, v)}
                accessibilityLabel={`Wrong: ${item.name}`}
              />
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  label: { fontSize: 15, color: '#111' },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10, fontSize: 18, color: '#111',
  },
  summary: { marginTop: 16, gap: 6 },
  section: { fontSize: 18, fontWeight: '600', color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: 16, color: '#333' },
  rowValue: { fontSize: 16, fontWeight: '600', color: '#111', fontVariant: ['tabular-nums'] },
  export: { alignItems: 'flex-start' },
  unmatchedText: { flex: 1, marginRight: 12 },
  scan: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#bbb',
  },
  scanText: { flex: 1 },
  scanName: { fontSize: 16, color: '#111' },
  scanDetail: { fontSize: 13, color: '#666' },
  wrongLabel: { fontSize: 13, color: '#666' },
});
