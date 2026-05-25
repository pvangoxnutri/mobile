import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
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
import { useI18n } from '@/components/i18n-provider';
import { apiFetch, apiJson } from '@/lib/api';
import { buildGoogleMapsSearchUrl, extractLocationQuery, extractStoredMapPlace, stripLocationMarker } from '@/lib/sidequest-location';
import { useRevealAnimation } from '@/hooks/useMotion';
import type { ActivityComment, SideQuestActivity } from '@/lib/types';
import { COLORS } from '@/constants/design-tokens';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';

export default function SideQuestDetailScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { id, sidequestId } = useLocalSearchParams<{ id: string; sidequestId: string }>();
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [profileCardUserId, setProfileCardUserId] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Reveal animation for hidden SideQuest
  const { blurValue, contentTranslateY, contentOpacity, glowOpacity, startReveal } = useRevealAnimation({
    triggerHaptics: true,
  });
  const hasTriggeredReveal = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      hasTriggeredReveal.current = false;

      void Promise.all([
        apiJson<SideQuestActivity>(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}`),
        apiJson<ActivityComment[]>(`/api/trips/${id}/activities/${encodeURIComponent(sidequestId)}/comments`).catch(() => [] as ActivityComment[]),
      ])
        .then(([activityData, commentData]) => {
          if (!active) return;
          setActivity(activityData);
          setComments(commentData);
          setError('');
        })
        .catch((err: Error) => {
          if (!active) return;
          setError(err.message || 'Unable to load this SideQuest.');
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
  const cleanDescription = useMemo(() => stripLocationMarker(activity?.description), [activity?.description]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 34 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#11131a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('activity.sidequest')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={PRIMARY_COLOR} />
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : activity ? (
          <>
            {activity.imageUrl ? (
              <View style={styles.heroCard}>
                <Animated.View
                  style={{
                    opacity: contentOpacity,
                    transform: [{ translateY: contentTranslateY }],
                  }}>
                  <Image
                    source={{ uri: activity.imageUrl }}
                    style={styles.heroImage}
                    blurRadius={activity.isHiddenForViewer ? 22 : 0}
                  />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.heroOverlay,
                    activity.isHiddenForViewer ? styles.heroOverlayHidden : null,
                    { opacity: glowOpacity },
                  ]}
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
                  <Text style={styles.heroSubtitle}>
                    {activity.isHiddenForViewer
                      ? activity.teaserVisible && activity.teaser
                        ? activity.teaser
                        : t('activity.hidden_title')
                      : cleanDescription || t('activity.no_description')}
                  </Text>
                </Animated.View>
              </View>
            ) : (
              <View style={styles.heroCardNoImage}>
                <ActivityImageFallback category={activity.category} size="large" style={styles.heroFallback} />
              </View>
            )}

            <View style={styles.metaCard}>
              {!activity.imageUrl ? (
                <>
                  <View style={styles.statusRowNoImage}>
                    <StatusChip
                      label={activity.visibility === 'hidden' && !activity.isRevealed ? 'Hidden' : activity.ownerName || 'Visible'}
                      tone={activity.visibility === 'hidden' && !activity.isRevealed ? 'dark' : 'pink'}
                    />
                  </View>
                  <Text style={styles.titleNoImage}>{hiddenTitle}</Text>
                  <Text style={styles.descriptionNoImage}>
                    {activity.isHiddenForViewer
                      ? activity.teaserVisible && activity.teaser
                        ? activity.teaser
                        : t('activity.hidden_title')
                      : cleanDescription || t('activity.no_description')}
                  </Text>
                  {activity.canEdit ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.editButton}
                      onPress={() => {
                          router.push(`/trip/${encodeURIComponent(id)}/sidequest/new?editId=${encodeURIComponent(sidequestId)}`);
                        }}>
                      <Ionicons name="create-outline" size={16} color="#0d90a8" />
                      <Text style={styles.editButtonTextNoImage}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
              {activity.category ? (
                <MetaRow
                  icon="pricetag-outline"
                  label={t('activity.category')}
                  value={{
                    flight:    t('activity.category_flight'),
                    sidequest: t('activity.category_sidequest'),
                    food:      t('activity.category_food'),
                    sight:     t('activity.category_sight'),
                    other:     t('activity.category_other'),
                  }[activity.category] ?? activity.category}
                />
              ) : null}
              <MetaRow icon="calendar-outline" label={t('activity.date')} value={formatLongDate(activity.date)} />
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
                  <Ionicons name="map-outline" size={17} color={SECONDARY_COLOR} />
                  <Text style={styles.mapButtonText}>{t('activity.open_map')}{locationQuery}</Text>
                </TouchableOpacity>
              ) : null}
              {activity.canEdit && activity.teaser ? (
                <MetaRow icon="chatbubble-ellipses-outline" label={t('activity.teaser')} value={activity.teaser} />
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
                    placeholderTextColor="#aab0bc"
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => void submitComment()}
                  />
                  <TouchableOpacity
                    style={[styles.commentSend, { backgroundColor: PRIMARY_COLOR }, (!commentText.trim() || submitting) && styles.commentSendDisabled]}
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

function MetaRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>
        <Ionicons name={icon} size={18} color={PRIMARY_COLOR} />
      </View>
      <View style={styles.metaCopy}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'pink' | 'dark' }) {
  return (
    <View style={[styles.statusChip, tone === 'dark' ? styles.statusChipDark : styles.statusChipPink]}>
      <Text style={[styles.statusChipText, tone === 'dark' ? styles.statusChipTextLight : null]}>{label}</Text>
    </View>
  );
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function formatReveal(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fff',
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
    backgroundColor: '#f5f6f8',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
    color: '#121317',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  headerSpacer: {
    width: 42,
  },
  centerState: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#d53d18',
    fontSize: 15,
    textAlign: 'center',
  },
  heroCard: {
    minHeight: 360,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#edf1f4',
    justifyContent: 'flex-end',
  },
  heroCardNoImage: {
    minHeight: 360,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#edf1f4',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  heroFallback: {
    borderRadius: 34,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f4f7',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,24,31,0.20)',
  },
  heroOverlayHidden: {
    backgroundColor: 'rgba(20,24,31,0.38)',
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
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 18,
    gap: 16,
  },
  mapButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d6edf3',
    backgroundColor: '#f3fafc',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapButtonText: {
    flex: 1,
    color: '#0f6f82',
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#fff3f6',
    marginRight: 12,
  },
  metaCopy: {
    flex: 1,
  },
  metaLabel: {
    color: '#8a909b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  metaValue: {
    marginTop: 6,
    color: '#161821',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  commentsCard: {
    marginTop: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#eaedf2',
    backgroundColor: '#fff',
    padding: 18,
    gap: 14,
  },
  commentsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#8a909b',
    textTransform: 'uppercase',
  },
  commentsEmpty: {
    fontSize: 14,
    color: '#aab0bc',
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffe4ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  commentAvatarText: {
    color: '#c82f61',
    fontWeight: '800',
    fontSize: 14,
  },
  commentBody: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    color: '#161821',
  },
  commentText: {
    marginTop: 3,
    fontSize: 14,
    color: '#4a5060',
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
    borderColor: '#eaedf2',
    backgroundColor: '#f8f9fb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#161821',
  },
  commentSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ff4f74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendDisabled: {
    backgroundColor: '#f0c0cc',
  },
  statusRowNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleNoImage: {
    color: '#161821',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
  },
  descriptionNoImage: {
    marginBottom: 14,
    color: '#666d7a',
    fontSize: 16,
    lineHeight: 24,
  },
  editButtonTextNoImage: {
    color: '#0d90a8',
    fontSize: 13,
    fontWeight: '800',
  },
});
