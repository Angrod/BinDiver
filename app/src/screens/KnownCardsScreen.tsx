import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppData } from '../state/AppData';
import { useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose(): void;
}

/** The cards marked known: a searchable list with Unmark on each. */
export function KnownCardsScreen({ visible, onClose }: Props) {
  const { user, unmarkKnown } = useAppData();
  const theme = useTheme();
  const [filter, setFilter] = useState('');
  const [cards, setCards] = useState(() => user.knownCards());

  useEffect(() => {
    if (!visible) return;
    setFilter('');
    setCards(user.knownCards());
  }, [visible, user]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f === '' ? cards : cards.filter((c) => c.name.toLowerCase().includes(f));
  }, [cards, filter]);

  const unmark = (oracleId: string) => {
    unmarkKnown(oracleId);
    setCards(user.knownCards());
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.text }]}>Known cards ({cards.length})</Text>
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.closeText, { color: theme.link }]}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          style={[styles.search, { color: theme.text, backgroundColor: theme.rowOpen, borderColor: theme.border }]}
          value={filter}
          onChangeText={setFilter}
          placeholder="Search known cards"
          placeholderTextColor={theme.muted}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search known cards"
        />
        <FlatList
          data={shown}
          keyExtractor={(c) => c.oracleId}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: theme.divider }]}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
              <Pressable
                style={[styles.unmark, { borderColor: theme.border }]}
                onPress={() => unmark(item.oracleId)}
                accessibilityRole="button"
                accessibilityLabel={`Unmark ${item.name}`}
              >
                <Text style={[styles.unmarkText, { color: theme.text }]}>Unmark</Text>
              </Pressable>
            </View>
          )}
        />
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
  search: { marginHorizontal: 16, marginBottom: 8, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, fontSize: 16 },
  unmark: { height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  unmarkText: { fontSize: 14, fontWeight: '600' },
});
