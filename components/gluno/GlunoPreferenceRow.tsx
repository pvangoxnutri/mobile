import { memo, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/components/i18n-provider';
import { useTheme } from '@/components/theme-provider';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  canShare,
  isSharedWithGroup,
  preferenceKeyLabel,
  preferenceValueLabel,
  scopeLabel,
} from '@/lib/gluno-preference-display';
import type { GlunoLearnedPreference } from '@/lib/gluno-feedback';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — one thing Gluno is currently assuming.
//
// The editor is chosen by the BACKEND, not by this component guessing from the
// key. That matters because the backend is also what validates the value: if
// the two disagree, the user gets a control that produces rejections. An
// editor kind this build has never seen renders read-only rather than as a
// broken text box — the forget button still works, which is the control that
// actually matters.
//
// Only the value is editable inline. Scope and sharing are separate, more
// deliberate actions, because both reach further than the row they sit on.
// ──────────────────────────────────────────────────────────────────────────

type Props = {
  preference: GlunoLearnedPreference;
  /** The Adventure's name, when it is known and this row belongs to it. */
  tripTitle?: string | null;
  busy: boolean;
  onChangeValue: (preference: GlunoLearnedPreference, value: string) => void;
  onForget: (preference: GlunoLearnedPreference) => void;
  onMakeGlobal: (preference: GlunoLearnedPreference) => void;
  onChangeVisibility: (preference: GlunoLearnedPreference, share: boolean) => void;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function GlunoPreferenceRow({
  preference,
  tripTitle,
  busy,
  onChangeValue,
  onForget,
  onMakeGlobal,
  onChangeVisibility,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { theme } = useTheme();
  const { t } = useI18n();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(preference.value);

  const editable = ['choice', 'time', 'minutes', 'text'].includes(preference.editor);
  const shareable = canShare(preference);
  const shared = isSharedWithGroup(preference.visibility);

  const commit = useCallback(
    (value: string) => {
      setEditing(false);

      const trimmed = value.trim();
      // Nothing to save. Silently closing beats a "that did not save" for an
      // edit the user did not actually make.
      if (!trimmed || trimmed === preference.value) return;

      if (preference.editor === 'time' && !TIME_PATTERN.test(trimmed)) return;
      if (preference.editor === 'minutes' && !/^\d{1,3}$/.test(trimmed)) return;

      onChangeValue(preference, trimmed);
    },
    [onChangeValue, preference],
  );

  const scopeText = preference.scope === 'trip' && tripTitle
    ? tripTitle
    : scopeLabel(preference.scope, t);

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.key}>{preferenceKeyLabel(preference.key, t)}</Text>
          <Text style={styles.value}>{preferenceValueLabel(preference, t)}</Text>
        </View>

        {busy ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : null}
      </View>

      <View style={styles.meta}>
        <View style={styles.pill}>
          <Ionicons
            name={preference.scope === 'global' ? 'globe-outline' : 'map-outline'}
            size={10}
            color={theme.colors.textMeta}
          />
          <Text style={styles.pillText} numberOfLines={1}>{scopeText}</Text>
        </View>

        {/* Only where sharing is even possible. A global or conversation
            preference is private by construction, and a "Private" badge on it
            implies a choice that was never offered. */}
        {shareable ? (
          <View style={[styles.pill, shared && styles.pillShared]}>
            <Ionicons
              name={shared ? 'people-outline' : 'lock-closed-outline'}
              size={10}
              color={shared ? theme.colors.primary : theme.colors.textMeta}
            />
            <Text style={[styles.pillText, shared && styles.pillTextShared]}>
              {shared ? t('gluno.knows.visibilityShared') : t('gluno.knows.visibilityPrivate')}
            </Text>
          </View>
        ) : null}

        {preference.isHardConstraint ? (
          <View style={[styles.pill, styles.pillRequired]}>
            <Text style={[styles.pillText, styles.pillTextRequired]}>{t('gluno.knows.required')}</Text>
          </View>
        ) : null}
      </View>

      {editing ? (
        <View style={styles.editor}>
          {preference.editor === 'choice' ? (
            <View style={styles.options}>
              {preference.options.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.option, option === preference.value && styles.optionActive]}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: option === preference.value }}
                  onPress={() => commit(option)}>
                  <Text
                    style={[
                      styles.optionText,
                      option === preference.value && styles.optionTextActive,
                    ]}>
                    {t(`gluno.pref.value.${option}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={preference.editor === 'text' ? 120 : 5}
                keyboardType={preference.editor === 'minutes' ? 'number-pad' : 'default'}
                placeholder={preference.editor === 'time' ? '10:00' : undefined}
                placeholderTextColor={theme.colors.textMuted}
                onSubmitEditing={() => commit(draft)}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.save}
                activeOpacity={0.85}
                accessibilityRole="button"
                onPress={() => commit(draft)}>
                <Text style={styles.saveText}>{t('gluno.knows.save')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.7}
            accessibilityRole="button"
            onPress={() => { setEditing(false); setDraft(preference.value); }}>
            <Text style={styles.action}>{t('gluno.knows.cancel')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actions}>
          {editable ? (
            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => { setDraft(preference.value); setEditing(true); }}>
              <Text style={styles.action}>{t('gluno.knows.change')}</Text>
            </TouchableOpacity>
          ) : null}

          {shareable ? (
            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onChangeVisibility(preference, !shared)}>
              <Text style={styles.action}>
                {shared ? t('gluno.knows.unshare') : t('gluno.knows.share')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {preference.scope !== 'global' ? (
            <TouchableOpacity
              activeOpacity={0.7}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onMakeGlobal(preference)}>
              <Text style={styles.action}>{t('gluno.knows.makeGlobal')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Always available, including on rows with no editor. Removing
              something you never agreed to matters more than tuning it. */}
          <TouchableOpacity
            activeOpacity={0.7}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onForget(preference)}>
            <Text style={[styles.action, styles.actionDestructive]}>{t('gluno.knows.forget')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default memo(GlunoPreferenceRow, (previous, next) =>
  previous.preference.id === next.preference.id
  && previous.preference.value === next.preference.value
  && previous.preference.scope === next.preference.scope
  && previous.preference.visibility === next.preference.visibility
  && previous.preference.isHardConstraint === next.preference.isHardConstraint
  && previous.tripTitle === next.tripTitle
  && previous.busy === next.busy);

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderPrimary,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headCopy: {
    flex: 1,
  },
  key: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.colors.textMeta,
  },
  value: {
    marginTop: 2,
    fontSize: 14.5,
    color: theme.colors.textPrimary,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '60%',
    backgroundColor: theme.colors.bgLight,
  },
  pillShared: {
    backgroundColor: theme.colors.primaryLight12,
  },
  pillRequired: {
    backgroundColor: theme.colors.bgLight,
  },
  pillText: {
    fontSize: 10.5,
    color: theme.colors.textMeta,
  },
  pillTextShared: {
    fontWeight: '700',
    color: theme.colors.primary,
  },
  pillTextRequired: {
    fontWeight: '700',
    color: theme.colors.warning,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  action: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  actionDestructive: {
    color: theme.colors.error,
  },
  editor: {
    marginTop: 10,
    gap: 10,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  option: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.bgLight,
  },
  optionActive: {
    backgroundColor: theme.colors.primary,
  },
  optionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  optionTextActive: {
    fontWeight: '800',
    color: theme.colors.white,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    fontSize: 14,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.bgLight,
  },
  save: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  saveText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.white,
  },
});
