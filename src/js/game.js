import * as content from './content.js';
import * as chat from './chat.js';
import * as scoring from './scoring.js';
import * as storage from './storage.js';
import * as llm from './llm.js';

const state = {
  difficulty: null,     // DIFFICULTY entry
  diffKey: 'easy',
  combo: null,          // { opening, situation, customerType, name }
  mood: 0,
  profit: 100,
  duration: 180,
  timeLeft: 180,
  deflectCount: 0,
  turns: 0,
  busy: false,
  finished: false,
  timerId: null,
  usedTyping: false,    // for Normal mode scoring bonus
  creativityBonus: 0,   // accumulated across turns from LLM
  llmActiveThisMatch: false,
  recentReplies: [],    // last N customer replies, sent to LLM as anti-repetition context
};

const MAX_RECENT_REPLIES = 3;

let onFinish = null;
const $ = (id) => document.getElementById(id);

export function bindFinishCallback(fn) {
  onFinish = fn;
}

export async function startMatch(diffKey) {
  state.diffKey = diffKey;
  state.difficulty = scoring.DIFFICULTY[diffKey];

  state.combo = content.pickRandomCombo();
  state.mood = state.combo.customerType.starting_mood;
  state.profit = 100;
  state.duration = state.difficulty.duration;
  state.timeLeft = state.duration;
  state.deflectCount = 0;
  state.turns = 0;
  state.busy = true;
  state.finished = false;
  state.usedTyping = false;
  state.creativityBonus = 0;
  state.recentReplies = [];

  // Decide whether to attempt LLM this match (normal/hardcore). Probe Ollama
  // up-front so HUD pill is accurate from the first turn.
  const wantLLM = diffKey !== 'easy';
  if (wantLLM) {
    await llm.probeOllama({ force: true });
    const s = llm.getStatus();
    state.llmActiveThisMatch = s.available && s.modelPresent;
  } else {
    state.llmActiveThisMatch = false;
  }
  updateAIPill();
  setupResponseMode();

  setupHUD();
  setupHeader();
  setupChoiceButtons();
  setupTypingInput();
  chat.clearChat();
  updateHUD();

  await chat.addCustomerBubbles(state.combo.opening.messages, state.combo.customerType.avatar_emoji);
  state.busy = false;

  // start timer only after the opening renders
  startTimer();

  // Focus typing input if in typing-enabled mode
  if (diffKey !== 'easy') $('playerInput').focus();
}

function setupHUD() {
  const { situation, customerType } = state.combo;
  $('shopIco').textContent = situation.shop_short;
  $('shopName').textContent = `${situation.icon} ร้าน ${situation.shop_name}`;
  $('typeTag').textContent = `${customerType.icon} ${customerType.name}`;
}

function setupHeader() {
  const { customerType, name } = state.combo;
  $('custName').textContent = name;
  $('custAvatar').innerHTML = `${customerType.avatar_emoji}<div class="active-dot"></div>`;
}

function setupChoiceButtons() {
  document.querySelectorAll('.responses .btn').forEach(btn => {
    const resp = btn.dataset.resp;
    const line = content.getPlayerLineExample(resp);
    btn.querySelector('[data-line]').textContent = `"${line}"`;
    btn.onclick = () => handleResponse(resp, { source: 'choice' });
  });
  $('responses').classList.remove('locked');
}

function setupTypingInput() {
  const input = $('playerInput');
  const send = $('sendBtn');
  input.value = '';
  // Idempotent: clear previous handlers by reassigning .on*
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitTyped();
    }
  };
  send.onclick = submitTyped;
}

function submitTyped() {
  const input = $('playerInput');
  const text = input.value.trim();
  if (!text) return;
  if (state.busy || state.finished) return;
  input.value = '';
  state.usedTyping = true;
  handleResponse(null, { source: 'typed', text });
}

function setupResponseMode() {
  const el = $('responses');
  el.classList.remove('mode-easy', 'mode-normal', 'mode-hardcore');
  el.classList.add(`mode-${state.diffKey}`);
  // Update header label/hint
  const lbl = $('respLabel');
  const hint = $('respHint');
  if (state.diffKey === 'easy') {
    lbl.textContent = 'เลือกคำตอบ';
    hint.textContent = 'tap ↓';
  } else if (state.diffKey === 'normal') {
    lbl.textContent = 'พิมพ์ตอบ หรือเลือกปุ่ม';
    hint.textContent = state.llmActiveThisMatch ? '🤖 AI ประเมิน' : '📋 template';
  } else {
    lbl.textContent = 'พิมพ์ตอบลูกค้า';
    hint.textContent = state.llmActiveThisMatch ? '🔥 AI หิน' : '⚠️ AI offline';
  }
}

