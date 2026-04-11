import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/contexts/app-theme-context';
import SideQuestForm from '@/components/sidequest-form';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';

export default function NewSideQuestScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Quest | null>(null);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;

      void apiJson<Quest>(`/api/trips/${id}`)
        .then((data) => {
          if (!active) return;
          setTrip(data);
          setError('');
        })
        .catch((err: Error) => {
          if (!active) return;
          setError(err.message || 'Unable to load trip details.');
        });

      return () => {
        active = false;
      };
    }, [id]),
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#11131a" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>Lägg till aktivitet</Text>
            <Text style={styles.subtitle}>Bygg något kul för den här resan.</Text>
          </View>
        </View>
        {trip ? (
          <SideQuestForm mode="create" tripId={id} tripStartDate={trip.startDate} tripEndDate={trip.endDate} />
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.primary} />
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f6f8',
  },
  title: {
    color: '#121317',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 4,
    color: '#79808c',
    fontSize: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#d53d18',
    textAlign: 'center',
    fontSize: 15,
  },
});
