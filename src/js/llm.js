/**
 * LLM client for Phase 2 modes (Normal / Hardcore).
 *
 * Dual-backend (auto-detected):
 *   • Electron / local dev (app:// or file://)   →  Ollama at 127.0.0.1:11434
 *   • Hosted web (http/https)                    →  POST /api/llm/turn (server proxies to Typhoon API)
 *
 * Override via window.ADMINSIM_BACKEND = 'ollama' | 'server'
 *
 * Returns { ok, mood_change, profit_change, creativity_bonus, messages, source, overrides }
 */

const OLLAMA_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'scb10x/llama3.1-typhoon2-8b-instruct';
const TIMEOUT_MS = 15000;
const RETRY_TIMEOUT_MS = 10000;
const SERVER_TIMEOUT_MS = 20000;

function detectBackend() {
  if (typeof window === 'undefined') return 'server';
  if (window.ADMINSIM_BACKEND === 'ollama' || window.ADMINSIM_BACKEND === 'server') {
    return window.ADMINSIM_BACKEND;
  }
  // app:// = Electron, file:// = direct double-click → use local Ollama
  if (location.protocol === 'app:' || location.protocol === 'file:') return 'ollama';
  return 'server';
}

const BACKEND = detectBackend();

let _status = {
  checked: false,
  available: false,
  modelPresent: false,
  model: DEFAULT_MODEL,
  error: null,
};

/**
 * Few-shot examples to anchor the model. Kept compact to save tokens.
 * Do NOT copy the customer_reply text verbatim — model has shown a tendency
 * to echo. We pick fresh expressive sample replies that aren't in the
 * canonical 28 reactions used in choice mode.
 */
const FEW_SHOTS = [
  {
    persona: 'ดราม่า (น้องนุ่น) มู้ด 25/100 ร้านครีม',
    admin: 'ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ 🙏',
    out: { mood_change: 32, profit_change: -40, creativity_bonus: 5, customer_reply: 'พี่ใจดีจังเลยค่าาา 😭💖 หนูประทับใจจริงๆ เลย ขอบคุณนะคะะะ' },
  },
  {
    persona: 'พลิก (น้องพิม) มู้ด 50/100 ร้านเสื้อผ้า',
    admin: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    out: { mood_change: -30, profit_change: 0, creativity_bonus: 0, customer_reply: 'หา?? อะไรนะ?? ปฏิเสธหนูเหรอ?? ขอ MANAGER เดี๋ยวนี้!! 🤬🤬' },
  },
  {
    persona: 'ขู่ (คุณมิ้น) มู้ด 18/100 ร้านอาหาร',
    admin: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    out: { mood_change: 12, profit_change: -10, creativity_bonus: 8, customer_reply: 'เอาก็เอาวะ ค่อยยังชั่ว แต่เตือนนะ ครั้งต่อไปขอเต็ม' },
  },
];

const RULES_BY_INTENT = {
  yield:     { mood: '+25 ถึง +35', profit: '-35 ถึง -45' },
  negotiate: { mood: '+8 ถึง +18',  profit: '-5 ถึง -15' },
  refuse:    { mood: '-10 ถึง -25 (สายพลิก -28~-32, สายขู่ -22~-28)', profit: '0 (ขู่ลงรีวิว: -10~-15)' },
  deflect:   { mood: '-5 ถึง 0',    profit: '0' },
};

/* ========================================================================
 * Probe + status
 * ===================================================================== */

export async function probeOllama({ force = false, model = DEFAULT_MODEL } = {}) {
  // Kept as the legacy name, dispatches to whichever backend is active.
  return probeBackend({ force, model });
}

