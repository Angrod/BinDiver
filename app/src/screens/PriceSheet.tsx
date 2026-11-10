import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PRESET_CENTS } from '../alert/alert';
import { dollars } from '../game/types';
import { useAppData } from '../state/AppData';
import { parsePrice } from './resultView';
import { presetRates } from './rates';
import { useTheme } from './theme';

interface Props {
  visible: boolean;
  onClose(): void;
}

const FOOTNOTE = "Percentages: the share of card names you've scanned that would alert at each price.";

/** The alert price: five presets with how often each would alert, and any amount typed. */
export function PriceSheet({ visible, onClose }: Props) {
  const { game, user, marks, settings, setSetting } = useAppData();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [rates, setRates] = useState<Map<number, number> | null>(null);

  // Worked out once each time the sheet opens, not on every render.
  useEffect(() => {
    if (!visible) return;
    setText('');
    try {
      setRates(game ? presetRates(game, user.scannedCards(), marks) : null);
    } catch (e) {
      console.warn('presetRates failed', e);
      setRates(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Applies the typed amount; an amount that doesn't parse changes nothing. */
  const applyTyped = (): boolean => {
    const cents = parsePrice(text);
    if (cents === null) return false;
    setSetting('minCents', cents);
    return true;
  };
  /** Done applies a typed amount and closes; an unparseable one keeps the sheet, price and text as they are. */
  const done = () => {
    if (text.trim() !== '' && !applyTyped()) return;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.greyPanelBorder }]}>
          <View style={[styles.grabber, { backgroundColor: theme.border }]} />
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.title, { color: theme.text }]}>Alert at or above</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>Remembered on this phone.</Text>
            </View>
            <Pressable style={[styles.done, { backgroundColor: theme.accent }]} onPress={done} accessibilityRole="button">
              <Text style={[styles.doneText, { color: theme.onAccent }]}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            {PRESET_CENTS.map((cents) => {
              const on = cents === settings.minCents;
              const rate = rates?.get(cents);
              return (
                <Pressable
                  key={cents}
                  style={[styles.preset, {
                    backgroundColor: on ? theme.lookAlikeBg : theme.rowOpen,
                    borderColor: on ? theme.accent : theme.border,
                    borderWidth: on ? 2 : 1,
                  }]}
                  onPress={() => { setSetting('minCents', cents); setText(''); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.presetPrice, { color: theme.text }]}>{dollars(cents).replace(/\.00$/, '')}</Text>
                  {rate !== undefined && (
                    <Text style={[styles.presetRate, { color: on ? theme.lookAlikeText : theme.muted }]}>
                      {Math.round(rate * 100)}% alert
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.custom}>
            <Text style={[styles.label, { color: theme.muted }]}>Or type any amount</Text>
            <View style={[styles.field, { backgroundColor: theme.rowOpen, borderColor: theme.border }]}>
              <Text style={[styles.dollar, { color: theme.muted }]}>$</Text>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => { if (applyTyped()) onClose(); }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="e.g. 7.50"
                placeholderTextColor={theme.muted}
                accessibilityLabel="Or type any amount"
              />
            </View>
          </View>

          {rates !== null && <Text style={[styles.foot, { color: theme.muted }]}>{FOOTNOTE}</Text>}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  fill: { flex: 1 },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 14 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headText: { gap: 4, flexShrink: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 13 },
  done: { height: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { width: '31.5%', minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  presetPrice: { fontSize: 18, fontWeight: '700' },
  presetRate: { fontSize: 12 },
  custom: { gap: 4 },
  label: { fontSize: 12 },
  field: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, gap: 6 },
  dollar: { fontSize: 17 },
  input: { flex: 1, minWidth: 0, height: 44, fontSize: 17 },
  foot: { fontSize: 12, lineHeight: 17 },
});
