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
export const ENABLE_GLUNO_ASSISTANT = false;

// IN MIGRATION — Light/Dark appearance system (constants/themes.ts,
// components/theme-provider.tsx). While false the app is forced to Light and
// the Appearance setting is hidden, so production never sees a partially
// themed screen. Flip to true locally to develop/test Dark. Must stay false
// in shipping builds until every phase of the theme migration is complete
// and both themes have passed the full visual audit (Phase 6).
export const ENABLE_THEME_SWITCHING = true; // TEMPORARILY ON for local dark-mode testing — flip back to false before any build/eas update until the theme migration completes (Phase 6).
