import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch, apiJson } from '@/lib/api';
import { buildGoogleMapsSearchUrl, extractLocationQuery, extractStoredMapPlace, stripLocationMarker } from '@/lib/sidequest-location';
import type { ActivityComment, SideQuestActivity } from '@/lib/types';

export default function SideQuestDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, sidequestId } = useLocalSearchParams<{ id: string; sidequestId: string }>();
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<ActivityComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      void Promise.all([
        apiJson<SideQuestActivity>(`/api/trips/${id}/activities/${sidequestId}`),
        apiJson<ActivityComment[]>(`/api/trips/${id}/activities/${sidequestId}/comments`).catch(() => [] as ActivityComment[]),
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

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/trips/${id}/activities/${sidequestId}/comments`, {
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
      <ScrollView
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 18) + 4, paddingBottom: Math.max(insets.bottom, 24) + 34 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} activeOpacity={0.88} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#11131a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SideQuest</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color="#ff4f74" />
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : activity ? (
          <>
            <View style={styles.heroCard}>
              {activity.imageUrl ? (
                <Image source={{ uri: activity.imageUrl }} style={styles.heroImage} blurRadius={activity.isHiddenForViewer ? 22 : 0} />
              ) : (
                <View style={styles.heroPlaceholder}>
                  <Ionicons name="sparkles-outline" size={40} color="#bcc2cb" />
                </View>
              )}
              <View style={[styles.heroOverlay, activity.isHiddenForViewer ? styles.heroOverlayHidden : null]} />
              {activity.canEdit ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.editButtonFloating}
                  onPress={() => router.push(`/trip/${id}/sidequest/${sidequestId}/edit`)}>
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.heroContent}>
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
                      : 'This SideQuest is still under wraps.'
                    : cleanDescription || 'No extra description yet.'}
                </Text>
              </View>
            </View>

            <View style={styles.metaCard}>
              {activity.category ? (
                <MetaRow
                  icon="pricetag-outline"
                  label="Kategori"
                  value={{
                    flight:    '✈️ Flyg',
                    sidequest: '🎯 Sidequest',
                    food:      '🍽️ Mat',
                    sight:     '🏛️ Sevärdighet',
                  }[activity.category] ?? activity.category}
                />
              ) : null}
              <MetaRow icon="calendar-outline" label="Date" value={formatLongDate(activity.date)} />
              {activity.visibility === 'hidden' && activity.revealAt ? (
                <MetaRow icon="sparkles-outline" label="Reveal" value={formatReveal(activity.revealAt)} />
              ) : null}
              <MetaRow icon="eye-outline" label="Visibility" value={activity.visibility === 'hidden' ? 'Hidden until reveal' : 'Public'} />
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
                  <Ionicons name="map-outline" size={17} color="#0d90a8" />
                  <Text style={styles.mapButtonText}>Open map: {locationQuery}</Text>
                </TouchableOpacity>
              ) : null}
              {activity.canEdit && activity.teaser ? (
                <MetaRow icon="chatbubble-ellipses-outline" label="Teaser" value={activity.teaser} />
              ) : null}
            </View>

            {activity.visibility === 'public' ? (
              <View style={styles.commentsCard}>
                <Text style={styles.commentsTitle}>Comments</Text>

                {comments.length === 0 ? (
                  <Text style={styles.commentsEmpty}>No comments yet. Be the first!</Text>
                ) : (
                  comments.map((c) => (
                    <View key={c.id} style={styles.commentItem}>
                      <View style={styles.commentAvatar}>
                        {c.userAvatarUrl
                          ? <Image source={{ uri: c.userAvatarUrl }} style={styles.commentAvatarImage} />
                          : <Text style={styles.commentAvatarText}>{c.userName.charAt(0).toUpperCase()}</Text>}
                      </View>
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
                    placeholder="Write a comment…"
                    placeholderTextColor="#aab0bc"
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={() => void submitComment()}
                  />
                  <TouchableOpacity
                    style={[styles.commentSend, (!commentText.trim() || submitting) && styles.commentSendDisabled]}
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
    </>
  );
}

function MetaRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>
        <Ionicons name={icon} size={18} color="#ff4f74" />
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
});
