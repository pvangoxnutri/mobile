import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SideQuestForm, { type SideQuestFormHandle, type SideQuestFormValues } from '@/components/sidequest-form';
import { UnsavedChangesModal, useUnsavedChanges } from '@/components/unsaved-changes';
import { useI18n } from '@/components/i18n-provider';
import { apiJson } from '@/lib/api';
import { getCached, setCached } from '@/lib/cache';
import { extractLocationQuery, extractStoredMapPlace, stripLocationMarker } from '@/lib/sidequest-location';
import { extractFlightRoute, stripFlightMarkers } from '@/lib/flight-route';
import { extractBlur, stripBlurMarker, DEFAULT_BLUR } from '@/lib/activity-blur';
import type { Quest, SideQuestActivity } from '@/lib/types';
import { PRIMARY_COLOR } from '@/constants/colors';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design-tokens';

export default function NewSideQuestScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { id, editId, initialDate } = useLocalSearchParams<{ id: string; editId?: string; initialDate?: string }>();
  const [trip, setTrip] = useState<Quest | null>(null);
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<SideQuestFormHandle>(null);
  const isEditMode = !!editId;

  const unsaved = useUnsavedChanges({
    isDirty,
    onSave: async () => {
      const ok = await formRef.current?.submitSilently();
      return ok ?? false;
    },
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const tripUrl = `/api/trips/${id}`;
      const activityUrl = editId ? `/api/trips/${encodeURIComponent(id)}/activities/${encodeURIComponent(editId)}` : null;

      // Show cached data INSTANTLY — both the trip and (when editing) the
      // activity itself were almost certainly just fetched by the screen
      // the user came from, so there's no reason to blank out the form
      // behind a spinner while we silently re-confirm in the background.
      const cachedTrip = getCached<Quest>(tripUrl);
      const cachedActivity = activityUrl ? getCached<SideQuestActivity>(activityUrl) : null;
      if (cachedTrip) setTrip(cachedTrip);
      if (cachedActivity) setActivity(cachedActivity);
      setLoading(!cachedTrip || (Boolean(activityUrl) && !cachedActivity));

      const requests = [apiJson<Quest>(tripUrl)];

      if (activityUrl) {
        requests.push(apiJson<SideQuestActivity>(activityUrl));
      }

      void Promise.all(requests)
        .then((results) => {
          if (!active) return;
          setTrip(results[0]);
          setCached(tripUrl, results[0]);
          if (activityUrl && results[1]) {
            setActivity(results[1]);
            setCached(activityUrl, results[1]);
          }
          setError('');
        })
        .catch((err: Error) => {
          if (!active) return;
          setError(err.message || t('sidequest.form.loadDetailsFailed'));
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [id, editId, t]),
  );

  const initialValues = useMemo<Partial<SideQuestFormValues> | undefined>(() => {
    if (activity) {
      const flightRoute = extractFlightRoute(activity.description);
      return {
        title: activity.title ?? '',
        // Strip location, flight and blur markers so the editable description
        // shows only the human-written text.
        description: stripBlurMarker(stripFlightMarkers(stripLocationMarker(activity.description))) ?? '',
        category: activity.category ?? null,
        locationQuery: extractLocationQuery(activity.description),
        locationPlace: extractStoredMapPlace(activity.description),
        flightFrom: flightRoute.from,
        flightTo: flightRoute.to,
        blurAmount: extractBlur(activity.description) ?? DEFAULT_BLUR,
        date: activity.date,
        time: activity.time ?? '',
        visibility: activity.visibility,
        revealDate: activity.revealAt ? activity.revealAt.slice(0, 10) : activity.date,
        revealTime: activity.revealAt ? formatTimeForInput(activity.revealAt) : '18:00',
        teaser: activity.teaser ?? '',
        teaserOffsetMinutes: activity.teaserOffsetMinutes ?? 120,
        imageUrl: activity.imageUrl ?? null,
      };
    }

    if (initialDate) {
      return { date: initialDate };
    }

    return undefined;
  }, [activity, initialDate]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={unsaved.requestBack}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>{isEditMode ? t('sidequest.form.editActivityTitle') : t('sidequest.form.addActivity')}</Text>
            <Text style={styles.subtitle}>
              {isEditMode ? t('sidequest.form.editActivitySubtitle') : t('sidequest.form.addActivitySubtitle')}
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
            key={`${isEditMode ? 'edit' : 'create'}-${editId || 'new'}`}
            ref={formRef}
            mode={isEditMode ? 'edit' : 'create'}
            tripId={id}
            sideQuestId={editId}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            initialValues={isEditMode ? initialValues : undefined}
            initialImageUrl={isEditMode ? activity?.imageUrl : undefined}
            onDirtyChange={setIsDirty}
            onSaved={unsaved.markSaved}
          />
        ) : null}

        <UnsavedChangesModal
          visible={unsaved.modalOpen}
          busy={unsaved.busy}
          hasSave={true}
          onSave={unsaved.handleSave}
          onDiscard={unsaved.handleDiscard}
          onCancel={unsaved.handleCancel}
        />
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
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgLight,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.error,
    textAlign: 'center',
    fontSize: 15,
  },
});
