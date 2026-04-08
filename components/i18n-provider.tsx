import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'sv';

type I18nContextValue = {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const STORAGE_KEY = 'sidequest_language';

const dictionaries: Record<AppLanguage, Record<string, string>> = {
  en: {
    'auth.tagline': 'The journey begins here',
    'auth.welcome': 'Welcome back',
    'auth.create_account': 'Create account',
    'auth.intro_signin': 'Sign in with your email and password to continue your adventure.',
    'auth.intro_signup': 'Create your account with your name, email, and a secure password.',
    'auth.full_name': 'Full name',
    'auth.full_name_placeholder': 'Your full name',
    'auth.email': 'Email address',
    'auth.email_placeholder': 'you@example.com',
    'auth.password': 'Password',
    'auth.password_signin_placeholder': 'Enter your password',
    'auth.password_signup_placeholder': 'Choose a password',
    'auth.btn_signin': 'Sign In',
    'auth.btn_signup': 'Create Account',
    'auth.forgot_password': 'Forgot password?',
    'auth.need_account': 'Need an account? Sign up',
    'auth.have_account': 'Already have an account? Sign in',
    'auth.continue_google': 'Continue with Google',
    'auth.notice_check_email': 'Check your email to verify your account, then sign in.',
    'auth.reset_done': 'Your password was changed. Sign in with the new one.',
    'auth.cooldown': 'You can request a new verification email in {seconds}s.',
    'auth.wait_before_retry': 'Please wait {seconds}s before requesting another verification email.',
    'auth.rate_limit': 'Too many email attempts right now. Wait a moment before trying again.',
    'auth.generic_error': 'Something went wrong.',
    'auth.google_failed': 'Google sign-in failed.',
    'auth.google_start_failed': 'Could not start Google sign-in.',
    'auth.google_incomplete': 'Google sign-in did not complete.',
    'auth.google_session_incomplete': 'Google sign-in returned an incomplete session.',
    'auth.language': 'Language',
    'auth.language_en': 'English',
    'auth.language_sv': 'Svenska',
  },
  sv: {
    'auth.tagline': 'Resan börjar här',
    'auth.welcome': 'Välkommen tillbaka',
    'auth.create_account': 'Skapa konto',
    'auth.intro_signin': 'Logga in med e-post och lösenord för att fortsätta ditt äventyr.',
    'auth.intro_signup': 'Skapa konto med namn, e-post och ett säkert lösenord.',
    'auth.full_name': 'Fullständigt namn',
    'auth.full_name_placeholder': 'Ditt fullständiga namn',
    'auth.email': 'E-postadress',
    'auth.email_placeholder': 'du@exempel.se',
    'auth.password': 'Lösenord',
    'auth.password_signin_placeholder': 'Ange ditt lösenord',
    'auth.password_signup_placeholder': 'Välj ett lösenord',
    'auth.btn_signin': 'Logga in',
    'auth.btn_signup': 'Skapa konto',
    'auth.forgot_password': 'Glömt lösenord?',
    'auth.need_account': 'Har du inget konto? Registrera dig',
    'auth.have_account': 'Har du redan konto? Logga in',
    'auth.continue_google': 'Fortsätt med Google',
    'auth.notice_check_email': 'Kolla din e-post för att verifiera kontot och logga sedan in.',
    'auth.reset_done': 'Lösenordet har ändrats. Logga in med det nya.',
    'auth.cooldown': 'Du kan begära nytt verifieringsmail om {seconds}s.',
    'auth.wait_before_retry': 'Vänta {seconds}s innan du begär ett nytt verifieringsmail.',
    'auth.rate_limit': 'För många e-postförsök just nu. Vänta en stund och försök igen.',
    'auth.generic_error': 'Något gick fel.',
    'auth.google_failed': 'Google-inloggning misslyckades.',
    'auth.google_start_failed': 'Kunde inte starta Google-inloggning.',
    'auth.google_incomplete': 'Google-inloggningen slutfördes inte.',
    'auth.google_session_incomplete': 'Google-inloggningen returnerade en ofullständig session.',
    'auth.language': 'Språk',
    'auth.language_en': 'English',
    'auth.language_sv': 'Svenska',
  },
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      setLanguageState(normalizeLanguage(stored));
    });
    return () => {
      active = false;
    };
  }, []);

  async function setLanguage(next: AppLanguage) {
    setLanguageState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  }

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => {
        const raw = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
        if (!vars) return raw;
        return Object.entries(vars).reduce(
          (acc, [name, v]) => acc.replaceAll(`{${name}}`, String(v)),
          raw,
        );
      },
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider.');
  return context;
}
