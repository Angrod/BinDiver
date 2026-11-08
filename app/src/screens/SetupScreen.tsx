import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Button, StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../state/AppData';
import { currentNetwork } from '../data/network';
import type { NetworkKind } from '../data/policy';

export function SetupScreen() {
  const { downloadNow, status } = useAppData();
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

  const run = async (confirmedCellular: boolean) => {
    setWorking(true);
    try {
      await downloadNow(confirmedCellular);
    } finally {
      setWorking(false);
      checkNetwork();
    }
  };

  const onDownload = () => {
    if (network === 'cellular') {
      Alert.alert('Download about 25 MB on cellular?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => void run(true) },
      ]);
    } else {
      void run(false);
    }
  };

  const offline = network === 'none';
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BinDiver needs its card data: one download of about 25 MB.</Text>
      {offline && <Text style={styles.note}>Connect to the internet to download the card data.</Text>}
      <Button title="Download" onPress={onDownload} disabled={offline || working} />
      {status !== '' && <Text style={styles.note}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  title: { fontSize: 18, textAlign: 'center' },
  note: { fontSize: 15, textAlign: 'center' },
});
