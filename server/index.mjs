// แอดมินซิม — web server
//
// Serves the renderer (src/) as static + proxies LLM calls to Typhoon API.
// Designed for Railway-style PaaS hosting.
//
// Env vars:
//   PORT                  (default 3000)
//   TYPHOON_API_KEY       required for AI modes (Normal/Hardcore)
//   TYPHOON_API_BASE      default https://api.opentyphoon.ai/v1
//   TYPHOON_MODEL         default typhoon-v2.1-12b-instruct
//   ALLOW_ORIGINS         CSV of allowed CORS origins (default *)

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATIC_DIR = join(ROOT, 'src');

const PORT = process.env.PORT || 3000;
const TYPHOON_BASE = process.env.TYPHOON_API_BASE || 'https://api.opentyphoon.ai/v1';
const TYPHOON_MODEL = process.env.TYPHOON_MODEL || 'typhoon-v2.5-30b-a3b-instruct';
const TYPHOON_KEY = process.env.TYPHOON_API_KEY || '';
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '*').split(',').map(s => s.trim());

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Minimal CORS (only set headers for known origins to keep abuse surface small)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOW_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOW_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ===== Health check =====
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    llmConfigured: Boolean(TYPHOON_KEY),
    model: TYPHOON_MODEL,
    backend: 'typhoon-api',
  });
});

// ===== LLM proxy =====
// Body: { ctx, playerMessage, intent?, templateReaction? }
// Response on success: { ok: true, mood_change, profit_change, creativity_bonus, messages, source, overrides }
// Response on failure: { ok: false, reason, error }
app.post('/api/llm/turn', async (req, res) => {
  if (!TYPHOON_KEY) {
    return res.status(503).json({ ok: false, reason: 'llm-not-configured', error: 'TYPHOON_API_KEY missing' });
  }
  const { ctx, playerMessage, intent, templateReaction } = req.body || {};
  if (!ctx || typeof playerMessage !== 'string') {
    return res.status(400).json({ ok: false, reason: 'bad-request', error: 'ctx + playerMessage required' });
  }

  const systemPrompt = buildSystemPrompt(ctx, playerMessage);

  const start = Date.now();
  let raw, llmResp;
  try {
    const r = await fetch(`${TYPHOON_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${TYPHOON_KEY}`,
      },
      body: JSON.stringify({
        model: TYPHOON_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: playerMessage },
        ],
        temperature: 0.8,
        max_tokens: 280,
        // Many OpenAI-compatible servers honor this even when undocumented:
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, reason: 'llm-upstream', error: `HTTP ${r.status}: ${errBody.slice(0, 200)}` });
    }
    llmResp = await r.json();
    raw = llmResp?.choices?.[0]?.message?.content || '';
  } catch (err) {
    return res.status(504).json({ ok: false, reason: 'llm-timeout', error: err.message });
  }

  const parsed = extractJSON(raw);
  if (!parsed) {
    return res.json({ ok: false, reason: 'llm-bad-json', error: 'could not parse JSON from LLM', raw: raw.slice(0, 400) });
  }

  const sanitized = sanitize(parsed);
  const reconciled = reconcileWithIntent(sanitized, intent, templateReaction);
  const elapsed = Date.now() - start;

  // Diagnostic logging — visible via `railway logs`
  const ov = reconciled.overridden;
  const ovStr = (ov.mood || ov.profit || ov.reply)
    ? ` [override: ${[ov.mood && 'mood', ov.profit && 'profit', ov.reply && 'reply'].filter(Boolean).join(',')}]`
    : '';
  console.log(`[turn] intent=${intent || '?'} llm(${sanitized.mood_change ?? '?'},${sanitized.profit_change ?? '?'}) → final(${reconciled.mood_change},${reconciled.profit_change}) ${elapsed}ms${ovStr}`);

  return res.json({
    ok: true,
    mood_change: reconciled.mood_change,
    profit_change: reconciled.profit_change,
    creativity_bonus: reconciled.creativity_bonus,
    messages: reconciled.messages,
    source: 'llm',
    overrides: reconciled.overridden,
    elapsedMs: elapsed,
  });
});

