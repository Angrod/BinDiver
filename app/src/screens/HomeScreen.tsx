import { useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text } from 'react-native';
import { useAppData } from '../state/AppData';
import type { CardGroup } from '../game/mtg/types';
import type { CardMatch } from '../game/types';
import { SearchSheet } from './SearchSheet';

/** Temporary shell until the camera screen replaces it. */
export function HomeScreen() {
  const { game, priceDate } = useAppData();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ name: string; versions: number } | null>(null);

  const onPick = (m: CardMatch) => {
    setOpen(false);
    let groups: CardGroup[] = [];
    try {
      groups = game?.lookup(m.oracleIds, 1000, 'oldest') ?? [];
    } catch (e) {
      console.warn('lookup failed', e);
      return;
    }
    setPicked({ name: m.name, versions: groups.reduce((n, g) => n + g.qualifying.length, 0) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.date}>Prices as of {priceDate ?? 'unknown'}</Text>
      {game === null && <Text style={styles.date}>Loading cards…</Text>}
      <Button title="Search" onPress={() => setOpen(true)} disabled={game === null} />
      {picked && (
        <>
          <Text style={styles.name}>{picked.name}</Text>
          <Text style={styles.date}>{picked.versions} versions at $10+</Text>
        </>
      )}
      <SearchSheet visible={open} onPick={onPick} onCancel={() => setOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  date: { fontSize: 16, textAlign: 'center' },
  name: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
});
