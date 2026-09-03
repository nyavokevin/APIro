export interface SeedSnapshot {
  id: string;
  requestId: string;
  body: string;
  createdAt: number;
  hash: string;
}

const STORAGE_KEY = 'apiro.seedSnapshots';

function hashStr(s: string): string {
  let h = 0;
  for (let i=0;i<s.length;i++) h = ((h<<5)-h)+s.charCodeAt(i) |0;
  return h.toString(16);
}

export function getSeedSnapshots(requestId?: string): SeedSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr: SeedSnapshot[] = JSON.parse(raw);
    if (requestId) return arr.filter(s=>s.requestId===requestId);
    return arr;
  } catch { return []; }
}

export function pushSeedSnapshot(requestId: string, body: string) {
  try {
    const snapshots = getSeedSnapshots();
    const hash = hashStr(body);
    // dedupe identical body for same request
    if (snapshots.some(s=>s.requestId===requestId && s.hash===hash)) return;
    const snap: SeedSnapshot = { id: `seed_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, requestId, body, createdAt: Date.now(), hash };
    const next = [snap, ...snapshots].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function deleteSeedSnapshot(id: string) {
  try {
    const next = getSeedSnapshots().filter(s=>s.id!==id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}
