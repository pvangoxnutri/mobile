// TEMPORARY DIAGNOSTIC INSTRUMENTATION — added to measure the ~30s cold-start
// regression reported on physical iPhones. Every line logged here is
// prefixed "[STARTUP]" so it's trivial to grep out of the Metro log and,
// once the root cause is confirmed and fixed, trivial to delete this whole
// file plus its call sites. Not meant to ship to production long-term.

const appBootAt = Date.now();

function elapsed(): number {
  return Date.now() - appBootAt;
}

export function markStartup(label: string, extra?: Record<string, unknown>): void {
  console.log(`[STARTUP] +${elapsed()}ms ${label}`, extra ?? '');
}

// Wraps a promise-returning operation with start/end/fail markers and a
// measured duration, without changing its resolved value or error.
export async function timeStartup<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  markStartup(`${label} → start`);
  try {
    const result = await fn();
    markStartup(`${label} → done (${Date.now() - start}ms)`);
    return result;
  } catch (err) {
    markStartup(`${label} → FAILED (${Date.now() - start}ms)`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// Same as timeStartup but for synchronous work (cache reads, etc.) where we
// still want a marker even though duration will be ~0ms — confirms it's NOT
// the bottleneck rather than just assuming so.
export function markStartupSync<T>(label: string, fn: () => T): T {
  const start = Date.now();
  const result = fn();
  markStartup(`${label} (${Date.now() - start}ms)`);
  return result;
}
