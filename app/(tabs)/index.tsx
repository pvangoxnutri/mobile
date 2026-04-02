import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { apiJson } from '@/lib/api';
import type { Quest } from '@/lib/types';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const upcomingQuest = useMemo(() => quests[0] ?? null, [quests]);
  const floatingBottom = Math.max(insets.bottom, 14) + 78;

  const loadQuests = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');

    void apiJson<Quest[]>('/api/trips')
      .then((data) => {
        if (!active) return;
        setQuests(Array.isArray(data) ? data : []);
      })
      .catch(async (err: Error) => {
        if (!active) return;
        setError(err.message || 'Unable to load quests.');
        if (err.message.includes('401') || err.message.toLowerCase().includes('unauthorized')) {
          await signOut();
          router.replace('/(auth)/login');
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
  }, [signOut]);

  useFocusEffect(loadQuests);

  if (!loading && quests.length === 0) {
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[
            styles.emptyScreenContent,
            { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: floatingBottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <BrandMark size="sm" />
            <TouchableOpacity style={styles.avatarShell} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarCore}>
                  <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.emptySectionHeading}>ACTIVE QUEST</Text>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="compass" size={30} color="#6e6a6a" />
            </View>
            <Text style={styles.emptyCardTitle}>Your adventure starts soon</Text>
            <Text style={styles.emptyCardCopy}>No active quest right now</Text>
          </View>

          <Text style={styles.emptySectionHeadingUpcoming}>UPCOMING</Text>
          <View style={styles.emptyUpcoming}>
            <View style={styles.emptyRocketCircle}>
              <Ionicons name="rocket-outline" size={46} color="#c8c7ca" />
            </View>
            <Text style={styles.emptyUpcomingTitle}>No sidequests yet</Text>
            <Text style={styles.emptyUpcomingCopy}>Create your first one and surprise your friends</Text>
          </View>

          <Text style={styles.emptyHint}>Tap + to create your first SideQuest</Text>
        </ScrollView>

        <FloatingFab
          open={fabOpen}
          bottom={floatingBottom}
          onToggle={() => setFabOpen((current) => !current)}
          onDismiss={() => setFabOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.screenContent,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: floatingBottom + 76 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <BrandMark size="sm" />
          <TouchableOpacity style={styles.avatarShell} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCore}>
                <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{upcomingQuest?.title?.trim() || 'Your next adventure'}</Text>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-clear-outline" size={25} color="#4f5461" />
            <Text style={styles.dateText}>{formatDateRange(upcomingQuest?.startDate, upcomingQuest?.endDate)}</Text>
          </View>

          <View style={styles.badgeRow}>
            <InfoBadge tone="cyan" icon="time" label={getDurationLabel(upcomingQuest)} />
            <InfoBadge tone="pink" icon="people" label={getMembersLabel(upcomingQuest)} />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>UPCOMING</Text>
          <View style={styles.sectionLine} />
        </View>

        <View style={styles.cardRow}>
          {quests.slice(0, 2).map((quest, index) => (
            <QuestCard
              key={quest.id}
              id={quest.id}
              title={quest.title ?? 'Untitled quest'}
              badge={getCountdownLabel(quest)}
              badgeTone={index === 0 ? 'pink' : 'cyan'}
              imageUrl={quest.imageUrl}
              compact={index === 1}
            />
          ))}
        </View>

        <View style={styles.bottomArea}>
          <TouchableOpacity style={styles.activeQuestCard} activeOpacity={0.85} onPress={() => upcomingQuest && router.push(`/trip/${upcomingQuest.id}`)}>
            <View style={styles.activeQuestDot} />
            <View style={styles.activeQuestTextBlock}>
              <Text style={styles.activeQuestLabel}>ACTIVE QUEST</Text>
              <Text style={styles.activeQuestTitle}>{upcomingQuest?.title ?? 'Your next SideQuest'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.pagination}>
          <View style={[styles.paginationDot, styles.paginationDotActive]} />
          <View style={styles.paginationDot} />
          <View style={styles.paginationDot} />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <FloatingFab
        open={fabOpen}
        bottom={floatingBottom}
        onToggle={() => setFabOpen((current) => !current)}
        onDismiss={() => setFabOpen(false)}
      />
    </View>
  );
}

