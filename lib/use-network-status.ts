import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      // Check initial state
      const state = await NetInfo.fetch();
      setIsConnected(state.isConnected ?? false);

      // Subscribe to changes
      unsubscribe = NetInfo.addEventListener((state) => {
        setIsConnected(state.isConnected ?? false);
      });
    };

    void setupListener();

    return () => {
      unsubscribe?.();
    };
  }, []);

  return isConnected;
}
