/**
 * Invite-link auth detour — when a signed-out user opens an invite link,
 * the invite screen stashes the code here before sending them to login.
 * Home redeems it right after login/onboarding completes, so the invite
 * survives the detour (most invite recipients are brand-new users).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_INVITE_KEY = 'pending_invite_code';

export async function setPendingInviteCode(code: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_INVITE_KEY, code);
}

/** Returns the stashed code (clearing it) or null when none is pending. */
export async function consumePendingInviteCode(): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (code) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}