function FloatingFab({
  open,
  bottom,
  onToggle,
  onDismiss,
}: {
  open: boolean;
  bottom: number;
  onToggle: () => void;
  onDismiss: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? <Pressable style={styles.fabBackdrop} onPress={onDismiss} /> : null}
      <View pointerEvents="box-none" style={[styles.fabWrap, { bottom }]}>
        {open ? (
          <View style={styles.fabMenu}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.fabMenuButton, styles.fabMenuButtonPrimary]}
              onPress={() => {
                onDismiss();
                router.push('/create-trip');
              }}>
              <Text style={styles.fabMenuButtonPrimaryText}>Create SideQuest</Text>
              <View style={styles.fabMenuIconCircle}>
                <Ionicons name="add" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.9} style={styles.fabMenuButton} onPress={onDismiss}>
              <Text style={styles.fabMenuButtonText}>Join SideQuest</Text>
              <Ionicons name="person-add-outline" size={15} color="#ff4f74" />
            </TouchableOpacity>

            <View style={styles.fabMenuCaret} />
          </View>
        ) : null}

        <TouchableOpacity activeOpacity={0.92} style={styles.floatingFab} onPress={onToggle}>
          <Ionicons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoBadge({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'cyan' | 'pink';
}) {
  return (
    <View style={styles.infoBadge}>
      <View style={[styles.infoBadgeIcon, tone === 'cyan' ? styles.infoBadgeIconCyan : styles.infoBadgeIconPink]}>
        <Ionicons name={icon} size={16} color="#fff" />
      </View>
      <Text style={styles.infoBadgeLabel}>{label}</Text>
    </View>
  );
}

