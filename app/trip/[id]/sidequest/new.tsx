import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SideQuestForm, { type SideQuestFormValues } from '@/components/sidequest-form';
import { apiJson } from '@/lib/api';
import { extractLocationQuery, extractStoredMapPlace, stripLocationMarker } from '@/lib/sidequest-location';
import type { Quest, SideQuestActivity } from '@/lib/types';
import { PRIMARY_COLOR } from '@/constants/colors';

export default function NewSideQuestScreen() {
  const insets = useSafeAreaInsets();
  const { id, editId } = useLocalSearchParams<{ id: string; editId?: string }>();
  const [trip, setTrip] = useState<Quest | null>(null);
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isEditMode = !!editId;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      const requests = [apiJson<Quest>(`/api/trips/${id}`)];

      if (editId) {
        requests.push(
          apiJson<SideQuestActivity>(
            `/api/trips/${encodeURIComponent(id)}/activities/${encodeURIComponent(editId)}`
          )
        );
      }

      void Promise.all(requests)
        .then((results) => {
          if (!active) return;
          setTrip(results[0]);
          if (editId && results[1]) {
            setActivity(results[1]);
          }
          setError('');
        })
        .catch((err: Error) => {
          if (!active) return;
          setError(err.message || 'Unable to load details.');
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [id, editId]),
  );

  const initialValues = useMemo<Partial<SideQuestFormValues> | undefined>(() => {
    if (!activity) return undefined;

    return {
      title: activity.title ?? '',
      description: stripLocationMarker(activity.description) ?? '',
      category: activity.category ?? null,
      locationQuery: extractLocationQuery(activity.description),
      locationPlace: extractStoredMapPlace(activity.description),
      date: activity.date,
      visibility: activity.visibility,
      revealDate: activity.revealAt ? activity.revealAt.slice(0, 10) : activity.date,
      revealTime: activity.revealAt ? formatTimeForInput(activity.revealAt) : '18:00',
      teaser: activity.teaser ?? '',
      teaserOffsetMinutes: activity.teaserOffsetMinutes ?? 120,
      imageUrl: activity.imageUrl ?? null,
    };
  }, [activity]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#11131a" />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>{isEditMode ? 'Redigera aktivitet' : 'Lägg till aktivitet'}</Text>
            <Text style={styles.subtitle}>
              {isEditMode ? 'Resans medlemmar kan uppdatera planen tillsammans.' : 'Bygg något kul för den här resan.'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={PRIMARY_COLOR} />
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : trip && (isEditMode ? activity && initialValues : true) ? (
          <SideQuestForm
            mode={isEditMode ? 'edit' : 'create'}
            tripId={id}
            sideQuestId={editId}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            initialValues={isEditMode ? initialValues : undefined}
            initialImageUrl={isEditMode ? activity?.imageUrl : undefined}
          />
        ) : null}
      </View>
    </>
  );
}

function formatTimeForInput(value: string) {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
