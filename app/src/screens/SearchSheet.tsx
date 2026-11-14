import { useMemo, useState } from 'react';
import {
  Button, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../state/AppData';
import type { ArtistOption, CardMatch, PrintingRef } from '../game/types';
import { SetIcon } from './SetIcon';
import { searchList, type SearchItem } from './searchList';
import { useTheme } from './theme';

interface Props {
  visible: boolean;
  onPick(match: CardMatch, thisVersion: string | null): void;
  onCancel(): void;
}

const HINT = 'Name, or set and number (MOM 123), or number/total (38/143)';
const OLD_LABEL = 'Card name (English)';
const PRE_1998 = 'Cards from before 1998 have no number: type the English name.';

export function SearchSheet({ visible, onPick, onCancel }: Props) {
  const { game } = useAppData();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [artistText, setArtistText] = useState('');
  const [artist, setArtist] = useState<ArtistOption | null>(null);

  const numberSearch = game?.numberSearch ?? false;
  const kind = game && text.trim() !== '' ? game.searchKind(text) : 'name';

  // Computed once per text change; the Artist box only filters it.
  const candidates = useMemo<PrintingRef[]>(() => {
    if (!game || kind !== 'number-total') return [];
    try {
      return game.numberCandidates(text);
    } catch (e) {
      console.warn('numberCandidates failed', e);
      return [];
    }
  }, [game, kind, text]);

  const items = useMemo<SearchItem[]>(() => {
    if (!game) return [];
    try {
      return searchList(
        { ...game, numberCandidates: () => candidates },
        text,
        artist?.id ?? null,
      );
    } catch (e) {
      console.warn('search failed', e);
      return [];
    }
  }, [game, text, artist, candidates]);

  const artistOptions = useMemo<ArtistOption[]>(() => {
    if (!game || kind !== 'number-total' || artist || artistText.trim() === '') return [];
    try {
      return game.artistOptions(candidates, artistText, 5);
    } catch (e) {
      console.warn('artistOptions failed', e);
      return [];
    }
  }, [game, kind, candidates, artist, artistText]);

  const reset = () => {
    setNotFound(false);
    setText('');
    setArtistText('');
    setArtist(null);
  };

  const pickName = (name: string) => {
    let match: CardMatch | null = null;
    try {
      match = game?.find(name) ?? null;
    } catch (e) {
      console.warn('find failed', e);
    }
    if (!match) {
      setNotFound(true);
      return;
    }
    reset();
    onPick(match, null);
  };

  const pickItem = (item: SearchItem) => {
    if (item.kind === 'name') return pickName(item.name);
    if (item.kind === 'printing') {
      const { match, printing } = item.hit;
      reset();
      onPick(match, printing.scryfallId);
      return;
    }
    // No public Game method gives a CardMatch for an oracle ID, so look the name up.
    let match: CardMatch | null = null;
    try {
      match = game?.find(item.printing.name) ?? null;
    } catch (e) {
      console.warn('find failed', e);
    }
    if (!match) {
      setNotFound(true);
      return;
    }
    reset();
    onPick(match, item.printing.scryfallId);
  };

  const cancel = () => {
    reset();
    onCancel();
  };

  const label = numberSearch ? HINT : OLD_LABEL;
  const rowStyle = [styles.row, { borderColor: theme.divider }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.accent, backgroundColor: theme.panel, color: theme.text }]}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setNotFound(false);
            setArtistText('');
            setArtist(null);
          }}
          accessibilityLabel={label}
          onSubmitEditing={() => {
            if (text.trim() === '') return;
            const first = items[0];
            if (first) pickItem(first);
            else pickName(text);
          }}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
        {numberSearch && <Text style={[styles.note, { color: theme.muted }]}>{PRE_1998}</Text>}
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.list}>
          {items.map((item) => {
            if (item.kind === 'name') {
              return (
                <Pressable key={`n:${item.name}`} style={rowStyle} onPress={() => pickItem(item)}>
                  <Text style={[styles.rowText, { color: theme.text }]}>{item.name}</Text>
                </Pressable>
              );
            }
            const p = item.kind === 'printing' ? item.hit.printing : item.printing;
            return (
              <Pressable key={`p:${p.scryfallId}`} style={rowStyle} onPress={() => pickItem(item)}>
                <View style={styles.printingRow}>
                  {item.kind === 'candidate' && game && (
                    <SetIcon svg={game.setIcon(p.symbolSet ?? p.setCode)} size={20} color={theme.text} />
                  )}
                  <View style={styles.printingText}>
                    <Text style={[styles.rowText, { color: theme.text }]}>{p.name}</Text>
                    <Text style={[styles.sub, { color: theme.muted }]}>
                      {`${p.setName} #${p.collectorNumber}`}
                    </Text>
                    {item.kind === 'candidate' && p.artist !== null && (
                      <Text style={[styles.sub, { color: theme.muted }]}>{p.artist}</Text>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        {notFound && <Text style={[styles.note, { color: theme.text }]}>No card by that name</Text>}
        {kind === 'number-total' && (
          <View style={styles.artistBox}>
            <Text style={[styles.label, { color: theme.muted }]}>Artist</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, backgroundColor: theme.panel, color: theme.text }]}
              value={artist ? artist.name : artistText}
              onChangeText={(t) => {
                setArtist(null);
                setArtistText(t);
              }}
              accessibilityLabel="Artist"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {artistOptions.map((o) => (
              <Pressable
                key={o.id}
                style={rowStyle}
                onPress={() => {
                  setArtist(o);
                  setArtistText('');
                }}
              >
                <Text style={[styles.rowText, { color: theme.text }]}>{o.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.cancel}>
          <Button title="Cancel" onPress={cancel} color={theme.link} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  label: { fontSize: 12 },
  input: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, height: 46, fontSize: 17 },
  list: { flexGrow: 0 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 16 },
  sub: { fontSize: 13 },
  printingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  printingText: { flex: 1 },
  note: { fontSize: 13 },
  artistBox: { gap: 4 },
  cancel: { marginTop: 8 },
});
