import GlunoMascot from '@/components/gluno/GlunoMascot';
import { useI18n } from '@/components/i18n-provider';
import { ENABLE_GLUNO_ASSISTANT } from '@/constants/feature-flags';

// IN DEVELOPMENT — Gluno AI assistant entry point, meant to live in the main
// app header (see components/tab-header.tsx). Renders null unless
// ENABLE_GLUNO_ASSISTANT is true (constants/feature-flags.ts) — this is the
// single point that hides the whole feature when the flag is off, so it's
// safe for tab-header.tsx to render this unconditionally.
//
// Gluno is rendered via GlunoMascot, not a static icon — see that
// component for the idle breathing/blink/bounce behavior and the plan for
// swapping in a real Rive/Lottie animation later.
export default function GlunoButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();

  if (!ENABLE_GLUNO_ASSISTANT) return null;

  return (
    <GlunoMascot
      size={38}
      state="idle"
      onPress={onPress}
      accessibilityLabel={t('gluno.open')}
      accessibilityHint={t('gluno.tagline')}
    />
  );
}
