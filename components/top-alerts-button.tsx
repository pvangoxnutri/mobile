import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '@/contexts/app-theme-context';

export default function TopAlertsButton({ inviteCount = 0 }: { inviteCount?: number }) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity activeOpacity={0.84} style={styles.button} onPress={() => router.push('/TMP_Navbar')}>
      <Ionicons name="notifications-outline" size={22} color="#161821" />
      {inviteCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.primary }]}>
          <Text style={styles.badgeText}>{inviteCount > 9 ? '9+' : String(inviteCount)}</Text>
        </View>
      ) : (
        <View style={[styles.dot, { backgroundColor: theme.primary }]} />
      )}
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
