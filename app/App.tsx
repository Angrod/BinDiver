import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { AppDataProvider, useAppData } from './src/app/AppData';
import { HomeScreen } from './src/screens/HomeScreen';
import { SetupScreen } from './src/screens/SetupScreen';

function Root() {
  const { phase, status } = useAppData();
  if (phase === 'ready') return <HomeScreen />;
  if (phase === 'setup') return <SetupScreen />;
  return (
    <View style={styles.center}>
      <Text>{status || 'Loading cards…'}</Text>
    </View>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <Root />
      <StatusBar style="auto" />
    </AppDataProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
