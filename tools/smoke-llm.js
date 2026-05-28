// Direct Ollama smoke test in Node.
// Run with: node tools/smoke-llm.js
// Bypasses PowerShell encoding hell.

const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODEL = 'scb10x/llama3.2-typhoon2-3b-instruct';

function buildSystemPrompt(ctx, playerMsg) {
  return [
    `คุณคือลูกค้าของร้าน ${ctx.shop_name} (${ctx.category})`,
    `สถานการณ์/ปัญหา: ${ctx.complaint}`,
    `นโยบายร้าน (ที่แอดมินรู้): ${ctx.policy}`,
    `บริบทเพิ่ม: ${ctx.context_for_llm}`,
    ``,
    `บุคลิกของคุณ (สาย${ctx.customer_type_name}): ${ctx.tone_description}`,
    `ชื่อเล่นของคุณ: ${ctx.customer_name}`,
    `มู้ดปัจจุบันของคุณ: ${ctx.mood}/100  (ยิ่งต่ำยิ่งโกรธ)`,
    `กำไรร้านที่เหลือ: ${ctx.profit}/100`,
    `จำนวนรอบสนทนาที่ผ่าน: ${ctx.turns}`,
    ``,
    `แอดมินเพิ่งตอบกลับว่า: "${playerMsg}"`,
    ``,
    `งานของคุณ: ตอบกลับเป็นลูกค้าที่มีบุคลิกข้างต้น แล้วประเมินผลของคำตอบของแอดมิน`,
    `กฎ:`,
    `- ตอบ JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON`,
    `- "customer_reply" เป็นข้อความตอบกลับ 1-3 ประโยคในบุคลิกของคุณ`,
    `- "mood_change" คือการเปลี่ยนแปลงมู้ดของคุณ (จำนวนเต็ม -30 ถึง +35)`,
    `- "profit_change" คือผลต่อกำไรร้าน (จำนวนเต็ม -40 ถึง 0)`,
    `- "creativity_bonus" คะแนนพิเศษถ้าแอดมินตอบฉลาด/มีคุณภาพ (0-20)`,
    `- ถ้าแอดมินยอมจ่ายเงินคืน/ทำตามทุกอย่าง: mood +30~+35, profit -30~-40`,
    `- ถ้าแอดมินเจรจาเสนอส่วนลด/ของแถม: mood +10~+20, profit -5~-15`,
    `- ถ้าแอดมินปฏิเสธสุภาพ: mood -10~-20 (ถ้าเป็นสายพลิก/สายขู่ลงหนักกว่า)`,
    `- ถ้าแอดมินปั่น/โยกเรื่อง: mood 0~-10`,
    ``,
    `รูปแบบที่ต้องตอบ (JSON เท่านั้น):`,
    `{"mood_change": <int>, "profit_change": <int>, "creativity_bonus": <int>, "customer_reply": "<text>"}`,
  ].join('\n');
}

async function runOne(ctx, playerMsg, label) {
  const start = Date.now();
  const body = {
    model: MODEL,
    format: 'json',
    stream: false,
    options: { temperature: 0.85, num_predict: 220, top_p: 0.9 },
    messages: [
      { role: 'system', content: buildSystemPrompt(ctx, playerMsg) },
      { role: 'user', content: playerMsg },
    ],
  };
  try {
    const res = await fetch(OLLAMA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log(`[${label}] HTTP ${res.status}`);
      return { ok: false, elapsed: (Date.now() - start) / 1000 };
    }
    const data = await res.json();
    const elapsed = (Date.now() - start) / 1000;
    const raw = data?.message?.content || '';
    let parsed = null, parseOk = false;
    try { parsed = JSON.parse(raw); parseOk = true; } catch {}
    console.log(`\n=== ${label} (${elapsed.toFixed(1)}s, parse=${parseOk}) ===`);
    console.log('RAW:', raw);
    if (parseOk) {
      console.log('  mood_change:', parsed.mood_change);
      console.log('  profit_change:', parsed.profit_change);
      console.log('  creativity_bonus:', parsed.creativity_bonus);
      console.log('  customer_reply:', parsed.customer_reply);
    }
    return { ok: true, elapsed, parseOk, parsed, raw };
  } catch (err) {
    console.log(`[${label}] error:`, err.message);
    return { ok: false, elapsed: (Date.now() - start) / 1000, error: err.message };
  }
}

