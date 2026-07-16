import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import UserProfileCard from '@/components/user-profile-card';
import ActivityImageFallback from '@/components/activity-image-fallback';
import HeroShell from '@/components/hero-shell';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/i18n-provider';
import { apiFetch, apiJson } from '@/lib/api';
import { formatNights, isStay, stayNights } from '@/lib/stay';
import { getCached, setCached, invalidateCache, invalidateTripCache } from '@/lib/cache';
import { getCategoryLabel, getCategorySymbol } from '@/lib/category-symbol';
import { buildGoogleMapsSearchUrl, extractLocationQuery, extractStoredMapPlace, stripLocationMarker } from '@/lib/sidequest-location';
import { extractFlightRoute, formatFlightRoute, hasFlightRoute, stripFlightMarkers } from '@/lib/flight-route';
import { extractBlur, stripBlurMarker, DEFAULT_BLUR } from '@/lib/activity-blur';
import { useRevealAnimation } from '@/hooks/useMotion';
import { useKeyboardFocusScroll } from '@/hooks/useKeyboardFocusScroll';
import type { ActivityComment, SideQuestActivity } from '@/lib/types';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

function stripLeadingEmoji(text: string): string {
  return text.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
}

export default function SideQuestDetailScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { id, sidequestId } = useLocalSearchParams<{ id: string; sidequestId: string }>();
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { scrollRef, onFocusField, scrollViewProps } = useKeyboardFocusScroll();

  // Reveal animation for hidden SideQuest
  const { blurValue, contentTranslateY, contentOpacity, glowOpacity, startReveal } = useRevealAnimation({
    triggerHaptics: true,
  });
  const hasTriggeredReveal = useRef(false);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      let active = true;
      hasTriggeredReveal.current = false;

      const activityUrl = `/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`;
      const commentsUrl = `${activityUrl}/comments`;

      // Show cached data INSTANTLY so revisiting an already-opened activity
      // doesn't flash a loading state — then refetch in the background.
      const cachedActivity = getCached<SideQuestActivity>(activityUrl);
      const cachedComments = getCached<ActivityComment[]>(commentsUrl);
      setNotFound(false);
      if (cachedActivity) {
        setActivity(cachedActivity);
        setComments(cachedComments ?? []);
        setError('');
        setLoading(false);
      } else {
        setLoading(true);
      }

      void Promise.all([
        apiJson<SideQuestActivity>(activityUrl),
        apiJson<ActivityComment[]>(commentsUrl).catch(() => [] as ActivityComment[]),
      ])
        .then(([activityData, commentData]) => {
          if (!active) return;
          setActivity(activityData);
          setComments(commentData);
          setError('');
          setCached(activityUrl, activityData);
          setCached(commentsUrl, commentData);
        })
        .catch((err: Error & { status?: number }) => {
          if (!active) return;
          // A 404 here usually means a stale notification/link pointing at an
          // activity that's since been deleted (by its owner, or because the
          // trip ended) — that's an expected, recoverable state, not an
          // error worth alarming the user with.
          if (err.status === 404) {
            setNotFound(true);
            setError('');
            return;
          }
          if (!cachedActivity) {
            setError(err.message || 'Unable to load this SideQuest.');
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [id, sidequestId]),
  );

  // Trigger reveal animation when activity becomes visible (not hidden for viewer)
  useEffect(() => {
    if (activity && activity.imageUrl && !activity.isHiddenForViewer && !hasTriggeredReveal.current) {
      hasTriggeredReveal.current = true;
      startReveal();
    }
  }, [activity, startReveal]);

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (response.ok) {
        const newComment = await response.json() as ActivityComment;
        setComments((prev) => [...prev, newComment]);
        setCommentText('');
        inputRef.current?.blur();
      }
    } finally {
      setSubmitting(false);
    }
  }, [commentText, submitting, id, sidequestId]);

  const hiddenTitle = useMemo(() => {
    if (!activity) return 'Hidden SideQuest';
    return activity.title ?? 'Hidden SideQuest';
  }, [activity]);
  const locationQuery = useMemo(() => extractLocationQuery(activity?.description), [activity?.description]);
  const locationPlace = useMemo(() => extractStoredMapPlace(activity?.description), [activity?.description]);
  const flightRoute = useMemo(() => extractFlightRoute(activity?.description), [activity?.description]);
  const showFlightRoute = activity?.category === 'flight' && hasFlightRoute(flightRoute);
  const cleanDescription = useMemo(
    () => stripBlurMarker(stripFlightMarkers(stripLocationMarker(activity?.description))),
    [activity?.description],
  );
  const revealBlur = useMemo(() => extractBlur(activity?.description) ?? DEFAULT_BLUR, [activity?.description]);

  // Reveal-now is creator-only. The PATCH endpoint already flips visibility to
  // public and stamps RevealedAt server-side when { revealedNow: true } is
  // sent. We additionally gate the button in the UI by:
  //   1. activity is hidden
  //   2. activity is not yet revealed
  //   3. current user is the creator (owner)
  // so non-creators never see it. The owner id and user id are both the
  // Supabase user id (see AuthController.GetOrCreateCurrentUserAsync +
  // TripsController.AddActivity), compared case-insensitively as a guard
  // against any UUID casing differences.
  const isOwner = Boolean(
    user?.id &&
    activity?.ownerId &&
    activity.ownerId.toLowerCase() === user.id.toLowerCase(),
  );
  const isHidden = activity?.visibility === 'hidden';
  const alreadyRevealed = Boolean(activity?.isRevealed);
  const canRevealNow = isHidden && !alreadyRevealed && isOwner;

  const handleRevealNow = useCallback(async () => {
    if (revealing) return;
    setRevealing(true);
    try {
      const response = await apiFetch(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revealedNow: true }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || 'Could not reveal this SideQuest.');
      }
      invalidateTripCache(id);
      // Re-fetch so the screen reflects the now-public state.
      const fresh = await apiJson<SideQuestActivity>(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`);
      setActivity(fresh);
      setCached(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`, fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal this SideQuest.');
    } finally {
      setRevealing(false);
    }
  }, [id, sidequestId, revealing]);

  const handleDelete = useCallback(() => {
    if (deleting) return;
    Alert.alert(
      t('activity.deleteConfirmTitle'),
      t('activity.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                const response = await apiFetch(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`, {
                  method: 'DELETE',
                });
                if (!response.ok && response.status !== 404) {
                  throw new Error((await response.text()) || 'Could not delete this SideQuest.');
                }
                const activitiesUrl = `/api/trips/${id}/activities`;
                const cached = getCached<SideQuestActivity[]>(activitiesUrl);
                if (cached) {
                  setCached(activitiesUrl, cached.filter((a) => a.id !== sidequestId));
                }
                invalidateCache('/api/trips/events/me');
                router.replace(`/trip/${encodeURIComponent(id)}`);
              } catch (err) {
                setDeleting(false);
                setError(err instanceof Error ? err.message : 'Could not delete this SideQuest.');
              }
            })();
          },
        },
      ],
    );
  }, [id, sidequestId, deleting, t]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.screenBackground} behavior="padding">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 34 }]}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={theme.isDark ? theme.colors.textPrimary : '#11131a'} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('activity.sidequest')}</Text>
          {activity?.canEdit ? (
            <TouchableOpacity
              style={styles.deleteButton}
              activeOpacity={0.88}
              disabled={deleting}
              onPress={handleDelete}>
              {deleting ? (
                <ActivityIndicator size="small" color={theme.isDark ? theme.colors.error : '#d92d4c'} />
              ) : (
                <Ionicons name="trash-outline" size={20} color={theme.isDark ? theme.colors.error : '#d92d4c'} />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.deleteButton}
              activeOpacity={0.88}
              onPress={() => {
                if (!sidequestId) return;
                const reasonKeys = ['spam', 'harassment', 'offensive', 'explicit', 'other'] as const;
                Alert.alert(
                  t('report.title'),
                  undefined,
                  [
                    ...reasonKeys.map((reason) => ({
                      text: t(`report.reason.${reason}`),
                      onPress: () => {
                        void apiFetch('/api/reports', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contentType: 'activity', contentId: sidequestId, reason }),
                        }).then(() => Alert.alert(t('report.success'))).catch(() => Alert.alert(t('report.failed')));
                      },
                    })),
                    { text: t('common.cancel'), style: 'cancel' as const },
                  ],
                );
              }}>
              <Ionicons name="flag-outline" size={20} color={theme.colors.textMeta} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : notFound ? (
          <View style={styles.centerState}>
            <Ionicons name="compass-outline" size={40} color={theme.colors.textMeta} />
            <Text style={styles.notFoundTitle}>{t('activity.notFoundTitle')}</Text>
            <Text style={styles.notFoundBody}>{t('activity.notFoundBody')}</Text>
            <TouchableOpacity
              style={styles.notFoundButton}
              activeOpacity={0.85}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace(`/trip/${encodeURIComponent(id)}`);
                }
              }}>
              <Text style={styles.notFoundButtonText}>{t('common.goBack')}</Text>
            </TouchableOpacity>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : activity ? (
          <>
            <HeroShell
              imageUrl={activity.imageUrl}
              imageBlurRadius={activity.isHiddenForViewer ? revealBlur : 0}
              fallback={<ActivityImageFallback category={activity.category} size="hero" />}
              style={styles.heroCardSize}>
              {/* Optional glow pulse on top of the gradient during reveal */}
              <Animated.View
                pointerEvents="none"
                style={[styles.heroGlow, { opacity: glowOpacity }]}
              />
              {activity.canEdit ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.editButtonFloating}
                  onPress={() => {
                        router.push(`/trip/${encodeURIComponent(id)}/sidequest/new?editId=${encodeURIComponent(sidequestId)}`);
                      }}>
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
              <Animated.View
                style={[
                  styles.heroContent,
                  {
                    opacity: contentOpacity,
                    transform: [{ translateY: contentTranslateY }],
                  },
                ]}>
                <View style={styles.statusRow}>
                  <StatusChip
                    label={activity.visibility === 'hidden' && !activity.isRevealed ? 'Hidden' : activity.ownerName || 'Visible'}
                    tone={activity.visibility === 'hidden' && !activity.isRevealed ? 'dark' : 'pink'}
                  />
                </View>
                <Text style={styles.heroTitle}>{hiddenTitle}</Text>
                {/* No placeholder when the description is empty — an absent
                    subtitle reads better than "No extra description yet." */}
                {activity.isHiddenForViewer ? (
                  <Text style={styles.heroSubtitle}>
                    {activity.teaserVisible && activity.teaser ? activity.teaser : t('activity.hidden_title')}
                  </Text>
                ) : cleanDescription ? (
                  <Text style={styles.heroSubtitle}>{cleanDescription}</Text>
                ) : null}
              </Animated.View>
            </HeroShell>

            <View style={styles.metaCard}>
              {!activity.imageUrl ? (
                <>
                  <View style={styles.statusRowNoImage}>
                    {/* On the card surface (no photo behind it) the chip is
                        themed; the hero copy above stays on-photo styled. */}
                    <StatusChip
                      label={activity.visibility === 'hidden' && !activity.isRevealed ? 'Hidden' : activity.ownerName || 'Visible'}
                      tone={activity.visibility === 'hidden' && !activity.isRevealed ? 'dark' : 'pink'}
                      onSurface
                    />
                  </View>
                  <Text style={styles.titleNoImage}>{hiddenTitle}</Text>
                  {activity.isHiddenForViewer ? (
                    <Text style={styles.descriptionNoImage}>
                      {activity.teaserVisible && activity.teaser ? activity.teaser : t('activity.hidden_title')}
                    </Text>
                  ) : cleanDescription ? (
                    <Text style={styles.descriptionNoImage}>{cleanDescription}</Text>
                  ) : null}
                  {activity.canEdit ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.editButton}
                      onPress={() => {
                          router.push(`/trip/${encodeURIComponent(id)}/sidequest/new?editId=${encodeURIComponent(sidequestId)}`);
                        }}>
                      <Ionicons name="create-outline" size={16} color={theme.colors.secondary} />
                      <Text style={styles.editButtonTextNoImage}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
              {activity.category ? (() => {
                const symbol = getCategorySymbol(activity.category);
                // Custom categories show the user's name; built-in ones show
                // their localized label.
                const value = getCategoryLabel(activity.category, activity.customCategoryLabel, t)
                  ?? stripLeadingEmoji(t(symbol.labelKey));
                return (
                  <MetaRow
                    icon={symbol.icon}
                    iconColor={symbol.iconColor}
                    label={t('activity.category')}
                    value={value}
                  />
                );
              })() : null}
              {showFlightRoute ? (
                <MetaRow
                  icon="airplane"
                  iconColor={theme.colors.secondary}
                  label={t('activity.flightRoute')}
                  value={formatFlightRoute(flightRoute)}
                />
              ) : null}
              {isStay(activity) ? (
                <>
                  {/* Hotel stay: the single date row becomes an explicit
                      reservation — check-in / check-out / length. Times are
                      shown only when set; a stay-less hotel renders exactly
                      like any other activity via the else-branch. */}
                  <MetaRow
                    icon="log-in-outline"
                    label={t('activity.checkIn')}
                    value={activity.time ? `${formatLongDate(activity.date)} · ${activity.time}` : formatLongDate(activity.date)}
                  />
                  <MetaRow
                    icon="log-out-outline"
                    label={t('activity.checkOut')}
                    value={activity.endTime ? `${formatLongDate(activity.endDate!)} · ${activity.endTime}` : formatLongDate(activity.endDate!)}
                  />
                  <MetaRow icon="bed-outline" label={t('activity.stay.lengthLabel')} value={formatNights(stayNights(activity), t)} />
                </>
              ) : (
                <MetaRow icon="calendar-outline" label={t('activity.date')} value={formatLongDate(activity.date)} />
              )}
              {activity.visibility === 'hidden' && activity.revealAt ? (
                <MetaRow icon="sparkles-outline" label={t('activity.reveal')} value={formatReveal(activity.revealAt)} />
              ) : null}
              <MetaRow icon="eye-outline" label={t('activity.visibility')} value={activity.visibility === 'hidden' ? t('activity.hidden_until_reveal') : t('activity.public')} />
              {locationQuery ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={styles.mapButton}
                  onPress={() => {
                    const url = buildGoogleMapsSearchUrl(locationQuery, locationPlace);
                    if (Platform.OS === 'web') {
                      window.open(url, '_blank');
                    } else {
                      void Linking.openURL(url);
                    }
                  }}>
                  <Ionicons name="map-outline" size={17} color={theme.colors.secondary} />
                  <Text style={styles.mapButtonText}>{t('activity.open_map')}{locationQuery}</Text>
                </TouchableOpacity>
              ) : null}
              {activity.canEdit && activity.teaser ? (
                <MetaRow icon="chatbubble-ellipses-outline" label={t('activity.teaser')} value={activity.teaser} />
              ) : null}

              {canRevealNow ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.revealNowButton, revealing ? styles.revealNowButtonBusy : null]}
                  disabled={revealing}
                  onPress={() => void handleRevealNow()}>
                  <Ionicons name="flash" size={17} color="#fff" />
                  <Text style={styles.revealNowButtonText}>
                    {revealing ? t('activity.revealingNow') : t('activity.revealNow')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {activity.visibility === 'public' ? (
              <View style={styles.commentsCard}>
                <Text style={styles.commentsTitle}>{t('activity.comments')}</Text>

                {comments.length === 0 ? (
                  <Text style={styles.commentsEmpty}>{t('activity.no_comments')}</Text>
                ) : (
                  comments.map((c) => (
                    <View key={c.id} style={styles.commentItem}>
                      <TouchableOpacity
                        style={styles.commentAvatar}
                        activeOpacity={0.7}
                        onPress={() => setProfileCardUserId(c.userId)}>
                        {c.userAvatarUrl
                          ? <Image source={{ uri: c.userAvatarUrl }} style={styles.commentAvatarImage} />
                          : <Text style={styles.commentAvatarText}>{c.userName.charAt(0).toUpperCase()}</Text>}
                      </TouchableOpacity>
                      <View style={styles.commentBody}>
                        <Text style={styles.commentAuthor}>{c.userName}</Text>
                        <Text style={styles.commentText}>{c.text}</Text>
                      </View>
                    </View>
                  ))
                )}

                <View style={styles.commentInputRow}>
                  <TextInput
                    ref={inputRef}
                    style={styles.commentInput}
                    placeholder={t('activity.write_comment')}
                    placeholderTextColor={theme.isDark ? theme.colors.placeholderText : '#aab0bc'}
                    keyboardAppearance={theme.keyboardAppearance}
                    value={commentText}
                    onChangeText={setCommentText}
                    onFocus={onFocusField(inputRef)}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => void submitComment()}
                  />
                  <TouchableOpacity
                    style={[styles.commentSend, { backgroundColor: theme.colors.primary }, (!commentText.trim() || submitting) && styles.commentSendDisabled]}
                    activeOpacity={0.8}
                    onPress={() => void submitComment()}
                    disabled={!commentText.trim() || submitting}>
                    {submitting
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="send" size={16} color="#fff" />}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      <UserProfileCard userId={profileCardUserId} onClose={() => setProfileCardUserId(null)} />
    </>
  );
}

function MetaRow({ icon, label, value, iconColor }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; iconColor?: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>
        <Ionicons name={icon} size={18} color={iconColor ?? theme.colors.primary} />
      </View>
      <View style={styles.metaCopy}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

// The chip renders in two worlds: on the hero photo (default) where it keeps
// its on-photo styling byte-identical in both themes, and on the meta card
// surface (`onSurface`, no-image variant) where dark mode swaps to themed
// fills — light mode resolves to the exact same literals either way.
function StatusChip({ label, tone, onSurface }: { label: string; tone: 'pink' | 'dark'; onSurface?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View
      style={[
        styles.statusChip,
        tone === 'dark'
          ? (onSurface ? styles.statusChipDarkOnSurface : styles.statusChipDark)
          : (onSurface ? styles.statusChipPinkOnSurface : styles.statusChipPink),
      ]}>
      <Text
        style={[
          styles.statusChipText,
          tone === 'dark'
            ? (onSurface ? styles.statusChipTextLightOnSurface : styles.statusChipTextLight)
            : (onSurface ? styles.statusChipTextPinkOnSurface : null),
        ]}>
        {label}
      </Text>
    </View>
  );
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function formatReveal(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // On the outer flex:1 container, not just the ScrollView's content box —
  // otherwise, whenever content is shorter than the screen (e.g. the
  // loading spinner), the area below it falls through to the navigator's
  // own default screen background instead of staying the page color.
  screenBackground: {
    flex: 1,
    backgroundColor: theme.colors.bgPrimary,
  },
  screen: {
    paddingHorizontal: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.bgLight : '#f5f6f8',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
    color: theme.isDark ? theme.colors.textPrimary : '#121317',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerSpacer: {
    width: 42,
  },
  deleteButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    // Destructive-tinted circle — errorLight is a translucent red wash in dark.
    backgroundColor: theme.isDark ? theme.colors.errorLight : '#fdeaee',
  },
  centerState: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 15,
    textAlign: 'center',
  },
  notFoundTitle: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  notFoundBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMeta,
    textAlign: 'center',
  },
  notFoundButton: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  notFoundButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.white,
  },
  heroCardSize: {
    minHeight: 360,
    justifyContent: 'flex-end',
  },
  // On-photo reveal glow — identical in both themes, like every overlay that
  // sits on the hero image rather than on a themed surface.
  heroGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,24,31,0.16)',
  },
  heroContent: {
    padding: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // On-photo chips (hero) — byte-identical in both themes.
  statusChipPink: {
    backgroundColor: '#ffe4ec',
  },
  statusChipDark: {
    backgroundColor: 'rgba(17,19,25,0.62)',
  },
  statusChipText: {
    color: '#c82f61',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  statusChipTextLight: {
    color: '#fff',
  },
  // On-surface chips (no-image meta card) — light keeps the exact hero
  // literals; dark swaps to themed fills so the chip sits on the card
  // instead of glaring. The "Hidden" chip uses the app-wide sealed family
  // (see components/hidden-sidequest-card.tsx), never the stay* amber.
  statusChipPinkOnSurface: {
    backgroundColor: theme.isDark ? theme.colors.avatarLight : '#ffe4ec',
  },
  statusChipDarkOnSurface: {
    backgroundColor: theme.isDark ? theme.colors.sealedSurface : 'rgba(17,19,25,0.62)',
  },
  statusChipTextPinkOnSurface: {
    color: theme.isDark ? theme.colors.primary : '#c82f61',
  },
  statusChipTextLightOnSurface: {
    color: theme.isDark ? theme.colors.textPrimary : '#fff',
  },
  // Floating edit pill on the hero photo — on-photo constants, both themes.
  editButtonFloating: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(17,19,25,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroSubtitle: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    lineHeight: 24,
  },
  metaCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eaedf2',
    backgroundColor: theme.isDark ? theme.colors.surface : '#fff',
    padding: 18,
    gap: 16,
  },
  // Teal-tinted "open in maps" row — dark uses a translucent wash of the
  // (lifted) dark secondary, mirroring the trip screen's teal fills.
  mapButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(34,174,199,0.32)' : '#d6edf3',
    backgroundColor: theme.isDark ? 'rgba(34,174,199,0.14)' : '#f3fafc',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapButtonText: {
    flex: 1,
    color: theme.isDark ? theme.colors.secondary : '#0f6f82',
    fontSize: 13,
    fontWeight: '700',
  },
  revealNowButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Brand-pink glow stays in both themes (stronger on iOS in dark);
    // Android elevation is zeroed in dark — it renders muddy gray there.
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: theme.isDark ? 0.45 : 0.22,
    shadowRadius: 18,
    elevation: theme.isDark ? 0 : 6,
  },
  revealNowButtonBusy: {
    opacity: 0.7,
  },
  revealNowButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metaIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.isDark ? theme.colors.primaryLight12 : '#fff3f6',
    marginRight: 12,
  },
  metaCopy: {
    flex: 1,
  },
  metaLabel: {
    color: theme.isDark ? theme.colors.textMeta : '#8a909b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  metaValue: {
    marginTop: 6,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  commentsCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderPrimary : '#eaedf2',
    backgroundColor: theme.isDark ? theme.colors.surface : '#fff',
    padding: 18,
    gap: 14,
  },
  commentsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: theme.isDark ? theme.colors.textMeta : '#8a909b',
    textTransform: 'uppercase',
  },
  commentsEmpty: {
    fontSize: 14,
    color: theme.isDark ? theme.colors.textMuted : '#aab0bc',
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    // Pink avatar-fallback family — a translucent pink wash in dark.
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.isDark ? theme.colors.avatarLight : '#ffe4ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  commentAvatarText: {
    color: theme.isDark ? theme.colors.primary : '#c82f61',
    fontWeight: '800',
    fontSize: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  commentText: {
    marginTop: 3,
    fontSize: 14,
    color: theme.isDark ? theme.colors.textSecondary : '#4a5060',
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.isDark ? theme.colors.borderInput : '#eaedf2',
    backgroundColor: theme.isDark ? theme.colors.bgLightest : '#f8f9fb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  commentSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendDisabled: {
    // Light keeps the washed-out solid pink; dark uses a translucent pink so
    // the disabled state recedes instead of glowing on the dark card.
    backgroundColor: theme.isDark ? 'rgba(255,79,116,0.35)' : '#f0c0cc',
  },
  statusRowNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleNoImage: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  descriptionNoImage: {
    marginBottom: 14,
    color: theme.isDark ? theme.colors.textSecondary : '#666d7a',
    fontSize: 16,
    lineHeight: 24,
  },
  editButtonTextNoImage: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '800',
  },
});