function updateAIPill() {
  const pill = $('aiPill');
  pill.classList.remove('ok', 'tpl', 'warn');
  if (state.llmActiveThisMatch) {
    pill.classList.add('ok');
    pill.textContent = '🤖 AI ON';
  } else if (state.diffKey === 'easy') {
    pill.classList.add('tpl');
    pill.textContent = '📋 TEMPLATE';
  } else {
    pill.classList.add('warn');
    pill.textContent = '⚠️ AI OFF';
  }
}

function startTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    if (state.finished) return;
    state.timeLeft = Math.max(0, state.timeLeft - 1);
    updateTimer();
    if (state.timeLeft <= 0) endMatch('timeout');
  }, 1000);
}

function updateTimer() {
  const t = $('timer');
  t.textContent = scoring.formatTime(state.timeLeft);
  t.classList.toggle('danger', state.timeLeft <= 30);
}

function updateHUD() {
  $('moodVal').textContent = `${state.mood} / 100`;
  $('profitVal').textContent = `${state.profit} / 100`;
  const moodBar = $('moodBar');
  moodBar.style.width = state.mood + '%';
  moodBar.classList.remove('mid', 'good');
  const tier = scoring.moodTier(state.mood);
  if (tier === 'mid') moodBar.classList.add('mid');
  if (tier === 'good') moodBar.classList.add('good');
  $('profitBar').style.width = state.profit + '%';
  updateTimer();
}

/**
 * Unified response handler. Either a choice button or a typed message.
 *
 * @param {string|null} responseType  one of yield/negotiate/refuse/deflect, or null for free-form
 * @param {{ source: 'choice' | 'typed', text?: string }} ctx
 */
async function handleResponse(responseType, ctx) {
  if (state.busy || state.finished) return;
  state.busy = true;
  state.turns++;
  $('responses').classList.add('locked');

  let playerLine;
  if (ctx.source === 'typed') {
    playerLine = ctx.text;
  } else {
    playerLine = content.pickPlayerLine(responseType);
  }
  chat.addPlayerBubble(playerLine);
  await sleep(350);

  // Show typing immediately for snappier feedback while LLM thinks
  const reaction = await getCustomerReaction(responseType, ctx, playerLine);

  scoring.applyReaction(state, reaction, responseType || classifyTypedResponse(playerLine), state.difficulty);
  if (reaction.creativity_bonus) state.creativityBonus += reaction.creativity_bonus;
  updateHUD();

  await chat.addCustomerBubbles(reaction.messages, state.combo.customerType.avatar_emoji);

  // Track the customer's reply for anti-repetition in the next LLM call
  const replyJoined = (reaction.messages || []).join(' ').trim();
  if (replyJoined) {
    state.recentReplies.push(replyJoined);
    if (state.recentReplies.length > MAX_RECENT_REPLIES) {
      state.recentReplies.shift();
    }
  }

  if (state.mood >= 80) return endMatch('win');
  if (state.mood <= 0) return endMatch('lose');

  state.busy = false;
  $('responses').classList.remove('locked');
  if (state.diffKey !== 'easy') $('playerInput').focus();
}

/**
 * Centralized reaction source.
 * - Easy: template lookup (Phase 1 behavior)
 * - Normal/Hardcore: try LLM; on failure, fall back to template
 *
 * Phase 2 hook lives here.
 */
async function getCustomerReaction(responseType, ctx, playerLine) {
  // Easy mode + choice button → template, no LLM
  if (state.diffKey === 'easy') {
    return content.getReaction(state.combo.customerType.id, responseType) || templateFallback(responseType);
  }

  // For typed messages or normal/hardcore: try LLM first if active
  if (state.llmActiveThisMatch) {
    // Pre-classify intent so the hybrid safety net in llm.js can correct
    // LLM mood/profit numbers if they're nonsensical for the player's intent.
    const intent = responseType || classifyTypedResponse(playerLine);
    const templateReaction = content.getReaction(state.combo.customerType.id, intent);

    const llmCtx = {
      shop_name: state.combo.situation.shop_name,
      category: state.combo.situation.category,
      complaint: state.combo.situation.complaint,
      policy: state.combo.situation.policy,
      context_for_llm: state.combo.situation.context_for_llm,
      customer_type_name: state.combo.customerType.name,
      tone_description: state.combo.customerType.tone_description,
      customer_name: state.combo.name,
      mood: state.mood,
      profit: state.profit,
      turns: state.turns,
      recent_replies: state.recentReplies.slice(),
    };
    const out = await llm.generateReaction(llmCtx, playerLine, { intent, templateReaction });
    if (out.ok) {
      if (out.overrides && (out.overrides.mood || out.overrides.profit || out.overrides.reply)) {
        console.info('[LLM] hybrid overrode:', out.overrides);
      }
      return {
        mood_change: out.mood_change,
        profit_change: out.profit_change,
        creativity_bonus: out.creativity_bonus,
        messages: out.messages,
      };
    }
    // LLM failed mid-game — flag and keep going with template
    console.warn('[LLM] fallback:', out.reason, out.error);
    flagLLMDegraded();
  }

  // Normal mode + choice button: use template directly (still gets ×1.3 score)
  if (ctx.source === 'choice' && responseType) {
    return content.getReaction(state.combo.customerType.id, responseType) || templateFallback(responseType);
  }

  // Typed message + no LLM: classify intent, use template
  const inferred = classifyTypedResponse(playerLine);
  return content.getReaction(state.combo.customerType.id, inferred) || templateFallback(inferred);
}

