// Smoke test v2:
// - Test against the 8B model
// - New prompt with few-shot examples + stronger persona enforcement
// - Same 3 scenarios for apples-to-apples comparison

const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODEL = process.env.MODEL || 'scb10x/llama3.1-typhoon2-8b-instruct';

const FEW_SHOTS = [
  // yield → happy
  {
    user_persona: 'ดราม่า (น้องนุ่น) มู้ด 25/100 ร้าน Glow Up Cream',
    admin_msg: 'ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ 🙏',
    output: { mood_change: 32, profit_change: -40, creativity_bonus: 5, customer_reply: 'พี่ใจดีมากกกก 😭❤️ หนูซาบซึ้งสุดๆ ขอบคุณค่าาาา 🙏' }
  },
  // refuse → flip rages hard
  {
    user_persona: 'พลิก (น้องพิม) มู้ด 50/100 ร้าน Boutique Pink',
    admin_msg: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    output: { mood_change: -30, profit_change: 0, creativity_bonus: 0, customer_reply: 'หา?? อะไรนะ?? ปฏิเสธหนูเหรอ?? ขอ MANAGER เดี๋ยวนี้!! 🤬🤬' }
  },
  // negotiate w/ threat → some calming but still grumpy
  {
    user_persona: 'ขู่ (คุณมิ้น) มู้ด 18/100 ร้านอาหาร',
    admin_msg: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    output: { mood_change: 12, profit_change: -10, creativity_bonus: 8, customer_reply: 'เอาก็เอาวะ ค่อยยังชั่ว แต่เตือนนะ ครั้งต่อไปขอเต็ม' }
  },
];

function buildPrompt(ctx, playerMsg) {
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
    `ชื่อ: ${ctx.customer_name} (ผู้หญิงเสมอ ใช้ "ค่ะ/หนู" ไม่ใช่ "ครับ/ผม")`,
    `มู้ดของคุณตอนนี้: ${ctx.mood}/100 (ยิ่งต่ำยิ่งโกรธ ยิ่งสูงยิ่งใจเย็น)`,
    `รอบที่: ${ctx.turns + 1}`,
    '',
    '=== กติกาการประเมิน (สำคัญมาก) ===',
    'หลังแอดมินตอบ คุณต้องประเมิน 3 ค่า + ตอบกลับ:',
    '',
    '1) mood_change (จำนวนเต็ม -35 ถึง +35): การเปลี่ยนแปลงมู้ดของคุณ',
    '   • ถ้าแอดมิน "ยอม" (คืนเงินเต็ม ทำใหม่ฟรี ส่งของใหม่): +25 ถึง +35  (คุณดีใจ)',
    '   • ถ้าแอดมิน "เจรจา" (เสนอส่วนลด/คูปอง/แถม): +8 ถึง +18  (พอใจปานกลาง)',
    '   • ถ้าแอดมิน "ปฏิเสธ" (อ้างนโยบาย ไม่ให้): -10 ถึง -25  (คุณโกรธขึ้น)',
    '   • ถ้าแอดมิน "ปั่น" (โยนหัวหน้า รอตรวจสอบ): -5 ถึง 0  (ขุ่นๆ)',
    '   • พิเศษสาย "พลิก": ถ้าแอดมิน "ปฏิเสธ" → mood -28 ถึง -32 (rage MANAGER!!)',
    '   • พิเศษสาย "ขู่" + ปฏิเสธ → mood -22 ถึง -28',
    '',
    '2) profit_change (จำนวนเต็ม -45 ถึง 0): ผลต่อกำไรร้าน (ไม่มีค่าบวก!)',
    '   • ยอมคืนเต็ม: -35 ถึง -45',
    '   • เจรจาส่วนลด/คูปอง: -5 ถึง -15',
    '   • ปฏิเสธ: 0  (ยกเว้นถ้าลูกค้าไปลงรีวิว: -10 ถึง -15)',
    '   • ปั่น: 0',
    '',
    '3) creativity_bonus (0-20): คะแนนพิเศษถ้าแอดมินตอบฉลาด/มีไหวพริบ',
    '   • คำตอบทั่วไป: 0-3',
    '   • มี empathy + แก้ปัญหา: 5-10',
    '   • โซลูชั่นสร้างสรรค์เกินคาด: 12-20',
    '',
    '4) customer_reply: ข้อความตอบกลับ 1-3 ประโยค สั้น **ในบุคลิกของคุณเท่านั้น** ห้ามหลุดเปลี่ยนเพศ/น้ำเสียง',
    '',
    '=== ตัวอย่าง (ทำตามรูปแบบเป๊ะ) ===',
    ...FEW_SHOTS.flatMap((ex, i) => [
      `--- ตัวอย่าง ${i + 1} ---`,
      `[ลูกค้า] ${ex.user_persona}`,
      `[แอดมินตอบ] "${ex.admin_msg}"`,
      `[ผลลัพธ์] ${JSON.stringify(ex.output, null, 0)}`,
      '',
    ]),
    '=== ตาคุณแล้ว ===',
    `[ลูกค้า] ${ctx.customer_type_name} (${ctx.customer_name}) มู้ด ${ctx.mood}/100 ร้าน ${ctx.shop_name}`,
    `[แอดมินตอบ] "${playerMsg}"`,
    `[ผลลัพธ์] ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น`,
  ].join('\n');
}

