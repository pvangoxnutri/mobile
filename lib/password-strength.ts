export type PasswordStrength = 'weak' | 'medium' | 'strong';

// Lightweight heuristic, not a real entropy estimate — length plus a few
// character-class checks, just enough to nudge users toward a better
// password without pretending to be a security audit.
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak';

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}
