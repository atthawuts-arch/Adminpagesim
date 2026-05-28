export const RESPONSE_BASE = {
  yield:     { moodChange:  30, profitChange: -40 },
  negotiate: { moodChange:  15, profitChange: -10 },
  refuse:    { moodChange: -10, profitChange:   0 },
  deflect:   { moodChange:   0, profitChange:   0 },
};

export const DIFFICULTY = {
  easy:     { label: 'Easy',     duration: 180, scoreMul: 1.0, harshness: 1.0 },
  normal:   { label: 'Normal',   duration: 180, scoreMul: 1.3, harshness: 1.15 },
  hardcore: { label: 'Hardcore', duration: 150, scoreMul: 1.6, harshness: 1.3 },
};

export const RESULT_MUL = {
  win:     1.0,
  timeout: 0.6,
  lose:    0.2,
};

export const RANKS = [
  { min:    0, emoji: '💀', label: 'แอดมินมือใหม่' },
  { min:  500, emoji: '😐', label: 'รอด' },
  { min: 1500, emoji: '😊', label: 'ดี' },
  { min: 3000, emoji: '🌟', label: 'เยี่ยม' },
  { min: 5000, emoji: '👑', label: 'GOAT แอดมิน' },
];

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Apply a player response to the running state.
 * Returns the actual deltas applied (post-clamp).
 *
 * @param {object} state - { mood, profit, deflectCount }
 * @param {object} reaction - reaction template from content
 * @param {string} responseType - 'yield' | 'negotiate' | 'refuse' | 'deflect'
 * @param {object} difficulty - DIFFICULTY entry
 */
export function applyReaction(state, reaction, responseType, difficulty) {
  let moodDelta = reaction.mood_change ?? 0;
  let profitDelta = reaction.profit_change ?? 0;

  // Harsher difficulties: amplify negative mood swings, soften positive ones.
  const h = difficulty.harshness;
  if (moodDelta < 0) moodDelta = Math.round(moodDelta * h);
  else if (moodDelta > 0) moodDelta = Math.round(moodDelta / h);

  // Repeat-deflect penalty: every deflect after the first stacks -5 mood.
  if (responseType === 'deflect' && state.deflectCount >= 1) {
    moodDelta -= 5;
  }

  const prevMood = state.mood;
  const prevProfit = state.profit;
  state.mood = clamp(prevMood + moodDelta, 0, 100);
  state.profit = clamp(prevProfit + profitDelta, 0, 100);

  if (responseType === 'deflect') state.deflectCount = (state.deflectCount || 0) + 1;

  return {
    moodDelta: state.mood - prevMood,
    profitDelta: state.profit - prevProfit,
  };
}

/**
 * @param {object} stats - { mood, profit, timeLeft, duration }
 * @param {'win'|'lose'|'timeout'} result
 * @param {object} difficulty
 */
export function calcFinalScore(stats, result, difficulty) {
  const timePct = clamp(stats.timeLeft / stats.duration, 0, 1);
  const base = stats.mood * stats.profit * timePct;
  const total = base * difficulty.scoreMul * RESULT_MUL[result];
  return Math.round(total);
}

export function getRank(score) {
  let best = RANKS[0];
  for (const r of RANKS) if (score >= r.min) best = r;
  return best;
}

export function moodTier(mood) {
  if (mood >= 70) return 'good';
  if (mood >= 40) return 'mid';
  return 'bad';
}

export function formatTime(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = String(Math.max(0, sec) % 60).padStart(2, '0');
  return `${m}:${s}`;
}
