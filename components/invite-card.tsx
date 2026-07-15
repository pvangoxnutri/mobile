import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Animated, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useI18n } from '@/components/i18n-provider';
import { useScalePress } from '@/hooks/useMotion';
import type { PendingInvite } from '@/lib/types';
import { SPACING, TYPOGRAPHY, RADIUS } from '@/constants/design-tokens';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

interface InviteCardProps {
  invite: PendingInvite;
  busy: boolean;
  // True when this card is the one a trip-invite push notification deep
  // linked to (?inviteId=...) — gives it a stronger border so tapping the
  // notification visibly lands on the right invite, not just "home".
  highlighted?: boolean;
  onAccept: (invite: PendingInvite) => void;
  onDecline: (invite: PendingInvite) => void;
}

export default function InviteCard({ invite, busy, highlighted, onAccept, onDecline }: InviteCardProps) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { handlePressIn: acceptPressIn, handlePressOut: acceptPressOut, animatedStyle: acceptAnimatedStyle } = useScalePress({
    scale: 0.94,
    triggerHaptics: true,
  });

  const { handlePressIn: declinePressIn, handlePressOut: declinePressOut, animatedStyle: declineAnimatedStyle } = useScalePress({
    scale: 0.94,
    triggerHaptics: false,
  });

  return (
    <View
      style={[
        styles.inviteCard,
        { borderColor: theme.colors.primaryLight20, backgroundColor: theme.colors.primaryLight12 },
        highlighted ? { borderColor: theme.colors.primary, borderWidth: 2 } : null,
      ]}>
      {invite.tripImageUrl ? (
        <Image
          source={{ uri: invite.tripImageUrl }}
          style={styles.inviteCardImage}
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <View style={[styles.inviteCardImage, styles.inviteCardImagePlaceholder]}>
          <Ionicons name="map-outline" size={20} color={theme.colors.primary} />
        </View>
      )}
      <View style={styles.inviteCardContent}>
        <Text style={styles.inviteCardTitle} numberOfLines={2}>
          {invite.tripTitle ?? t('home.defaultTripName')}
        </Text>
        {invite.tripDestination ? (
          <Text style={styles.inviteCardMeta} numberOfLines={1}>
            <Ionicons name="location-outline" size={11} /> {invite.tripDestination}
          </Text>
        ) : null}
        <Text style={styles.inviteCardFrom}>Invited by {invite.invitedByName}</Text>
      </View>
      <View style={styles.inviteCardActions}>
        <Animated.View style={acceptAnimatedStyle}>
          <TouchableOpacity
            style={[styles.inviteAcceptBtn, { backgroundColor: theme.colors.primary }]}
            activeOpacity={0.82}
            onPressIn={acceptPressIn}
            onPressOut={acceptPressOut}
            onPress={() => onAccept(invite)}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.inviteAcceptText} numberOfLines={1}>{t('common.join')}</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={declineAnimatedStyle}>
          <TouchableOpacity
            style={styles.inviteDeclineBtn}
            activeOpacity={0.82}
            onPressIn={declinePressIn}
            onPressOut={declinePressOut}
            onPress={() => onDecline(invite)}
            disabled={busy}>
            <Ionicons name="close" size={16} color={theme.colors.textMeta} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  inviteCardImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.sm,
  },
  inviteCardImagePlaceholder: {
    backgroundColor: theme.colors.primaryLight20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteCardContent: {
    flex: 1,
    minWidth: 0,
  },
  inviteCardTitle: {
    ...TYPOGRAPHY.label,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  inviteCardMeta: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  inviteCardFrom: {
    ...TYPOGRAPHY.meta,
    color: theme.colors.textMeta,
    fontSize: 11,
  },
  inviteCardActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    // Never let the buttons get squeezed by a long title — the content
    // column (flex: 1) absorbs the shrink instead. Android squeezed this
    // just enough to wrap "Gå med" onto two lines.
    flexShrink: 0,
  },
  inviteAcceptBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  inviteAcceptText: {
    ...TYPOGRAPHY.buttonLarge,
    color: '#fff',
  },
  inviteDeclineBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgLight,
  },
});
