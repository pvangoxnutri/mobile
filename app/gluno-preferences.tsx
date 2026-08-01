import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import GlunoPreferenceRow from '@/components/gluno/GlunoPreferenceRow';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  forgetGlunoPreference,
  getGlunoLearned,
  resolveGlunoCandidate,
  updateGlunoPreference,
  type GlunoLearned,
  type GlunoLearnedPreference,
  type GlunoPreferenceCandidate,
} from '@/lib/gluno-feedback';
import { setGlunoPreferenceVisibility } from '@/lib/gluno-group';
import { candidateValueLabel, comparePreferences, preferenceKeyLabel } from '@/lib/gluno-preference-display';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — what Gluno knows about me.
//
// Not a new feature. Every row here already existed in the database and was
// already shaping the plans people were being shown; the only thing missing
// was a way to look at it. That framing decides most of the design:
//
//   • Nothing on this screen is a marketing surface for the learning system.
//     No "Gluno is getting to know you", no counts, no confidence. It reads as
//     a settings list because that is what it is.
//
//   • FORGET is the primary control and is available on every row, including
//     the ones that cannot be edited. Being able to remove something you never
//     agreed to matters more than being able to fine-tune it.
//
//   • Candidates sit at the BOTTOM, phrased as a question, and are visually
//     lighter than confirmed rows. They are the one thing here Gluno is not
//     using yet, and the layout has to make that obvious without a paragraph
//     explaining it.
//
// Mutations are per-row: one failed save must not blank the screen, and one
// slow request must not freeze the others.
// ──────────────────────────────────────────────────────────────────────────

/** Long enough to survive a there-and-back; short enough to stay honest. */
const CACHE_TTL_MS = 30_000;

type CacheEntry = { data: GlunoLearned; at: number };

const cache = new Map<string, CacheEntry>();

function cacheKey(tripId?: string | null) {
  return tripId ?? 'global';
}