async function runOne(ctx, playerMsg, label) {
  const start = Date.now();
  const body = {
    model: MODEL,
    format: 'json',
    stream: false,
    options: { temperature: 0.7, num_predict: 240, top_p: 0.9 },
    messages: [
      { role: 'system', content: buildPrompt(ctx, playerMsg) },
      { role: 'user', content: playerMsg },
    ],
  };
  try {
    const res = await fetch(OLLAMA, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const elapsed = (Date.now() - start) / 1000;
    const raw = data?.message?.content || '';
    let parsed = null, parseOk = false;
    try { parsed = JSON.parse(raw); parseOk = true; } catch {}
    console.log(`\n=== ${label} (${elapsed.toFixed(1)}s, parse=${parseOk}) ===`);
    if (parseOk) {
      console.log('  mood_change:', parsed.mood_change);
      console.log('  profit_change:', parsed.profit_change);
      console.log('  creativity_bonus:', parsed.creativity_bonus);
      console.log('  customer_reply:', parsed.customer_reply);
    } else {
      console.log('RAW:', raw);
    }
    return { ok: true, elapsed, parseOk, parsed, raw };
  } catch (err) {
    console.log(`[${label}] error:`, err.message);
    return { ok: false, error: err.message };
  }
}

const scenarios = [
  {
    label: 'S1: drama × cream, player YIELDS (full refund) [expect mood +25~+35]',
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
    label: 'S2: flip × clothes, player REFUSES [expect mood -28~-32 rage]',
    playerMsg: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    ctx: {
      shop_name: 'Boutique Pink', category: 'เสื้อผ้า',
      complaint: 'ลูกค้าสั่งผิดไซส์เอง ขอคืน/เปลี่ยน',
      policy: 'ทางร้านไม่รับคืนสินค้าทุกกรณี',
      context_for_llm: 'ร้านเสื้อผ้าออนไลน์ มีตารางไซส์ระบุชัดเจน',
      customer_type_name: 'พลิก',
      tone_description: 'เริ่มหวาน ใช้อิโมจิ 💕 น่ารัก แต่พอโดนปฏิเสธจะพลิกโกรธทันที ใช้ MANAGER',
      customer_name: 'น้องพิม', mood: 50, profit: 100, turns: 0,
    },
  },
  {
    label: 'S3: threat × food, player NEGOTIATES [expect mood +8~+18]',
    playerMsg: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    ctx: {
      shop_name: 'ครัวพี่หญิง', category: 'อาหาร',
      complaint: 'กินไปครึ่งกล่องแล้วบอกว่าไม่อร่อย ขอเงินคืน',
      policy: 'อาหารปรุงสด ไม่รับคืน ยกเว้นปัญหาคุณภาพชัดเจน',
      context_for_llm: 'ร้านอาหารเดลิเวอรี่ ลูกค้ากินเองครึ่งกล่อง',
      customer_type_name: 'ขู่',
      tone_description: 'เสียงดุ ใช้คำขู่ ขู่ลงรีวิว/พันทิป น้ำเสียงทางการแต่กดดัน',
      customer_name: 'คุณมิ้น', mood: 18, profit: 100, turns: 1,
    },
  },
];

(async () => {
  console.log(`Model: ${MODEL}`);
  const results = [];
  for (const sc of scenarios) {
    const r = await runOne(sc.ctx, sc.playerMsg, sc.label);
    results.push(r);
  }
  const okResults = results.filter(r => r.ok);
  const avg = okResults.reduce((a, r) => a + r.elapsed, 0) / Math.max(1, okResults.length);
  const parsed = results.filter(r => r.parseOk).length;
  console.log('\n=== SUMMARY ===');
  console.log(`Model: ${MODEL}`);
  console.log(`Avg response: ${avg.toFixed(2)}s`);
  console.log(`JSON parse rate: ${parsed} / ${results.length}`);
})();
