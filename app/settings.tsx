import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

export default function SettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.copy}>Account settings will live here.</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 32, fontWeight: '900', color: '#151722', letterSpacing: -1.2 },
  copy: { marginTop: 10, color: '#737883', fontSize: 16 },
});
