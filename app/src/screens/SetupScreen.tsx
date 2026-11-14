import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../state/AppData';
import { currentNetwork } from '../data/network';
import type { NetworkKind } from '../data/policy';
import { useTheme } from './theme';

export function SetupScreen() {
  const { downloadNow, status } = useAppData();
  const theme = useTheme();
  const [network, setNetwork] = useState<NetworkKind>('unknown');
  const [working, setWorking] = useState(false);

  const checkNetwork = useCallback(() => {
    currentNetwork().then(setNetwork, () => setNetwork('unknown'));
  }, []);

  useEffect(() => {
    checkNetwork();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkNetwork();
    });
    return () => sub.remove();
  }, [checkNetwork]);

  const run = async (confirmed: boolean) => {
    setWorking(true);
    try {
      await downloadNow(confirmed);
    } finally {
      setWorking(false);
      checkNetwork();
    }
  };

  const onDownload = () => {
    if (network !== 'wifi') {
      const title = network === 'cellular' ? 'Download about 25 MB on cellular?' : 'Download about 25 MB?';
      Alert.alert(title, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => void run(true) },
      ]);
    } else {
      void run(false);
    }
  };

  const offline = network === 'none';
  const disabled = offline || working;
  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>BinDiver needs its card data: one download of about 25 MB.</Text>
      {offline && (
        <Text style={[styles.note, { color: theme.muted }]}>Connect to the internet to download the card data.</Text>
      )}
      <Pressable
        style={[styles.button, { backgroundColor: theme.accent, opacity: disabled ? 0.5 : 1 }]}
        onPress={onDownload}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.buttonText, { color: theme.onAccent }]}>Download</Text>
      </Pressable>
      {status !== '' && <Text style={[styles.note, { color: theme.muted }]}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 18, textAlign: 'center' },
  note: { fontSize: 15, textAlign: 'center' },
  button: { alignSelf: 'center', minHeight: 48, paddingHorizontal: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
});
