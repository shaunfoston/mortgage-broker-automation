export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (!ms && ms !== 0) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as any;
    if (anyE.fields && typeof anyE.fields === 'object' && Object.keys(anyE.fields).length) {
      return `${anyE.message}: ${Object.values(anyE.fields).join('; ')}`;
    }
    if (typeof anyE.message === 'string') return anyE.message;
  }
  return String(e);
}

export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
  } catch {
    return 'Unknown';
  }
}
