const KEY_BEST = 'adminsim.bestScore.v1';
const KEY_HISTORY = 'adminsim.history.v1';

export function getBestScore() {
  try {
    const v = localStorage.getItem(KEY_BEST);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function setBestScore(entry) {
  try {
    localStorage.setItem(KEY_BEST, JSON.stringify(entry));
  } catch {}
}

export function maybeUpdateBest(entry) {
  if (entry.score <= 0) return false;
  const cur = getBestScore();
  if (!cur || entry.score > cur.score) {
    setBestScore(entry);
    return true;
  }
  return false;
}

export function getHistory() {
  try {
    const v = localStorage.getItem(KEY_HISTORY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry) {
  try {
    const arr = getHistory();
    arr.unshift({ ...entry, ts: Date.now() });
    localStorage.setItem(KEY_HISTORY, JSON.stringify(arr.slice(0, 20)));
  } catch {}
}

export function clearAll() {
  try {
    localStorage.removeItem(KEY_BEST);
    localStorage.removeItem(KEY_HISTORY);
  } catch {}
}