export default function GlunoPreferencesScreen() {
  const params = useLocalSearchParams<{ tripId?: string; conversationId?: string }>();
  const tripId = typeof params.tripId === 'string' && params.tripId ? params.tripId : null;
  const conversationId =
    typeof params.conversationId === 'string' && params.conversationId ? params.conversationId : null;

  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const cached = cache.get(cacheKey(tripId));

  const [learned, setLearned] = useState<GlunoLearned | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!cached);
  const [failed, setFailed] = useState(false);
  // Per row, so a slow save on one preference leaves the rest usable.
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(
    async (force: boolean) => {
      const entry = cache.get(cacheKey(tripId));
      if (!force && entry && Date.now() - entry.at < CACHE_TTL_MS) {
        setLearned(entry.data);
        setLoading(false);
        return;
      }

      setFailed(false);
      if (!entry) setLoading(true);

      try {
        const data = await getGlunoLearned(tripId);
        cache.set(cacheKey(tripId), { data, at: Date.now() });
        if (mounted.current) setLearned(data);
      } catch {
        // Only a hard failure when there is nothing to show. A stale list the
        // user can still act on beats an error page.
        if (mounted.current && !entry) setFailed(true);
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [tripId],
  );

  useEffect(() => { void load(false); }, [load]);

  const markBusy = useCallback((id: string, value: boolean) => {
    setBusy((previous) => ({ ...previous, [id]: value }));
  }, []);

  /**
   * Applies a mutation with an optimistic local update.
   *
   * The rollback is the point. A forget that failed server-side must not leave
   * the row hidden — somebody would walk away believing Gluno had stopped
   * using something it is still using.
   */
  const mutate = useCallback(
    async (id: string, optimistic: (current: GlunoLearned) => GlunoLearned, run: () => Promise<unknown>) => {
      if (busy[id] || !learned) return;

      const before = learned;
      const next = optimistic(before);

      markBusy(id, true);
      setLearned(next);
      cache.set(cacheKey(tripId), { data: next, at: Date.now() });

      try {
        await run();
        // The server is now the truth. Expiring rather than refetching keeps
        // this cheap; the next focus picks it up.
        cache.set(cacheKey(tripId), { data: next, at: 0 });
      } catch {
        if (mounted.current) {
          setLearned(before);
          cache.set(cacheKey(tripId), { data: before, at: 0 });
          Alert.alert(t('gluno.knows.saveFailed'));
        }
      } finally {
        if (mounted.current) markBusy(id, false);
      }
    },
    [busy, learned, markBusy, t, tripId],
  );

  const handleForget = useCallback(
    (preference: GlunoLearnedPreference) => {
      const body =
        preference.scope === 'trip'
          ? t('gluno.knows.forgetBodyTrip')
          : preference.scope === 'global'
            ? t('gluno.knows.forgetBodyGlobal')
            : t('gluno.knows.forgetBodyConversation');

      Alert.alert(t('gluno.knows.forgetTitle'), body, [
        { text: t('gluno.knows.cancel'), style: 'cancel' },
        {
          text: t('gluno.knows.forget'),
          style: 'destructive',
          onPress: () =>
            void mutate(
              preference.id,
              (current) => ({
                ...current,
                preferences: current.preferences.filter((row) => row.id !== preference.id),
              }),
              () => forgetGlunoPreference(preference.id),
            ),
        },
      ]);
    },
    [mutate, t],
  );

  const handleValue = useCallback(
    (preference: GlunoLearnedPreference, value: string) =>
      void mutate(
        preference.id,
        (current) => ({
          ...current,
          preferences: current.preferences.map((row) =>
            row.id === preference.id ? { ...row, value } : row),
        }),
        () => updateGlunoPreference(preference.id, { value }),
      ),
    [mutate],
  );

  /**
   * Widening a preference to every future trip.
   *
   * Behind its own confirmation, deliberately. This is the one change on the
   * screen that reaches beyond the Adventure the user is looking at, and a
   * small inline control is the wrong weight for it.
   */
  const handleMakeGlobal = useCallback(
    (preference: GlunoLearnedPreference) => {
      Alert.alert(t('gluno.knows.makeGlobalTitle'), t('gluno.knows.makeGlobalBody'), [
        { text: t('gluno.knows.cancel'), style: 'cancel' },
        {
          text: t('gluno.knows.makeGlobal'),
          onPress: () =>
            void mutate(
              preference.id,
              (current) => ({
                ...current,
                preferences: current.preferences.map((row) =>
                  row.id === preference.id
                    ? { ...row, scope: 'global', visibility: 'global_private', tripId: null }
                    : row),
              }),
              () => updateGlunoPreference(preference.id, { scope: 'global' }),
            ),
        },
      ]);
    },
    [mutate, t],
  );

  const handleVisibility = useCallback(
    (preference: GlunoLearnedPreference, share: boolean) => {
      const visibility = share ? 'trip_shared' : 'private';

      void mutate(
        preference.id,
        (current) => ({
          ...current,
          preferences: current.preferences.map((row) =>
            row.id === preference.id ? { ...row, visibility } : row),
        }),
        () => setGlunoPreferenceVisibility(preference.id, visibility as never),
      );
    },
    [mutate],
  );

  const handleCandidate = useCallback(
    (candidate: GlunoPreferenceCandidate, confirm: boolean, scope?: string) =>
      void mutate(
        candidate.id,
        (current) => ({
          ...current,
          // Off the list either way: a confirmed candidate reappears as a real
          // preference on the next load, and a dismissed one is never shown
          // again.
          candidates: current.candidates.filter((row) => row.id !== candidate.id),
        }),
        () => resolveGlunoCandidate(candidate.id, confirm, scope),
      ),
    [mutate],
  );

  const sections = useMemo(() => {
    const preferences = [...(learned?.preferences ?? [])].sort(comparePreferences);

    return {
      trip: preferences.filter((row) => row.scope === 'trip'),
      global: preferences.filter((row) => row.scope === 'global'),
      conversation: preferences.filter(
        (row) => row.scope === 'conversation'
          // Only THIS conversation's rows, when we know which one that is.
          // A preference from a conversation the user is not in reads as if
          // it applies here, and it does not.
          && (!conversationId || row.conversationId === conversationId),
      ),
      // Anything with a scope this build does not recognise still gets shown,
      // grouped neutrally rather than dropped.
      other: preferences.filter((row) => !['trip', 'global', 'conversation'].includes(row.scope)),
    };
  }, [conversationId, learned]);

  const candidates = learned?.candidates ?? [];

  const tripTitle = useMemo(
    () => learned?.trips?.find((trip) => trip.id === tripId)?.title ?? null,
    [learned, tripId],
  );

  const isEmpty =
    !loading
    && !failed
    && sections.trip.length === 0
    && sections.global.length === 0
    && sections.conversation.length === 0
    && sections.other.length === 0
    && candidates.length === 0;

  const renderRows = (rows: GlunoLearnedPreference[], title: string) =>
    rows.length === 0 ? null : (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rows.map((preference) => (
          <GlunoPreferenceRow
            key={preference.id}
            preference={preference}
            tripTitle={preference.tripId === tripId ? tripTitle : null}
            busy={Boolean(busy[preference.id])}
            onChangeValue={handleValue}
            onForget={handleForget}
            onMakeGlobal={handleMakeGlobal}
            onChangeVisibility={handleVisibility}
          />
        ))}
      </View>
    );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 18) + 4 }]}>
        <TouchableOpacity
          style={styles.headerButton}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={23} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>{t('gluno.knows.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : failed ? (
        <View style={styles.centre}>
          <Text style={styles.message}>{t('gluno.knows.loadFailed')}</Text>
          <TouchableOpacity
            style={styles.retry}
            activeOpacity={0.85}
            accessibilityRole="button"
            onPress={() => void load(true)}>
            <Text style={styles.retryText}>{t('gluno.knows.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}>
          {/* Short and calm, at the top where it frames the list rather than
              at the bottom where it reads as a disclaimer. */}
          <Text style={styles.privacy}>{t('gluno.knows.privacy')}</Text>

          {isEmpty ? (
            <Text style={styles.empty}>{t('gluno.knows.empty')}</Text>
          ) : (
            <>
              {renderRows(sections.trip, t('gluno.knows.sectionTrip'))}
              {renderRows(sections.global, t('gluno.knows.sectionGlobal'))}
              {renderRows(sections.conversation, t('gluno.knows.sectionConversation'))}
              {renderRows(sections.other, t('gluno.knows.scopeUnknown'))}

              {candidates.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('gluno.knows.sectionCandidates')}</Text>
                  <Text style={styles.candidateLead}>{t('gluno.knows.candidateLead')}</Text>

                  {candidates.map((candidate) => (
                    <View key={candidate.id} style={styles.candidate}>
                      <Text style={styles.candidateKey}>
                        {preferenceKeyLabel(candidate.key, t)}
                      </Text>
                      <Text style={styles.candidateValue}>
                        {candidateValueLabel(candidate.key, candidate.proposedValue, t)}
                      </Text>

                      <View style={styles.candidateActions}>
                        {candidate.tripId ? (
                          <TouchableOpacity
                            style={[styles.candidateButton, styles.candidateButtonPrimary]}
                            activeOpacity={0.85}
                            disabled={Boolean(busy[candidate.id])}
                            accessibilityRole="button"
                            onPress={() => handleCandidate(candidate, true, 'trip')}>
                            <Text style={styles.candidateButtonPrimaryText}>
                              {t('gluno.knows.candidateUseTrip')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}

                        {/* Distinct and more deliberate than the trip choice —
                            it reaches every future Adventure. */}
                        <TouchableOpacity
                          style={[styles.candidateButton, !candidate.tripId && styles.candidateButtonPrimary]}
                          activeOpacity={0.85}
                          disabled={Boolean(busy[candidate.id])}
                          accessibilityRole="button"
                          onPress={() => handleCandidate(candidate, true, 'global')}>
                          <Text
                            style={
                              candidate.tripId
                                ? styles.candidateButtonText
                                : styles.candidateButtonPrimaryText
                            }>
                            {t('gluno.knows.candidateUseGlobal')}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.candidateButton}
                          activeOpacity={0.85}
                          disabled={Boolean(busy[candidate.id])}
                          accessibilityRole="button"
                          onPress={() => handleCandidate(candidate, false)}>
                          <Text style={styles.candidateButtonText}>
                            {t('gluno.knows.candidateDismiss')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.bgPrimary,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    color: theme.colors.textSecondary,
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.white,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  privacy: {
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textMeta,
    marginBottom: 20,
  },
  empty: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    marginTop: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.textMeta,
    marginBottom: 8,
  },
  candidateLead: {
    fontSize: 12.5,
    lineHeight: 18,
    color: theme.colors.textMeta,
    marginBottom: 10,
  },
  candidate: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: theme.colors.bgLight,
    // No border and a flatter fill than a confirmed row: this is the one
    // thing on the screen Gluno is not using yet.
    borderWidth: 0,
  },
  candidateKey: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  candidateValue: {
    marginTop: 2,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  candidateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  candidateButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLightest,
  },
  candidateButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  candidateButtonText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  candidateButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.white,
  },
});
