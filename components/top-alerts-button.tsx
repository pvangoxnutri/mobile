import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export default function TopAlertsButton() {
  return (
    <TouchableOpacity activeOpacity={0.84} style={styles.button} onPress={() => router.push('/TMP_Navbar')}>
      <Ionicons name="notifications-outline" size={22} color="#161821" />
      <View style={styles.dot} />
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
});
