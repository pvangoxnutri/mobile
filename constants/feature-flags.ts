// ──────────────────────────────────────────────────────────────────────────
// FEATURE FLAGS
//
// Hardcoded, local-only flags for features that are still experimental and
// must NOT appear in the production release yet. No remote config — just a
// constant you flip locally to develop behind, and flip back to false
// before shipping.
// ──────────────────────────────────────────────────────────────────────────

// EXPERIMENTAL — Gluno AI assistant (components/gluno/). Everything behind
// this flag is a UI shell with mocked responses; there is no backend AI
// connection yet (see components/gluno/gluno.constants.ts). Must stay
// false in any build that ships to real users until that's ready.
export const ENABLE_GLUNO_ASSISTANT = true;
