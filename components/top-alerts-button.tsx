import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PRIMARY_COLOR } from '@/constants/colors';
import { loadUnreadNotificationCount } from '@/lib/social';

export default function TopAlertsButton({ inviteCount = 0 }: { inviteCount?: number }) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Re-fetch the unread count every time the parent tab regains focus —
  // including the round-trip "open TMP_Navbar → press back → tab gets
  // focus again" sequence. That round-trip is what clears the dot after
  // the notification center has been opened. On top of that, poll every
  // 5s while this tab is actually focused, so the dot can appear live if
  // someone else triggers a notification while the user is just sitting
  // on the tab — the interval is torn down on blur/unmount, so it never
  // runs for a backgrounded tab.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        void loadUnreadNotificationCount().then((count) => {
          if (active) setUnreadCount(count);
        });
      };
      refresh();
      const interval = setInterval(refresh, 5000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, []),
  );

  const showBadge = inviteCount > 0;
  const showDot = !showBadge && unreadCount > 0;

  return (
    <TouchableOpacity activeOpacity={0.84} style={styles.button} onPress={() => router.push('/TMP_Navbar')}>
      <Ionicons name="notifications-outline" size={22} color="#161821" />
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: PRIMARY_COLOR }]}>
          <Text style={styles.badgeText}>{inviteCount > 9 ? '9+' : String(inviteCount)}</Text>
        </View>
      ) : null}
      {showDot ? <View style={[styles.dot, { backgroundColor: PRIMARY_COLOR }]} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#ff4f74',
    borderWidth: 2,
    borderColor: '#f5f6f8',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff4f74',
    borderWidth: 2,
    borderColor: '#f5f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
});
