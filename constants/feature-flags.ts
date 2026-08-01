// ──────────────────────────────────────────────────────────────────────────
// FEATURE FLAGS
//
// Hardcoded, local-only flags for features that are still experimental and
// must NOT appear in the production release yet. No remote config — just a
// constant you flip locally to develop behind, and flip back to false
// before shipping.
// ──────────────────────────────────────────────────────────────────────────

// IN DEVELOPMENT — Gluno AI assistant (components/gluno/, lib/gluno.ts).
// Now talks to a real backend (backend/Services/Gluno/) instead of the old
// mocked replies, but is still being built out, so it must not appear to real
// users yet.
//
// `__DEV__` rather than a hardcoded false: Expo sets it true in Expo Go and
// dev builds and false in every production/release build, so Gluno is
// developable without editing this file and cannot ship by someone forgetting
// to flip it back. Flip to a literal `true` only for a deliberate internal
// build, and never commit that.
//
// This is only the client half. The backend gates Gluno independently
// (Gluno:Enabled, defaulting to Development-only) and reports it via
// GET /api/gluno/status, which the panel checks on open — so a production app
// pointed at a production API stays dark even if this flag were forced on.
export const ENABLE_GLUNO_ASSISTANT = __DEV__;

// IN MIGRATION — Light/Dark appearance system (constants/themes.ts,
// components/theme-provider.tsx). While false the app is forced to Light and
// the Appearance setting is hidden, so production never sees a partially
// themed screen. Flip to true locally to develop/test Dark. Must stay false
// in shipping builds until every phase of the theme migration is complete
// and both themes have passed the full visual audit (Phase 6).
// SHIPPING since 1.0.4: the full Light/Dark theme migration is complete
// (batches 0–6 + fixes). Appearance lives in Profile → Settings with exactly
// two options (Light/Dark, no System); the preference persists locally.
// Known leftover: the admin-only moderation screen and the flag-disabled
// Gluno shell are not dark-migrated — neither is reachable by regular users.
export const ENABLE_THEME_SWITCHING = true;
