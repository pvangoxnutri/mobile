import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';
import { StartupScreen } from '@/components/startup-screen';

/**
 * The launch route: decides where the user actually belongs and gets out of
 * the way. It paints StartupScreen — the same surface AuthGate just showed and
 * the same one the native splash handed off to — so the whole launch reads as
 * one continuous branded screen rather than a sequence of different ones.
 *
 * It used to sit on a 1200ms setTimeout before redirecting. That was pure
 * added latency: auth was already resolved by the time this route mounted (it
 * renders below AuthGate), so the timer delayed a decision that could be made
 * immediately. Routing now happens on the first frame this route is focused.
 */
export default function SplashRoute() {
  const { user } = useAuth();

  // useFocusEffect, NOT useEffect: when a push-notification deep link
  // cold-starts the app, PushNotificationBootstrap pushes the destination
  // (e.g. the revealed activity's detail) ON TOP of this route within
  // milliseconds. This route stays mounted underneath, and a plain useEffect
  // would still fire and router.replace() the user's destination away. Focus
  // semantics mean we only redirect while this route is actually the one on
  // screen, and re-evaluate if the user ever backs out onto it again.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        router.replace('/(auth)/login');
      } else if (!user.hasCompletedOnboarding) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    }, [user]),
  );

  return <StartupScreen />;
}
