import { ScrollView, StyleSheet, Text } from 'react-native';

export default function AlertsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.copy}>Notifications and quest updates will show up here.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#121317',
    letterSpacing: -1.2,
  },
  copy: {
    marginTop: 10,
    fontSize: 16,
    color: '#737883',
    textAlign: 'center',
  },
});