function flagLLMDegraded() {
  state.llmActiveThisMatch = false;
  updateAIPill();
  const hint = $('respHint');
  if (state.diffKey === 'normal') hint.textContent = '⚠ ใช้ template';
  if (state.diffKey === 'hardcore') hint.textContent = '⚠ AI ล่ม → template';
}

/**
 * Best-effort classifier for typed messages when no LLM is available.
 * Returns one of yield/negotiate/refuse/deflect based on keyword heuristics.
 */
function classifyTypedResponse(text) {
  const t = (text || '').toLowerCase();
  // Yield signals
  if (/(คืนเงิน|คืนเต็ม|รับผิดชอบ|ขอโทษ.*คืน|จัดการให้|ทำใหม่ให้ฟรี|ส่งใหม่ให้)/.test(t)) return 'yield';
  // Negotiate signals
  if (/(ส่วนลด|คูปอง|แถม|ลดให้|ชดเชย|ของขวัญ|ครั้งหน้า|gift)/.test(t)) return 'negotiate';
  // Deflect signals
  if (/(หัวหน้า|ตรวจสอบ|รอสักครู่|เช็คก่อน|สอบถาม|รอแป๊บ|รอแป๊ป)/.test(t)) return 'deflect';
  // Default: refuse (most explicit "no" patterns)
  if (/(ไม่|ขอ ?อภัย|ไม่สามารถ|ไม่รับ|นโยบาย)/.test(t)) return 'refuse';
  return 'negotiate';
}

function templateFallback(responseType) {
  return { mood_change: 0, profit_change: 0, creativity_bonus: 0, messages: ['...'] };
}

function endMatch(result) {
  if (state.finished) return;
  state.finished = true;
  state.busy = true;
  clearInterval(state.timerId);
  $('responses').classList.add('locked');

  const baseScore = scoring.calcFinalScore({
    mood: state.mood,
    profit: state.profit,
    timeLeft: state.timeLeft,
    duration: state.duration,
  }, result, state.difficulty);

  // Typing + creativity bonuses (only matter in normal/hardcore, only if positive base)
  let bonusMultiplier = 1.0;
  if (state.diffKey === 'normal' && state.usedTyping) bonusMultiplier *= 1.15;
  const creativityFactor = 1 + (state.creativityBonus / 200); // up to +50% if maxed across turns
  const finalScore = Math.round(baseScore * bonusMultiplier * creativityFactor);

  const entry = {
    score: finalScore,
    baseScore,
    creativityBonus: state.creativityBonus,
    usedTyping: state.usedTyping,
    result,
    mood: state.mood,
    profit: state.profit,
    timeLeft: state.timeLeft,
    duration: state.duration,
    diff: state.diffKey,
    shop: state.combo.situation.shop_name,
    type: state.combo.customerType.name,
    llm: state.llmActiveThisMatch,
  };
  const isNewBest = storage.maybeUpdateBest(entry);
  storage.pushHistory(entry);

  if (result === 'win') chat.addSystemBanner('🎉 ลูกค้ายิ้ม — ปิดเคสได้!');
  if (result === 'lose') chat.addSystemBanner('💀 ลูกค้าฉุน — โดน 1 ดาว');
  if (result === 'timeout') chat.addSystemBanner('⏱ หมดเวลา — เคสค้าง');

  setTimeout(() => {
    if (onFinish) onFinish({ ...entry, isNewBest });
  }, 1200);
}

export function abortMatch() {
  clearInterval(state.timerId);
  state.finished = true;
  state.busy = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