const scenarios = [
  {
    label: 'S1: drama × cream, player YIELDS',
    playerMsg: 'ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ',
    ctx: {
      shop_name: 'Glow Up Cream', category: 'ครีม',
      complaint: 'ใช้ครีม 3 วันแล้วยังไม่ขาว ขอเงินคืน',
      policy: 'ครีมต้องใช้ต่อเนื่อง 4-6 สัปดาห์ ไม่รับคืนสินค้าที่เปิดใช้แล้ว',
      context_for_llm: 'ร้านขายครีมหน้าขาว ระบุบนหน้าเพจว่าต้องใช้ 4-6 สัปดาห์',
      customer_type_name: 'ดราม่า',
      tone_description: 'ใช้อิโมจิ 😭💔 เยอะ พิมพ์ลากเสียง อ้างความเป็นแฟนคลับ',
      customer_name: 'น้องนุ่น', mood: 25, profit: 100, turns: 0,
    },
  },
  {
    label: 'S2: flip × clothes, player REFUSES (flip should rage)',
    playerMsg: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    ctx: {
      shop_name: 'Boutique Pink', category: 'เสื้อผ้า',
      complaint: 'ลูกค้าสั่งผิดไซส์เอง ขอคืน/เปลี่ยน',
      policy: 'ทางร้านไม่รับคืนสินค้าทุกกรณี',
      context_for_llm: 'ร้านเสื้อผ้าออนไลน์ มีตารางไซส์ระบุชัดเจน ลูกค้าไม่ได้เช็คก่อนสั่ง',
      customer_type_name: 'พลิก',
      tone_description: 'เริ่มหวาน ใช้อิโมจิ 💕 น่ารัก แต่พอโดนปฏิเสธจะพลิกโกรธทันที ใช้ MANAGER',
      customer_name: 'น้องพิม', mood: 50, profit: 100, turns: 0,
    },
  },
  {
    label: 'S3: threat × food, player NEGOTIATES',
    playerMsg: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    ctx: {
      shop_name: 'ครัวพี่หญิง', category: 'อาหาร',
      complaint: 'กินไปครึ่งกล่องแล้วบอกว่าไม่อร่อย ขอเงินคืน',
      policy: 'อาหารปรุงสด ไม่รับคืน ยกเว้นปัญหาคุณภาพชัดเจน',
      context_for_llm: 'ร้านอาหารเดลิเวอรี่ ลูกค้ากินเองครึ่งกล่อง ไม่มีหลักฐานปัญหา',
      customer_type_name: 'ขู่',
      tone_description: 'เสียงดุ ใช้คำขู่ ขู่ลงรีวิว/พันทิป น้ำเสียงทางการแต่กดดัน',
      customer_name: 'คุณมิ้น', mood: 18, profit: 100, turns: 1,
    },
  },
];

(async () => {
  const results = [];
  for (const sc of scenarios) {
    const r = await runOne(sc.ctx, sc.playerMsg, sc.label);
    results.push(r);
  }
  const okResults = results.filter(r => r.ok);
  const avg = okResults.reduce((a, r) => a + r.elapsed, 0) / Math.max(1, okResults.length);
  const parsed = results.filter(r => r.parseOk).length;
  console.log('\n=== SUMMARY ===');
  console.log(`Avg response: ${avg.toFixed(2)}s`);
  console.log(`JSON parse rate: ${parsed} / ${results.length}`);
})();
