import { router } from 'expo-router';
import { useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandMark from '@/components/brand-mark';
import { useAuth } from '@/components/auth-provider';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const { signIn, signUp, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function handleSubmit() {
    try {
      setBusy(true);
      setError('');

      if (mode === 'signin') {
        await signIn(email.trim(), password);
        router.replace('/(tabs)');
        return;
      }

      await signUp(name.trim(), email.trim(), password);
      setError('Check your email to verify your account, then sign in.');
      setMode('signin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    try {
      setGoogleBusy(true);
      setError('');

      const redirectTo = Linking.createURL('/auth-callback');
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (!data?.url) {
        throw new Error('Could not start Google sign-in.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }

      if (result.type !== 'success') {
        throw new Error('Google sign-in did not complete.');
      }

      const params = readAuthParams(result.url);
      const authError = params.get('error_description') ?? params.get('error');
      if (authError) {
        throw new Error(authError);
      }

      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const code = params.get('code');

      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sessionError) {
          throw sessionError;
        }
      } else if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw exchangeError;
        }
      } else {
        throw new Error('Google sign-in returned an incomplete session.');
      }

      await refreshProfile();
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
      <View style={styles.logoRow}>
        <BrandMark size="md" />
      </View>
      <Text style={styles.tagline}>The journey begins here</Text>

      <View style={styles.card}>
        <Text style={styles.heading}>{mode === 'signin' ? 'Welcome back' : 'Create account'}</Text>
        {mode === 'signup' ? <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} /> : null}
        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={() => void handleSubmit()} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => setMode((current) => (current === 'signin' ? 'signup' : 'signin'))}>
          <Text style={styles.secondaryButtonText}>
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>

        <View style={styles.separatorRow}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>OR</Text>
          <View style={styles.separatorLine} />
        </View>

        <Pressable style={styles.googleButton} onPress={() => void handleGoogleLogin()} disabled={busy || googleBusy}>
          {googleBusy ? (
            <ActivityIndicator color="#20222a" />
          ) : (
            <>
              <GoogleGlyph />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function readAuthParams(url: string) {
  const [, queryPart = ''] = url.split('?');
  const [queryString, hashString = ''] = queryPart.split('#');
  const hashParams = new URLSearchParams(hashString);
  const queryParams = new URLSearchParams(queryString);

  if (hashParams.toString()) {
    return hashParams;
  }

  return queryParams;
}

function GoogleGlyph() {
  return (
    <View style={styles.googleGlyph}>
      <Text style={styles.googleGlyphBlue}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff7f8',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  logoRow: {
    justifyContent: 'center',
  },
  tagline: {
    marginTop: 14,
    textAlign: 'center',
    color: '#8f94a2',
    fontSize: 17,
  },
  card: {
    marginTop: 30,
    borderRadius: 28,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eceef2',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 5,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14161d',
    letterSpacing: -0.7,
    marginBottom: 14,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4e7ee',
    backgroundColor: '#f9fafc',
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    color: '#d53d18',
    marginBottom: 10,
    lineHeight: 20,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4f74',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#6c7280',
    fontSize: 14,
    fontWeight: '600',
  },
  separatorRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ececf0',
  },
  separatorText: {
    color: '#a8acb7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  googleButton: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8ebf1',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonText: {
    color: '#20222a',
    fontSize: 15,
    fontWeight: '700',
  },
  googleGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleGlyphBlue: {
    color: '#4285F4',
    fontSize: 18,
    fontWeight: '900',
  },
});