export async function probeBackend({ force = false, model = DEFAULT_MODEL } = {}) {
  if (_status.checked && !force) return _status;
  _status = { checked: true, available: false, modelPresent: false, model, backend: BACKEND, error: null };

  try {
    if (BACKEND === 'ollama') {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) { _status.error = `HTTP ${res.status}`; return _status; }
      const body = await res.json();
      _status.available = true;
      _status.modelPresent = (body.models || []).some(m => m.name === model || m.name?.startsWith(model));
    } else {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) { _status.error = `HTTP ${res.status}`; return _status; }
      const body = await res.json();
      _status.available = !!body.ok;
      _status.modelPresent = !!body.llmConfigured;
      _status.model = body.model || model;
    }
  } catch (e) {
    _status.error = e.message || String(e);
  }
  return _status;
}

export function getStatus() {
  return _status;
}

export function getBackend() {
  return BACKEND;
}

/* ========================================================================
 * Prompt builder (v2)
 * ===================================================================== */

function buildSystemPrompt(ctx, playerMessage) {
  return [
    '=== บทบาท ===',
    `คุณคือลูกค้าของร้าน ${ctx.shop_name} (${ctx.category})`,
    `ปัญหาที่คุณ complain: ${ctx.complaint}`,
    `นโยบายร้าน: ${ctx.policy}`,
    `บริบทเพิ่ม: ${ctx.context_for_llm}`,
    '',
    '=== บุคลิกของคุณ ===',
    `สาย: ${ctx.customer_type_name}`,
    `ลักษณะ: ${ctx.tone_description}`,
    `ชื่อ: ${ctx.customer_name} (ผู้หญิงเสมอ ใช้ "ค่ะ/หนู" ห้าม "ครับ/ผม")`,
    `มู้ดปัจจุบัน: ${ctx.mood}/100 (ยิ่งต่ำยิ่งโกรธ ยิ่งสูงยิ่งใจเย็น)`,
    `รอบที่: ${ctx.turns + 1}`,
    '',
    '=== กติกาประเมิน ===',
    'หลังแอดมินตอบ คุณต้องประเมิน 3 ค่า + ตอบกลับ:',
    '',
    '1) mood_change (จำนวนเต็ม -35 ถึง +35)',
    `   • ยอม (คืนเงิน/ทำใหม่ฟรี/ส่งของใหม่ฟรี/เปลี่ยนของให้):  mood ${RULES_BY_INTENT.yield.mood}`,
    `   • เจรจา (ส่วนลด/คูปอง/แถม/sample):              mood ${RULES_BY_INTENT.negotiate.mood}`,
    `   • ปฏิเสธ (อ้างนโยบาย ไม่ให้):                    mood ${RULES_BY_INTENT.refuse.mood}`,
    `   • ปั่น (โยนหัวหน้า/รอตรวจสอบ):                   mood ${RULES_BY_INTENT.deflect.mood}`,
    '',
    '2) profit_change (จำนวนเต็ม -45 ถึง 0)  *** ห้ามเป็นบวกเด็ดขาด ***',
    `   • ยอม:    ${RULES_BY_INTENT.yield.profit}`,
    `   • เจรจา:  ${RULES_BY_INTENT.negotiate.profit}`,
    `   • ปฏิเสธ: ${RULES_BY_INTENT.refuse.profit}`,
    `   • ปั่น:   ${RULES_BY_INTENT.deflect.profit}`,
    '   หมายเหตุ: "ส่งของใหม่ฟรี" = ยอม → profit -35~-45 (ไม่ใช่ 0!)',
    '',
    '3) creativity_bonus (0-20): คะแนนถ้าแอดมินตอบฉลาด มี empathy + แก้ปัญหา',
    '',
    '4) customer_reply: 1-3 ประโยค ในบุคลิก ใช้ "ค่ะ/หนู" *** ห้ามเป็น null/undefined ***',
    '',
    '=== ตัวอย่างเพื่อทำความเข้าใจ format (อย่าคัดลอกข้อความตอบ) ===',
    ...FEW_SHOTS.flatMap((ex, i) => [
      `[ลูกค้า] ${ex.persona}`,
      `[แอดมิน] "${ex.admin}"`,
      `[ผล] ${JSON.stringify(ex.out)}`,
      '',
    ]),
    '=== ตาคุณแล้ว — สร้างคำตอบที่ไม่ซ้ำกับตัวอย่าง ===',
    `[ลูกค้า] ${ctx.customer_type_name} (${ctx.customer_name}) มู้ด ${ctx.mood}/100 ร้าน ${ctx.shop_name}`,
    `[แอดมิน] "${playerMessage}"`,
    `[ผล] ตอบเป็น JSON เท่านั้น มี 4 keys ครบ: mood_change, profit_change, creativity_bonus, customer_reply`,
  ].join('\n');
}

