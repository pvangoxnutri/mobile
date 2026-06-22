import { Image } from 'expo-image';

// Module-level — persists across screens/remounts so we never ask expo-image
// to prefetch a URL we already successfully warmed this session, even if
// the caller re-renders with the same member list repeatedly.
const prefetchedUrls = new Set<string>();

/**
 * Warms expo-image's memory+disk cache for a set of avatar URLs in the
 * background. Fire-and-forget by design: never await this before rendering
 * — Avatar already renders fine without it (this just removes the
 * first-paint pop the very first time a URL is ever seen on the device).
 * Dedupes both within a single call and across calls for the app session.
 */
export function prefetchAvatars(urls: Array<string | null | undefined>): void {
  const toFetch = Array.from(new Set(urls.filter((u): u is string => Boolean(u && u.trim()))))
    .filter((url) => !prefetchedUrls.has(url));

  if (toFetch.length === 0) return;

  for (const url of toFetch) {
    prefetchedUrls.add(url);
  }

  void Image.prefetch(toFetch, 'memory-disk').catch(() => {
    // Best-effort only — a failed prefetch just means Avatar falls back to
    // its normal load-on-mount behavior for that URL. Un-mark so a later
    // attempt (e.g. URL becomes reachable again) isn't permanently skipped.
    for (const url of toFetch) {
      prefetchedUrls.delete(url);
    }
  });
}
