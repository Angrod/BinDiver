import { getNetworkStateAsync, NetworkStateType } from 'expo-network';
import type { NetworkKind } from './policy';

export async function currentNetwork(): Promise<NetworkKind> {
  const s = await getNetworkStateAsync();
  if (s.isConnected === false) return 'none';
  if (s.type === NetworkStateType.WIFI) return 'wifi';
  if (s.type === NetworkStateType.CELLULAR) return 'cellular';
  return 'unknown';
}