function QuestCard({
  id,
  title,
  badge,
  badgeTone,
  imageUrl,
  compact,
}: {
  id: string;
  title: string;
  badge: string;
  badgeTone: 'cyan' | 'pink';
  imageUrl?: string | null;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      onPress={() => router.push(`/trip/${id}`)}
      style={[styles.questCard, compact ? styles.questCardCompact : null, compact ? styles.questCardSky : styles.questCardLava]}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questCardImage} /> : null}
      <View style={[styles.questCardOverlay, compact ? styles.questCardOverlaySky : styles.questCardOverlayLava]} />
      <View style={[styles.questCardBadge, badgeTone === 'cyan' ? styles.questCardBadgeCyan : styles.questCardBadgePink]}>
        <Text style={[styles.questCardBadgeText, badgeTone === 'cyan' ? styles.questCardBadgeTextDark : null]}>{badge}</Text>
      </View>
      <Text style={styles.questCardTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

function getInitials(name?: string | null) {
  if (!name) return 'SQ';
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'SQ';
}

function formatDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return 'Dates coming soon';
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function getDurationLabel(quest: Quest | null) {
  if (!quest) return '0 DAYS';
  const start = new Date(`${quest.startDate}T12:00:00`);
  const end = new Date(`${quest.endDate}T12:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return `${days} DAYS`;
}

function getMembersLabel(quest: Quest | null) {
  const count = quest?.ownerIds?.length || 1;
  return `${count} MEMBERS`;
}

function getCountdownLabel(quest: Quest) {
  const now = new Date();
  const start = new Date(`${quest.startDate}T12:00:00`);
  const days = Math.ceil((start.getTime() - now.getTime()) / 86400000);
  if (days <= 1) return 'TOMORROW';
  return `IN ${days} DAYS`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  screenContent: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 110,
  },
  emptyScreenContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 164,
  },
  emptySectionHeading: {
    marginTop: 58,
    color: '#5f5a5a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.8,
  },
  emptyCard: {
    marginTop: 18,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#eadfe1',
    backgroundColor: '#fffdfd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 50,
  },
  emptyIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f2f2',
  },
  emptyCardTitle: {
    marginTop: 24,
    color: '#1c1d24',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
  },
  emptyCardCopy: {
    marginTop: 10,
    color: '#7b7b82',
    fontSize: 17,
    textAlign: 'center',
  },
  emptySectionHeadingUpcoming: {
    marginTop: 44,
    color: '#5f5a5a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.8,
  },
  emptyUpcoming: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 90,
    paddingBottom: 92,
  },
  emptyRocketCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f4f5',
  },
  emptyUpcomingTitle: {
    marginTop: 28,
    color: '#171821',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  emptyUpcomingCopy: {
    marginTop: 12,
    maxWidth: 240,
    color: '#747984',
    fontSize: 18,
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyHint: {
    marginTop: 'auto',
    textAlign: 'center',
    color: '#c8c9cf',
    fontSize: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarCore: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1e2128',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  hero: {
    marginTop: 54,
  },
  heroTitle: {
    maxWidth: 290,
    color: '#121317',
    fontSize: 54,
    lineHeight: 56,
    fontWeight: '900',
    letterSpacing: -2.7,
  },
  dateRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: '#454a56',
    fontSize: 17,
    letterSpacing: -0.3,
  },
  badgeRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    backgroundColor: '#f5f5f6',
    borderWidth: 1,
    borderColor: '#e3e5e9',
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  infoBadgeIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeIconCyan: {
    backgroundColor: '#0d90a8',
  },
  infoBadgeIconPink: {
    backgroundColor: '#e12d68',
  },
  infoBadgeLabel: {
    color: '#666b76',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  sectionHeader: {
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionLabel: {
    color: '#b4b7bf',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3.2,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8ebef',
  },
  cardRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  questCard: {
    width: 198,
    height: 158,
    borderRadius: 34,
    paddingHorizontal: 16,
    paddingTop: 108,
    overflow: 'hidden',
  },
  questCardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  questCardCompact: {
    width: 126,
  },
  questCardLava: {
    backgroundColor: '#2a2430',
  },
  questCardSky: {
    backgroundColor: '#8e84b7',
  },
  questCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  questCardOverlayLava: {
    backgroundColor: 'rgba(25,19,31,0.36)',
  },
  questCardOverlaySky: {
    backgroundColor: 'rgba(44,32,78,0.28)',
  },
  questCardBadge: {
    position: 'absolute',
    left: 14,
    top: 54,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  questCardBadgePink: {
    backgroundColor: '#ff8ca0',
  },
  questCardBadgeCyan: {
    backgroundColor: '#10c7e8',
  },
  questCardBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  questCardBadgeTextDark: {
    color: '#0d2c34',
  },
  questCardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  bottomArea: {
    marginTop: 72,
    alignItems: 'flex-start',
  },
  activeQuestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 245,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#edf0f4',
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 22,
    elevation: 5,
  },
  activeQuestDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#79a7b5',
    marginRight: 14,
  },
  activeQuestTextBlock: {
    flex: 1,
  },
  activeQuestLabel: {
    color: '#252833',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.8,
  },
  activeQuestTitle: {
    marginTop: 4,
    color: '#0b7a94',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.4,
  },
  pagination: {
    marginTop: 14,
    marginBottom: 92,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 12,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d6d8dd',
  },
  paginationDotActive: {
    width: 42,
    backgroundColor: '#111',
  },
  errorText: {
    marginTop: 14,
    color: '#d53d18',
    textAlign: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,18,23,0.08)',
  },
  fabWrap: {
    position: 'absolute',
    right: 22,
    alignItems: 'flex-end',
  },
  floatingFab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#d5004f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#d5004f',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 22,
    elevation: 8,
  },
  fabMenu: {
    position: 'relative',
    width: 172,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  fabMenuButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffd0db',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fabMenuButtonPrimary: {
    backgroundColor: '#d5004f',
    borderColor: '#d5004f',
    marginBottom: 8,
  },
  fabMenuButtonPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  fabMenuButtonText: {
    color: '#ff4f74',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  fabMenuIconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  fabMenuCaret: {
    position: 'absolute',
    right: 22,
    bottom: -8,
    width: 16,
    height: 16,
    backgroundColor: '#fff',
    transform: [{ rotate: '45deg' }],
  },
});