// ===== Static files =====
app.use(express.static(STATIC_DIR, {
  maxAge: '1h',
  setHeaders: (res, path) => {
    // Don't cache JSON data so dialogue updates show up on next visit
    if (path.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// SPA fallback (just in case — we only have one page, but cheap)
app.get('*', (_req, res) => {
  res.sendFile(join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[admin-sim] listening on :${PORT}`);
  console.log(`[admin-sim] LLM ${TYPHOON_KEY ? 'configured' : 'NOT configured (Easy mode only)'}; model=${TYPHOON_MODEL}`);
});

/* ========================================================================
 * LLM helpers — mirror the logic in src/js/llm.js so behavior is consistent
 * regardless of where the call originates.
 * ===================================================================== */

const FEW_SHOTS = [
  { persona: 'ดราม่า (น้องนุ่น) มู้ด 25/100 ร้านครีม',
    admin: 'ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ 🙏',
    out: { mood_change: 32, profit_change: -40, creativity_bonus: 5, customer_reply: 'พี่ใจดีจังเลยค่าาา 😭💖 หนูประทับใจจริงๆ เลย ขอบคุณนะคะะะ' } },
  { persona: 'พลิก (น้องพิม) มู้ด 50/100 ร้านเสื้อผ้า',
    admin: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    out: { mood_change: -30, profit_change: 0, creativity_bonus: 0, customer_reply: 'หา?? อะไรนะ?? ปฏิเสธหนูเหรอ?? ขอ MANAGER เดี๋ยวนี้!! 🤬🤬' } },
  { persona: 'ขู่ (คุณมิ้น) มู้ด 18/100 ร้านอาหาร',
    admin: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    out: { mood_change: 12, profit_change: -10, creativity_bonus: 8, customer_reply: 'เอาก็เอาวะ ค่อยยังชั่ว แต่เตือนนะ ครั้งต่อไปขอเต็ม' } },
];

const RULES_BY_INTENT = {
  yield:     { mood: '+25 ถึง +35', profit: '-35 ถึง -45' },
  negotiate: { mood: '+8 ถึง +18',  profit: '-5 ถึง -15' },
  refuse:    { mood: '-10 ถึง -25 (สายพลิก -28~-32, สายขู่ -22~-28)', profit: '0 (ขู่ลงรีวิว: -10~-15)' },
  deflect:   { mood: '-5 ถึง 0',    profit: '0' },
};

function buildAntiRepeatBlock(recentReplies) {
  if (!Array.isArray(recentReplies) || recentReplies.length === 0) return [];
  // Extract repeated short tokens that the model is likely echoing
  // (e.g. "หนูจน", "หนูร้องไห้", "ขอ MANAGER"). Surface them as a
  // banned-keyword list — much more effective than a generic "don't repeat".
  const tokens = extractRepeatedTokens(recentReplies);
  const bannedLine = tokens.length
    ? `*** คำที่ห้ามใช้ในรอบนี้ (ใช้ไปแล้ว ${tokens.length} คำ): ${tokens.map(t => `"${t}"`).join(', ')} ***`
    : '';
  return [
    '=== สิ่งที่คุณเพิ่งพูดไปแล้ว — ห้ามพูดซ้ำ ===',
    ...recentReplies.map((r, i) => `[ครั้งที่ ${recentReplies.length - i} ก่อนหน้านี้] "${r}"`),
    '',
    'กฎห้ามซ้ำ (เด็ดขาด):',
    '- ห้ามใช้สำนวน คำคีย์ หรือธีมเดิมที่พูดไปแล้ว',
    '- ต้องตอบสนองต่อข้อความใหม่ของแอดมินโดยตรง ไม่ใช่วน persona เริ่มต้น',
    '- ถ้ามู้ด > 50 ลดการบ่น พูดเชิงบวกขึ้น',
    '- ถ้ามู้ด > 70 ให้ขอบคุณ/ชื่นชม มากกว่าบ่น',
    bannedLine,
    '',
  ].filter(Boolean);
}

// Find short Thai tokens that recur across recent replies — these are the
// phrases the model is echoing and the player notices as repetition.
function extractRepeatedTokens(replies) {
  const counts = new Map();
  for (const reply of replies) {
    // Word-ish chunks: Thai short words 2–8 chars, separated by space/punct
    const chunks = reply.match(/[฀-๿a-zA-Z]{2,8}/g) || [];
    for (const c of chunks) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  // Pick tokens that appear in at least 2 replies and aren't generic stopwords
  const stopwords = new Set(['ค่ะ', 'นะ', 'นะคะ', 'พี่', 'หนู', 'ค่ะะ', 'แต่', 'ที่', 'แล้ว', 'มาก', 'ครับ', 'จะ', 'จัง', 'มา', 'ก็', 'ได้', 'อยู่', 'เลย', 'มี', 'ให้', 'ของ', 'เป็น', 'ไป', 'รับ', 'อ่ะ', 'อะ', 'จริงๆ']);
  return [...counts.entries()]
    .filter(([k, v]) => v >= 2 && !stopwords.has(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);
}

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
    `รอบที่: ${(ctx.turns ?? 0) + 1}`,
    '',
    ...buildAntiRepeatBlock(ctx.recent_replies),
    '=== กติกาประเมิน ===',
    '1) mood_change (จำนวนเต็ม -35 ถึง +35) — *** ห้ามตอบ 0 ถ้าแอดมินทำอะไรชัดเจน ***',
    `   • ยอม (คืนเงิน/ทำใหม่ฟรี/ส่งของใหม่ฟรี):  ${RULES_BY_INTENT.yield.mood}`,
    `   • เจรจา (ส่วนลด/คูปอง/แถม):              ${RULES_BY_INTENT.negotiate.mood}`,
    `   • ปฏิเสธ (อ้างนโยบาย):                    ${RULES_BY_INTENT.refuse.mood}`,
    `   • ปั่น (โยน/รอ):                          ${RULES_BY_INTENT.deflect.mood}`,
    `   • ห้ามใส่ 0 เด็ดขาดถ้า intent คือ ยอม/เจรจา/ปฏิเสธ — เลือกค่าในช่วงที่กำหนด`,
    '',
    '2) profit_change (จำนวนเต็ม -45 ถึง 0)  *** ห้ามบวกเด็ดขาด ***',
    `   • ยอม:    ${RULES_BY_INTENT.yield.profit}`,
    `   • เจรจา:  ${RULES_BY_INTENT.negotiate.profit}`,
    `   • ปฏิเสธ: ${RULES_BY_INTENT.refuse.profit}`,
    `   • ปั่น:   ${RULES_BY_INTENT.deflect.profit}`,
    '',
    '3) creativity_bonus (0-20): empathy + แก้ปัญหาฉลาด',
    '4) customer_reply: 1-3 ประโยค ในบุคลิก ใช้ "ค่ะ/หนู" ห้าม null',
    '',
    '=== ตัวอย่าง (ทำความเข้าใจ format อย่าคัดลอกข้อความ) ===',
    ...FEW_SHOTS.flatMap(ex => [
      `[ลูกค้า] ${ex.persona}`,
      `[แอดมิน] "${ex.admin}"`,
      `[ผล] ${JSON.stringify(ex.out)}`,
      '',
    ]),
    '=== ตาคุณแล้ว — สร้างคำตอบที่ไม่ซ้ำกับตัวอย่าง ===',
    `[ลูกค้า] ${ctx.customer_type_name} (${ctx.customer_name}) มู้ด ${ctx.mood}/100 ร้าน ${ctx.shop_name}`,
    `[แอดมิน] "${playerMessage}"`,
    `[ผล] ตอบเป็น JSON object เท่านั้น มี 4 keys: mood_change, profit_change, creativity_bonus, customer_reply`,
  ].join('\n');
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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sanitize(data) {
  const moodChange = Number.isFinite(data?.mood_change) ? clamp(Math.round(data.mood_change), -40, 40) : null;
  const profitChange = Number.isFinite(data?.profit_change) ? clamp(Math.round(data.profit_change), -50, 5) : null;
  const creativity = Number.isFinite(data?.creativity_bonus) ? clamp(Math.round(data.creativity_bonus), 0, 20) : 0;
  const reply = (typeof data?.customer_reply === 'string' ? data.customer_reply : '').trim();
  return { mood_change: moodChange, profit_change: profitChange, creativity_bonus: creativity, customer_reply: reply };
}

function splitReply(text) {
  if (!text || text.length <= 60) return [text || '...'];
  const breaks = [...text.matchAll(/[.!?。！？\n]\s*/g)];
  const mid = text.length / 2;
  const pivot = breaks.find(m => m.index >= mid - 20);
  if (!pivot) return [text];
  const cut = pivot.index + pivot[0].length;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()].filter(Boolean);
}

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

  if (out.profit_change === null || out.profit_change > 0) {
    out.profit_change = tplProfit;
    out.overridden.profit = true;
  }
  if (out.mood_change === null) {
    out.mood_change = tplMood;
    out.overridden.mood = true;
  } else if (intent && tplMood !== 0) {
    const tplSign = Math.sign(tplMood);
    const llmSign = Math.sign(out.mood_change);
    const llmAbs = Math.abs(out.mood_change);
    const tplAbs = Math.abs(tplMood);

    if (tplSign !== 0 && llmSign !== 0 && tplSign !== llmSign) {
      // Sign disagreement → override to template
      out.mood_change = tplMood;
      out.overridden.mood = true;
    } else if (llmAbs < tplAbs / 2) {
      // LLM was timid — produced ~0 when template wants a real move.
      // Pull halfway toward template so the player sees their work pay off.
      out.mood_change = Math.round((out.mood_change + tplMood) / 2);
      out.overridden.mood = true;
    } else if (Math.abs(out.mood_change - tplMood) > 20) {
      // LLM was way overboard in same direction — average
      out.mood_change = Math.round((out.mood_change + tplMood) / 2);
      out.overridden.mood = true;
    }
  }
  if (!out.customer_reply) {
    out.customer_reply = tplMessages.join(' ');
    out.overridden.reply = true;
  }
  out.messages = splitReply(out.customer_reply);
  return out;
}
