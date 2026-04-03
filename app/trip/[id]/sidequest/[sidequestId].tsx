import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiJson } from '@/lib/api';
import type { SideQuestActivity } from '@/lib/types';

export default function SideQuestDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, sidequestId } = useLocalSearchParams<{ id: string; sidequestId: string }>();
  const [activity, setActivity] = useState<SideQuestActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      void apiJson<SideQuestActivity>(`/api/trips/${id}/activities/${sidequestId}`)
        .then((data) => {
          if (!active) return;
          setActivity(data);
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

  const hiddenTitle = useMemo(() => {
    if (!activity) return 'Hidden SideQuest';
    return activity.title ?? 'Hidden SideQuest';
  }, [activity]);

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
              <View style={styles.heroContent}>
                <View style={styles.statusRow}>
                  <StatusChip label={activity.visibility === 'hidden' && !activity.isRevealed ? 'Hidden' : 'Visible'} tone={activity.visibility === 'hidden' && !activity.isRevealed ? 'dark' : 'pink'} />
                  {activity.canEdit ? (
                    <TouchableOpacity activeOpacity={0.9} style={styles.editButton} onPress={() => router.push(`/trip/${id}/sidequest/${sidequestId}/edit`)}>
                      <Ionicons name="create-outline" size={15} color="#fff" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={styles.heroTitle}>{hiddenTitle}</Text>
                <Text style={styles.heroSubtitle}>
                  {activity.isHiddenForViewer
                    ? activity.teaserVisible && activity.teaser
                      ? activity.teaser
                      : 'This SideQuest is still under wraps.'
                    : activity.description || 'No extra description yet.'}
                </Text>
              </View>
            </View>

            <View style={styles.metaCard}>
              <MetaRow icon="calendar-outline" label="Date" value={formatLongDate(activity.date)} />
              {activity.visibility === 'hidden' && activity.revealAt ? (
                <MetaRow icon="sparkles-outline" label="Reveal" value={formatReveal(activity.revealAt)} />
              ) : null}
              <MetaRow icon="person-circle-outline" label="Creator" value={activity.ownerName || 'Unknown'} />
              <MetaRow icon="eye-outline" label="Visibility" value={activity.visibility === 'hidden' ? 'Hidden until reveal' : 'Public'} />
              {activity.canEdit && activity.teaser ? (
                <MetaRow icon="chatbubble-ellipses-outline" label="Teaser" value={activity.teaser} />
              ) : null}
            </View>
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
    justifyContent: 'space-between',
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(17,19,25,0.56)',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
});
