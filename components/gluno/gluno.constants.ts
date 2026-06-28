// ──────────────────────────────────────────────────────────────────────────
// EXPERIMENTAL — Gluno AI assistant
//
// Hidden behind ENABLE_GLUNO_ASSISTANT (see constants/feature-flags.ts).
// Everything in this file is a temporary mock — there is no backend AI
// connection yet. getMockGlunoReply is the one function that's meant to be
// swapped for a real API call later; callers shouldn't need to change.
// ──────────────────────────────────────────────────────────────────────────

export const GLUNO_QUICK_ACTIONS = [
  'Give me trip ideas',
  'Suggest SideQuests',
  'Explain this screen',
  'Help me plan this day',
] as const;

const MOCK_REPLIES: Record<string, string> = {
  'give me trip ideas':
    "I'd love to! Once I'm fully connected, I'll suggest destinations based on your travel history, dates, and who you're going with.",
  'suggest sidequests':
    'Absolutely — soon I’ll help generate hidden activities based on your trip, dates, vibe and group.',
  'explain this screen':
    "Happy to walk you through it. Once I'm connected to the app's real data, I'll explain exactly what you're looking at.",
  'help me plan this day':
    "Let's do it — soon I'll be able to fill in a whole day for you based on your trip's existing plans.",
};

const DEFAULT_REPLY =
  "I'm just a mocked preview of Gluno for now — once I'm connected to real AI, I'll have a proper answer for that!";

// TODO: replace with a real backend AI call once Gluno has one. Keep the
// signature (a string in, a string back) so callers don't need to change.
export function getMockGlunoReply(userMessage: string): string {
  const key = userMessage.trim().toLowerCase();
  return MOCK_REPLIES[key] ?? DEFAULT_REPLY;
}
