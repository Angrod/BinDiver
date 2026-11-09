import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { codeLabel, formatCodeStatus, UpdateChecker } from './status';

/**
 * The grey line's note on which code is running. While mounted, it also checks for a newer update each
 * time the app comes back to the screen (at most once a minute), as the launch-time check does.
 */
export function useUpdateStatus(): string {
  const { currentlyRunning, isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const checker = new UpdateChecker({
      checkForUpdateAsync: () => Updates.checkForUpdateAsync(),
      fetchUpdateAsync: () => Updates.fetchUpdateAsync(),
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checker.check(Date.now());
    });
    return () => sub.remove();
  }, []);
  return formatCodeStatus(codeLabel(Updates.isEnabled, currentlyRunning), isUpdatePending);
}
