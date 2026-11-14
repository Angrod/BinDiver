import { useCallback } from 'react';
import { Vibration } from 'react-native';
import { useAudioPlayer } from 'expo-audio';

/** Returns a function that gives the vibration and/or the alert sound a signal plan asks for. */
export function useAlertSignal(): (plan: { vibrate: boolean; sound: boolean }) => void {
  const player = useAudioPlayer(require('../../assets/alert.wav'));
  return useCallback(
    (plan) => {
      if (plan.vibrate) {
        try {
          Vibration.vibrate(400);
        } catch (e) {
          console.warn('vibrate failed', e);
        }
      }
      if (plan.sound) {
        player.seekTo(0).then(() => player.play()).catch((e) => console.warn('alert sound failed', e));
      }
    },
    [player],
  );
}
