// Generalization test — scenarios NOT covered by few-shots.
// Confirms 8B reasons about the rules instead of regurgitating examples.

const OLLAMA = 'http://127.0.0.1:11434/api/chat';
const MODEL = process.env.MODEL || 'scb10x/llama3.1-typhoon2-8b-instruct';

const FEW_SHOTS = [
  { user_persona: 'ดราม่า (น้องนุ่น) มู้ด 25/100 ร้าน Glow Up Cream',
    admin_msg: 'ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ 🙏',
    output: { mood_change: 32, profit_change: -40, creativity_bonus: 5, customer_reply: 'พี่ใจดีมากกกก 😭❤️ หนูซาบซึ้งสุดๆ ขอบคุณค่าาาา 🙏' } },
  { user_persona: 'พลิก (น้องพิม) มู้ด 50/100 ร้าน Boutique Pink',
    admin_msg: 'ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ',
    output: { mood_change: -30, profit_change: 0, creativity_bonus: 0, customer_reply: 'หา?? อะไรนะ?? ปฏิเสธหนูเหรอ?? ขอ MANAGER เดี๋ยวนี้!! 🤬🤬' } },
  { user_persona: 'ขู่ (คุณมิ้น) มู้ด 18/100 ร้านอาหาร',
    admin_msg: 'ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ',
    output: { mood_change: 12, profit_change: -10, creativity_bonus: 8, customer_reply: 'เอาก็เอาวะ ค่อยยังชั่ว แต่เตือนนะ ครั้งต่อไปขอเต็ม' } },
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
    '   • ถ้าแอดมิน "ยอม" (คืนเงินเต็ม ทำใหม่ฟรี ส่งของใหม่): +25 ถึง +35',
    '   • ถ้าแอดมิน "เจรจา" (เสนอส่วนลด/คูปอง/แถม): +8 ถึง +18',
    '   • ถ้าแอดมิน "ปฏิเสธ" (อ้างนโยบาย ไม่ให้): -10 ถึง -25',
    '   • ถ้าแอดมิน "ปั่น" (โยนหัวหน้า รอตรวจสอบ): -5 ถึง 0',
    '   • พิเศษสาย "พลิก" + ปฏิเสธ → mood -28 ถึง -32 (rage MANAGER!!)',
    '   • พิเศษสาย "ขู่" + ปฏิเสธ → mood -22 ถึง -28',
    '',
    '2) profit_change (จำนวนเต็ม -45 ถึง 0): ผลต่อกำไรร้าน (ไม่มีค่าบวก!)',
    '   • ยอมคืนเต็ม: -35 ถึง -45',
    '   • เจรจาส่วนลด/คูปอง: -5 ถึง -15',
    '   • ปฏิเสธ: 0  (ยกเว้นถ้าลูกค้าจะลงรีวิว: -10 ถึง -15)',
    '   • ปั่น: 0',
    '',
    '3) creativity_bonus (0-20)',
    '4) customer_reply: 1-3 ประโยค ในบุคลิก ใช้ "ค่ะ/หนู" เท่านั้น',
    '',
    '=== ตัวอย่าง (ห้ามคัดลอกข้อความ ใช้แค่ทำความเข้าใจ format) ===',
    ...FEW_SHOTS.flatMap((ex, i) => [
      `--- ตัวอย่าง ${i + 1} ---`,
      `[ลูกค้า] ${ex.user_persona}`,
      `[แอดมินตอบ] "${ex.admin_msg}"`,
      `[ผลลัพธ์] ${JSON.stringify(ex.output, null, 0)}`,
      '',
    ]),
    '=== ตาคุณแล้ว (สถานการณ์ใหม่ ห้าม copy ตัวอย่างข้างบน) ===',
    `[ลูกค้า] ${ctx.customer_type_name} (${ctx.customer_name}) มู้ด ${ctx.mood}/100 ร้าน ${ctx.shop_name}`,
    `[แอดมินตอบ] "${playerMsg}"`,
    `[ผลลัพธ์] ตอบเป็น JSON เท่านั้น`,
  ].join('\n');
}

async function runOne(ctx, playerMsg, label, expectation) {
  const start = Date.now();
  const body = {
    model: MODEL, format: 'json', stream: false,
    options: { temperature: 0.8, num_predict: 240, top_p: 0.9 },
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
    console.log(`  expect: ${expectation}`);
    if (parseOk) {
      console.log(`  mood_change: ${parsed.mood_change}`);
      console.log(`  profit_change: ${parsed.profit_change}`);
      console.log(`  creativity_bonus: ${parsed.creativity_bonus}`);
      console.log(`  customer_reply: ${parsed.customer_reply}`);
    } else {
      console.log('RAW:', raw);
    }
    return { ok: true, elapsed, parseOk, parsed };
  } catch (err) {
    console.log(`[${label}] error:`, err.message);
    return { ok: false, error: err.message };
  }
}

