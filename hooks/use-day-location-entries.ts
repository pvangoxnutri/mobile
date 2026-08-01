// The one owner of "which places does each day have". One fetch per adventure,
// grouped by date in memory — never a request per day.
//
// State lives here rather than in the feed screen and the sheet separately, so
// an add/edit/delete/reorder in the sheet is immediately visible in the feed
// without either component pushing state into the other, and without leaving
// and re-entering the adventure.

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addTripDayLocationEntry,
  deleteTripDayLocationEntry,
  fetchTripDayLocationEntries,
  getCachedTripDayLocationEntries,
  reorderTripDayLocationEntries,
  updateTripDayLocationEntry,
  type SetDayLocationInput,
} from '@/lib/day-location-api';
import type { TripDayLocationEntry } from '@/lib/types';

export type DayLocationEntriesController = {
  /** Stored places for one date, already ordered by sortIndex. Empty array for
   * a date the user has never set — a carried-forward day has no stored rows,
   * so it must not render editable places. */
  forDate: (date: string) => TripDayLocationEntry[];
  /** The flat list, for callers that need every row at once — building
   * slideshow items, for instance. */
  all: TripDayLocationEntry[];
  loading: boolean;
  /** Re-reads from the server. The mutators call this themselves; exposed for
   * a focus-effect refresh. */
  refresh: () => Promise<void>;
  addEntry: (date: string, input: SetDayLocationInput) => Promise<void>;
  updateEntry: (entryId: string, input: SetDayLocationInput) => Promise<void>;
  removeEntry: (entryId: string) => Promise<void>;
  reorder: (date: string, orderedIds: string[]) => Promise<void>;
};

export function useDayLocationEntries(tripId: string | undefined): DayLocationEntriesController {
  const [entries, setEntries] = useState<TripDayLocationEntry[]>(() =>
    tripId ? getCachedTripDayLocationEntries(tripId) ?? [] : [],
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const data = await fetchTripDayLocationEntries(tripId);
      if (Array.isArray(data)) setEntries(data);
    } catch {
      // Keep whatever is already on screen — a failed refresh must not blank
      // the feed's locations.
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byDate = useMemo(() => {
    const map = new Map<string, TripDayLocationEntry[]>();
    for (const entry of entries) {
      const date = entry.startDate.slice(0, 10);
      const bucket = map.get(date) ?? [];
      bucket.push(entry);
      map.set(date, bucket);
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.sortIndex - b.sortIndex);
    return map;
  }, [entries]);

  const forDate = useCallback((date: string) => byDate.get(date.slice(0, 10)) ?? [], [byDate]);

  // Every mutator refetches rather than patching local state: the server owns
  // sortIndex (it reindexes on insert and delete), so guessing the resulting
  // order locally would be a second implementation of a rule that already
  // exists in exactly one place. Errors propagate to the caller, which is what
  // shows the message and — for reorder — restores the previous order.
  const addEntry = useCallback(
    async (date: string, input: SetDayLocationInput) => {
      if (!tripId) return;
      await addTripDayLocationEntry(tripId, { ...input, startDate: date });
      await refresh();
    },
    [tripId, refresh],
  );

  const updateEntry = useCallback(
    async (entryId: string, input: SetDayLocationInput) => {
      if (!tripId) return;
      await updateTripDayLocationEntry(tripId, entryId, input);
      await refresh();
    },
    [tripId, refresh],
  );

  const removeEntry = useCallback(
    async (entryId: string) => {
      if (!tripId) return;
      await deleteTripDayLocationEntry(tripId, entryId);
      await refresh();
    },
    [tripId, refresh],
  );

  const reorder = useCallback(
    async (date: string, orderedIds: string[]) => {
      if (!tripId) return;
      await reorderTripDayLocationEntries(tripId, date, orderedIds);
      await refresh();
    },
    [tripId, refresh],
  );

  return { forDate, all: entries, loading, refresh, addEntry, updateEntry, removeEntry, reorder };
}
