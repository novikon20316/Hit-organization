import { useEffect } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export function useSafeKeepAwake() {
  useEffect(() => {
    const activate = async () => {
      try {
        await activateKeepAwakeAsync();
      } catch (e) {
        // Screen was off or locked — ignore safely
      }
    };

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') activate();
      else deactivateKeepAwake();
    });

    activate();

    return () => {
      subscription.remove();
      deactivateKeepAwake();
    };
  }, []);
}