/* ========================================================================
 * Ollama call
 * ===================================================================== */

async function callOllama(messages, { timeout = TIMEOUT_MS, model = DEFAULT_MODEL } = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        format: 'json',
        stream: false,
        options: { temperature: 0.8, num_predict: 240, top_p: 0.9 },
        messages,
      }),
    });
    clearTimeout(tid);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json();
    const raw = body?.message?.content || '';
    const data = extractJSON(raw);
    if (!data) return { ok: false, error: 'JSON parse failed', raw };
    return { ok: true, data, raw };
  } catch (e) {
    clearTimeout(tid);
    return { ok: false, error: e.name === 'AbortError' ? 'timeout' : (e.message || String(e)) };
  }
}

function extractJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

/* ========================================================================
 * Sanitization + hybrid safety net
 * ===================================================================== */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function splitReply(text) {
  if (!text || text.length <= 60) return [text || '...'];
  const breaks = [...text.matchAll(/[.!?。！？\n]\s*/g)];
  const mid = text.length / 2;
  const pivot = breaks.find(m => m.index >= mid - 20);
  if (!pivot) return [text];
  const cut = pivot.index + pivot[0].length;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
}

function sanitize(data) {
  const moodChange = Number.isFinite(data?.mood_change) ? clamp(Math.round(data.mood_change), -40, 40) : null;
  const profitChange = Number.isFinite(data?.profit_change) ? clamp(Math.round(data.profit_change), -50, 5) : null;
  const creativity = Number.isFinite(data?.creativity_bonus) ? clamp(Math.round(data.creativity_bonus), 0, 20) : 0;
  let reply = (typeof data?.customer_reply === 'string' ? data.customer_reply : '').trim();
  return {
    mood_change: moodChange,
    profit_change: profitChange,
    creativity_bonus: creativity,
    customer_reply: reply,
  };
}

/**
 * Hybrid safety net. The model gets the direction right ~80% of the time
 * but can mis-quantify or flip profit signs. If a strong intent is provided
 * (from caller's keyword classifier), and LLM's numbers are wildly off, we
 * override with template values. The LLM's customer_reply text is kept either
 * way — that's what we trust the LLM for.
 *
 * Override rules:
 *   - LLM profit > 0  →  template (LLM violated "profit ≤ 0" rule)
 *   - LLM mood sign disagrees with intent →  template
 *   - LLM mood out of plausible range for intent →  template
 *   - LLM null reply →  template reply
 */
