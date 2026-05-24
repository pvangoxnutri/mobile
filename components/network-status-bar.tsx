import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/lib/use-network-status';
import { useI18n } from '@/components/i18n-provider';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';

export function NetworkStatusBar() {
  const isConnected = useNetworkStatus();
  const { t } = useI18n();
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isConnected === false ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isConnected, heightAnim]);

  if (isConnected !== false) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          maxHeight: heightAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 100],
          }),
          opacity: heightAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 0.5, 1],
          }),
        },
      ]}>
      <View style={styles.content}>
        <Ionicons name="alert-circle" size={16} color="#fff" />
        <Text style={styles.text}>{t('common.check_internet')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ef4444',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