// Scenarios NOT in few-shots → tests generalization
const scenarios = [
  {
    label: 'G1: compare × plant, player YIELDS w/ different wording',
    expectation: 'mood +25~+35 (yield), profit -35~-45',
    playerMsg: 'งั้นเดี๋ยวจัดส่งต้นใหม่ให้เลยนะคะ ขอโทษที่ทำให้ผิดหวัง 🌱',
    ctx: {
      shop_name: 'บ้านสวนใบเขียว', category: 'ต้นไม้',
      complaint: 'ต้นไม้ตายในอาทิตย์เดียว ลูกค้าลืมรดน้ำ',
      policy: 'รับประกัน 3 วันแรก หลังจากนั้นต้องดูแลเอง',
      context_for_llm: 'ร้านขายต้นไม้ ลูกค้าลืมรดน้ำ',
      customer_type_name: 'เปรียบเทียบ',
      tone_description: 'เปรียบเทียบกับร้านอื่นตลอดเวลา ว่าทำได้ ทำดีกว่า',
      customer_name: 'หนูฝน', mood: 28, profit: 100, turns: 0,
    },
  },
  {
    label: 'G2: accuse × custom, player DEFLECTS',
    expectation: 'mood -5~-10 (deflect, accuse less tolerant), profit 0',
    playerMsg: 'ขอเวลาตรวจสอบกับฝ่ายผลิตก่อนนะคะ เดี๋ยวกลับมาแจ้งใหม่ค่ะ 🙏',
    ctx: {
      shop_name: 'Custom Print', category: 'พิมพ์ของขวัญ',
      complaint: 'ลูกค้าพิมพ์ชื่อในฟอร์มผิดเอง',
      policy: 'งาน custom ไม่รับคืน',
      context_for_llm: 'ระบบมีฟอร์มให้ลูกค้าพิมพ์ชื่อก่อนสั่ง',
      customer_type_name: 'ตำหนิ',
      tone_description: 'ตั้งคำถามเชิงกล่าวหา เปิดร้านยังไง ทำธุรกิจเป็นไหม',
      customer_name: 'คุณวุ้น', mood: 20, profit: 100, turns: 1,
    },
  },
  {
    label: 'G3: discount × secondhand, player REFUSES politely',
    expectation: 'mood -10~-15 (refuse, discount type whines), profit 0',
    playerMsg: 'ขออภัยค่ะ ของมือสองขายตามสภาพ ทำส่วนลดเพิ่มไม่ได้ค่ะ',
    ctx: {
      shop_name: 'Secondhand Store', category: 'มือสอง',
      complaint: 'ลูกค้าบ่นของเก่า ขอลด',
      policy: 'สินค้ามือสองขายตามสภาพ ไม่รับคืน',
      context_for_llm: 'แจ้งสภาพชัดเจน มีรูปครบมุม',
      customer_type_name: 'ขอลด',
      tone_description: 'อ้อน งอน อ้างจน นักศึกษา ขอลด',
      customer_name: 'น้องโบว์', mood: 40, profit: 100, turns: 0,
    },
  },
  {
    label: 'G4: noread × preorder, player explains AGAIN (yield-ish info)',
    expectation: 'mood +5~+15 (no real yield, but patient), profit 0~-5',
    playerMsg: 'อย่างที่แจ้งไปนะคะ preorder ใช้เวลา 30 วันค่ะ พอครบจะส่งให้เลย ใจเย็นๆ นะคะ',
    ctx: {
      shop_name: 'Preorder JP', category: 'พรีออเดอร์',
      complaint: 'จะเอาของเร็วกว่ากำหนด',
      policy: '30 วัน standard เร่งไม่ได้',
      context_for_llm: 'แจ้งระยะเวลาชัดเจนตอนสั่ง',
      customer_type_name: 'ไม่อ่าน',
      tone_description: 'ถามซ้ำเรื่องที่ตอบไปแล้ว ไม่จำลายละเอียด',
      customer_name: 'น้องเก่ง', mood: 35, profit: 100, turns: 2,
    },
  },
  {
    label: 'G5: flip × cream, player NEGOTIATES (avoid the rage trap!)',
    expectation: 'mood +8~+18 (negotiate, flip behaves while not refused), profit -10',
    playerMsg: 'ขอเสนอเป็น sample mask 5 ชิ้น + คู่มือใช้ครีมให้นะคะ น่าจะช่วยให้เห็นผลค่ะ ✨',
    ctx: {
      shop_name: 'Glow Up Cream', category: 'ครีม',
      complaint: 'ใช้ 3 วันไม่ขาว',
      policy: 'ต้องใช้ต่อเนื่อง 4-6 สัปดาห์',
      context_for_llm: 'ระบุชัดต้องใช้ต่อเนื่อง',
      customer_type_name: 'พลิก',
      tone_description: 'เริ่มหวาน 💕 แต่พอโดนปฏิเสธจะ rage MANAGER',
      customer_name: 'น้องอุ๊', mood: 50, profit: 100, turns: 0,
    },
  },
];

(async () => {
  console.log(`Model: ${MODEL}`);
  const results = [];
  for (const sc of scenarios) {
    const r = await runOne(sc.ctx, sc.playerMsg, sc.label, sc.expectation);
    results.push(r);
  }
  const okResults = results.filter(r => r.ok);
  const avg = okResults.reduce((a, r) => a + r.elapsed, 0) / Math.max(1, okResults.length);
  const parsed = results.filter(r => r.parseOk).length;
  console.log('\n=== SUMMARY ===');
  console.log(`Avg response: ${avg.toFixed(2)}s`);
  console.log(`JSON parse rate: ${parsed} / ${results.length}`);
})();
