import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import {
  computeTravelStats,
  deriveTripStatusMap,
  mergeStatusMaps,
  sanitizeStatusMap,
  TRAVEL_TRACKER_STORAGE_KEY,
  type TravelStats,
} from '@/components/travel-tracker/travel-tracker-state';
import { apiJson } from '@/lib/api';
import { getCached, setCached } from '@/lib/cache';
import { pushOwnTravelStats } from '@/lib/travel-stats-api';
import type { Quest } from '@/lib/types';

/**
 * The signed-in user's own Travel Tracker stats, computed from the SAME
 * sources the tracker screen uses (AsyncStorage manual statuses merged
 * over trip-derived ones) via the shared computeTravelStats helper — so
 * the profile and the tracker can never disagree. Re-reads on every focus,
 * which is exactly when a tracker change becomes visible on the profile.
 */
export function useOwnTravelStats(): { stats: TravelStats | null; loading: boolean } {
  const { user } = useAuth();
  const [stats, setStats] = useState<TravelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const statsUserIdRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const userId = user?.id;
      if (!userId) {
        statsUserIdRef.current = null;
        setStats(null);
        setLoading(false);
        return undefined;
      }

      let active = true;
      if (statsUserIdRef.current !== userId) {
        setStats(null);
        setLoading(true);
      }
      void (async () => {
        try {
          const raw = await AsyncStorage.getItem(TRAVEL_TRACKER_STORAGE_KEY);
          const local = raw ? sanitizeStatusMap(JSON.parse(raw)) : {};
          // Trips: cached list is enough for a stats row; refresh it in the
          // background only when nothing is cached yet (Home keeps this key
          // fresh in normal use — no duplicate polling from here).
          const tripsCacheKey = `/api/trips::home-user:${userId}`;
          let trips = getCached<Quest[]>(tripsCacheKey);
          if (!trips) {
            try {
              trips = await apiJson<Quest[]>('/api/trips');
              setCached(tripsCacheKey, trips);
            } catch {
              trips = [];
            }
          }
          if (!active) return;
          const todayIso = new Date().toISOString().slice(0, 10);
          const merged = mergeStatusMaps(deriveTripStatusMap(trips, todayIso), local);
          statsUserIdRef.current = userId;
          const computed = computeTravelStats(merged);
          setStats(computed);
          // Keep the server-side aggregates fresh from here too — a user
          // who never opens the tracker screen still syncs by visiting
          // their profile (value-guarded in the api helper, no PUT spam).
          pushOwnTravelStats({
            countriesVisited: computed.countriesVisited,
            continentsReached: computed.continentsReached,
          });
        } catch {
          if (active) {
            statsUserIdRef.current = userId;
            setStats(null);
          }
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [user?.id]),
  );

  return { stats, loading };
}
