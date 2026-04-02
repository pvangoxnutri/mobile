import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://eumlblwtjrrhzarvjvqq.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_j6KiiazUquomvOmx8cJEdA_9QSyaT9K';

const webStorage =
  typeof window !== 'undefined'
    ? {
        getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
        setItem: (key: string, value: string) => Promise.resolve(window.localStorage.setItem(key, value)),
        removeItem: (key: string) => Promise.resolve(window.localStorage.removeItem(key)),
      }
    : null;

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' && webStorage ? webStorage : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
