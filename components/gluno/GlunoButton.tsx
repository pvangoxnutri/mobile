import GlunoMascot from '@/components/gluno/GlunoMascot';
import { ENABLE_GLUNO_ASSISTANT } from '@/constants/feature-flags';

// EXPERIMENTAL — Gluno AI assistant entry point, meant to live in the main
// app header (see components/tab-header.tsx). Renders null unless
// ENABLE_GLUNO_ASSISTANT is true (constants/feature-flags.ts) — this is the
// single point that hides the whole feature when the flag is off, so it's
// safe for tab-header.tsx to render this unconditionally.
//
// Gluno is rendered via GlunoMascot, not a static icon — see that
// component for the idle breathing/blink/bounce behavior and the plan for
// swapping in a real Rive/Lottie animation later.
export default function GlunoButton({ onPress }: { onPress: () => void }) {
  if (!ENABLE_GLUNO_ASSISTANT) return null;

  return (
    <GlunoMascot
      size={36}
      state="idle"
      onPress={onPress}
      accessibilityLabel="Open Gluno assistant"
      accessibilityHint="Opens the Gluno AI assistant panel"
    />
  );
}
