// TEMPORARY: In-memory debug log buffer for iPhone preview diagnostics.
// Remove this file (and its callers) once the API/auth issue is resolved.

export type DebugLogLevel = 'info' | 'warn' | 'error';

export type DebugLogEntry = {
  id: number;
  ts: number;
  level: DebugLogLevel;
  source: string;
  method?: string;
  path?: string;
  status?: number;
  auth?: 'yes' | 'no';
  body?: string;
  message?: string;
};

const MAX_ENTRIES = 200;
const BODY_MAX = 200;
const MESSAGE_MAX = 300;

let nextId = 1;
const entries: DebugLogEntry[] = [];
const listeners = new Set<() => void>();

function truncate(value: string | undefined, max: number): string | undefined {
  if (value == null) return undefined;
  return value.length > max ? value.slice(0, max) + '…' : value;
}

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function addDebugLog(entry: Omit<DebugLogEntry, 'id' | 'ts'> & { ts?: number }) {
  const record: DebugLogEntry = {
    id: nextId++,
    ts: entry.ts ?? Date.now(),
    level: entry.level,
    source: entry.source,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    auth: entry.auth,
    body: truncate(entry.body, BODY_MAX),
    message: truncate(entry.message, MESSAGE_MAX),
  };

  entries.push(record);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  emit();
}

export function getDebugLogs(): DebugLogEntry[] {
  return entries.slice();
}

export function clearDebugLogs() {
  entries.length = 0;
  emit();
}

export function subscribeDebugLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function formatDebugLogEntry(entry: DebugLogEntry): string {
  const time = formatTime(entry.ts);
  const parts = [`[${time}]`, `[${entry.level.toUpperCase()}]`, `[${entry.source}]`];
  if (entry.method) parts.push(entry.method);
  if (entry.path) parts.push(entry.path);
  if (entry.status != null) parts.push(`→ ${entry.status}`);
  if (entry.auth) parts.push(`(auth: ${entry.auth})`);
  if (entry.message) parts.push(`- ${entry.message}`);
  if (entry.body) parts.push(`body: ${entry.body}`);
  return parts.join(' ');
}

export function formatDebugLogsAsText(): string {
  return entries.map(formatDebugLogEntry).join('\n');
}
