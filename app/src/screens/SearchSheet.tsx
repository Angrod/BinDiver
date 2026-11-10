import { useMemo, useState } from 'react';
import {
  Button, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../state/AppData';
import type { CardMatch } from '../game/types';

interface Props {
  visible: boolean;
  onPick(match: CardMatch): void;
  onCancel(): void;
}

export function SearchSheet({ visible, onPick, onCancel }: Props) {
  const { game } = useAppData();
  const [text, setText] = useState('');
  const [notFound, setNotFound] = useState(false);

  const suggestions = useMemo(() => {
    if (!game || text.trim() === '') return [];
    try {
      return game.suggest(text, 6);
    } catch (e) {
      console.warn('suggest failed', e);
      return [];
    }
  }, [game, text]);

  const pick = (name: string) => {
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
    setNotFound(false);
    setText('');
    onPick(match);
  };

  const cancel = () => {
    setNotFound(false);
    setText('');
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.label}>Card name (English)</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setNotFound(false);
          }}
          accessibilityLabel="Card name (English)"
          onSubmitEditing={() => {
            if (text.trim() !== '') pick(text);
          }}
          returnKeyType="search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
        {suggestions.map((name) => (
          <Pressable key={name} style={styles.row} onPress={() => pick(name)}>
            <Text style={styles.rowText}>{name}</Text>
          </Pressable>
        ))}
        {notFound && <Text style={styles.note}>No card by that name</Text>}
        <View style={styles.cancel}>
          <Button title="Cancel" onPress={cancel} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  label: { fontSize: 15 },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10, fontSize: 18 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#999' },
  rowText: { fontSize: 18 },
  note: { fontSize: 16, marginTop: 8 },
  cancel: { marginTop: 16 },
});