function reconcileWithIntent(llmOut, intent, templateReaction) {
  const out = {
    mood_change: llmOut.mood_change,
    profit_change: llmOut.profit_change,
    creativity_bonus: llmOut.creativity_bonus,
    customer_reply: llmOut.customer_reply,
    overridden: { mood: false, profit: false, reply: false },
  };

  const tplMood = templateReaction?.mood_change ?? 0;
  const tplProfit = templateReaction?.profit_change ?? 0;
  const tplMessages = templateReaction?.messages || ['...'];

  // 1. Profit must never be positive
  if (out.profit_change === null || out.profit_change > 0) {
    out.profit_change = tplProfit;
    out.overridden.profit = true;
  }

  // 2. Mood: if null, or sign disagrees with template direction, override
  if (out.mood_change === null) {
    out.mood_change = tplMood;
    out.overridden.mood = true;
  } else if (intent && tplMood !== 0) {
    const tplSign = Math.sign(tplMood);
    const llmSign = Math.sign(out.mood_change);
    if (tplSign !== 0 && llmSign !== 0 && tplSign !== llmSign) {
      // sign flip — override
      out.mood_change = tplMood;
      out.overridden.mood = true;
    } else {
      // magnitude sanity: if LLM mood differs by > 20 from template, clamp
      // toward template ± 10
      const diff = Math.abs(out.mood_change - tplMood);
      if (diff > 20) {
        // halfway between LLM and template
        out.mood_change = Math.round((out.mood_change + tplMood) / 2);
        out.overridden.mood = true;
      }
    }
  }

  // 3. Reply: empty/null → template message
  if (!out.customer_reply) {
    out.customer_reply = tplMessages.join(' ');
    out.overridden.reply = true;
  }

  out.messages = splitReply(out.customer_reply);
  return out;
}

/* ========================================================================
 * Public API
 * ===================================================================== */

/**
 * Generate a customer reaction via Ollama, with hybrid safety net.
 *
 * @param {object} ctx - shop/customer/state slice (see usage in game.js)
 * @param {string} playerMessage - what the player just said
 * @param {object} [opts]
 * @param {string} [opts.intent] - classifier-inferred intent (yield/negotiate/refuse/deflect)
 * @param {object} [opts.templateReaction] - template reaction for the inferred intent (used as override anchor)
 *
 * @returns {Promise<{ ok, mood_change, profit_change, creativity_bonus, messages, source, overrides? }>}
 *          or { ok: false, reason, error } on hard failure
 */
export async function generateReaction(ctx, playerMessage, opts = {}) {
  if (!_status.checked) await probeBackend();
  if (!_status.available) {
    const reason = BACKEND === 'ollama' ? 'ollama-offline' : 'server-offline';
    return { ok: false, reason, error: _status.error };
  }
  if (!_status.modelPresent) {
    const reason = BACKEND === 'ollama' ? 'model-missing' : 'server-not-configured';
    return { ok: false, reason, error: `LLM not ready on ${BACKEND}` };
  }

  if (BACKEND === 'server') {
    return callServer(ctx, playerMessage, opts);
  }
  return callOllamaPath(ctx, playerMessage, opts);
}

async function callOllamaPath(ctx, playerMessage, opts) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctx, playerMessage) },
    { role: 'user', content: playerMessage },
  ];
  let res = await callOllama(messages, { model: _status.model });
  let source = 'llm';
  if (!res.ok) {
    res = await callOllama(messages, { timeout: RETRY_TIMEOUT_MS, model: _status.model });
    source = 'llm-retry';
  }
  if (!res.ok) return { ok: false, reason: 'llm-error', error: res.error };

  const raw = sanitize(res.data);
  const reconciled = reconcileWithIntent(raw, opts.intent, opts.templateReaction);
  return {
    ok: true,
    mood_change: reconciled.mood_change,
    profit_change: reconciled.profit_change,
    creativity_bonus: reconciled.creativity_bonus,
    messages: reconciled.messages,
    source,
    overrides: reconciled.overridden,
  };
}

async function callServer(ctx, playerMessage, opts) {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), SERVER_TIMEOUT_MS);
    const res = await fetch('/api/llm/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        ctx,
        playerMessage,
        intent: opts.intent || null,
        templateReaction: opts.templateReaction || null,
      }),
    });
    clearTimeout(tid);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false, reason: body.reason || 'server-http', error: body.error || `HTTP ${res.status}` };
    }
    const body = await res.json();
    // Server already did sanitize + reconcile, so just pass through.
    return body;
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'server-error', error: e.message || String(e) };
  }
}
