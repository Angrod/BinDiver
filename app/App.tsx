import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppDataProvider, useAppData } from './src/state/AppData';
import { ScanScreen } from './src/screens/ScanScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { useTheme } from './src/screens/theme';

function Root() {
  const { phase, status } = useAppData();
  const theme = useTheme();
  if (phase === 'ready') return <ScanScreen />;
  if (phase === 'setup') return <SetupScreen />;
  return (
    <View style={[styles.center, { backgroundColor: theme.bg }]}>
      <Text style={{ color: theme.text }}>{status || 'Loading cards…'}</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <Root />
        <StatusBar style="auto" />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
