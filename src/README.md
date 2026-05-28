# แอดมินซิม — Phase 1 + Phase 2 (LLM)

Web prototype. รันบน browser ผ่าน local server (ยังไม่ใช่ Electron)

## รัน

```bash
# จากโฟลเดอร์ admin-sim/
python -m http.server 8765 --directory src
# หรือ
npx serve src
```

เปิด <http://localhost:8765>

## โหมดการเล่น

| Mode | คำตอบ | ตัวคูณคะแนน | ต้องใช้ Ollama |
|---|---|---|---|
| **Easy** | 4 ปุ่ม (template) | ×1.0 | ไม่ |
| **Normal** | พิมพ์ + 4 ปุ่ม | ×1.3 (+×1.15 ถ้าพิมพ์) | ใช่ — fallback ถ้าไม่มี |
| **Hardcore** | พิมพ์ล้วน, AI ประเมิน | ×1.6 + creativity bonus | ใช่ — fallback ถ้าไม่มี |

โดยไม่มี Ollama ก็เล่นได้ทั้ง 3 โหมด — Normal/Hardcore จะใช้ keyword classifier
จัด type ของคำตอบที่พิมพ์แล้วใช้ template สมรู้ของเดิม (จะมี ⚠ บอกใน HUD)

## ติดตั้ง Ollama + Typhoon (สำหรับ AI mode)

### Windows

1. ดาวน์โหลด <https://ollama.com/download>
2. ติดตั้งเสร็จแล้ว Ollama จะรันเป็น service อัตโนมัติบน `http://127.0.0.1:11434`
3. Pull โมเดล Typhoon 8B (ครั้งเดียว, ~4.6GB) — แนะนำตัวนี้:

```powershell
ollama pull scb10x/llama3.1-typhoon2-8b-instruct
```

> ตัวเลือกเล็กกว่า 3B (~1.9GB): `scb10x/llama3.2-typhoon2-3b-instruct` แต่ตอบ score เพี้ยน
> ทดสอบแล้ว 3B จะตอบ mood/profit ผิดทาง sign บ่อย — แนะนำ 8B จริงๆ

4. ตรวจว่ารันได้:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

5. กลับมาที่หน้าเกม กดที่ AI status (ล่างหน้า home) เพื่อ re-probe
หรือ refresh — badge ต้องขึ้น "🤖 AI พร้อม"

### macOS / Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull scb10x/llama3.2-typhoon2-3b-instruct
```

### Spec ที่แนะนำ

- RAM 8GB+ (Typhoon 8B Q4 ใช้ ~5GB ตอนรัน)
- Disk เหลือ 6GB+
- CPU/GPU เร็ว → ปกติ 3-5 วินาทีต่อ turn (first turn 10-20s ตอน warm-up)

## โครงสร้าง

```
src/
├─ index.html              # 3 หน้าใน DOM เดียว (home / game / results) + modal
├─ styles/main.css
├─ js/
│  ├─ main.js              # bootstrap + page nav + Ollama probe
│  ├─ game.js              # state machine + match flow + mode branching
│  ├─ chat.js              # bubble rendering + typing delays
│  ├─ scoring.js           # mood/profit/score math + difficulty
│  ├─ content.js           # data loader + combo picker
│  ├─ storage.js           # localStorage best score + history
│  └─ llm.js               # Ollama client + JSON parse + fallback
└─ data/
   ├─ situations.json      # 7 ร้าน
   ├─ customer_types.json  # 7 สาย
   └─ dialogues.json       # 49 openings + 28 reactions + player lines
```

## Flow

```
boot → probe Ollama (background) → home
home → เลือก diff → startMatch()
  ├─ pickRandomCombo (1 ใน 49)
  ├─ render opening (ลูกค้าพิมพ์ + bubble delays)
  └─ start 3:00 timer
playing → handleResponse
  ├─ Easy: ปุ่ม → template lookup
  ├─ Normal/Hardcore + LLM:
  │    classify intent (keyword) → pipe to Ollama
  │    → sanitize JSON → reconcile w/ template (hybrid safety net)
  └─ Normal/Hardcore + no LLM: classify → template
applyReaction → updateHUD → render reply → check end
win/lose/timeout → results → save best
```

### Hybrid safety net (llm.js)

8B Typhoon ตอบ JSON ได้แต่ค่า mood/profit อาจเพี้ยน ~20% — llm.js เช็คก่อนใช้:

1. `profit_change > 0` → override เป็น template (profit ห้ามบวก)
2. `mood_change` sign ขัดแย้งกับ intent (e.g. yield ได้ −, refuse ได้ +) → override
3. `mood_change` ห่างจาก template > 20 → average ทั้งสอง
4. `customer_reply` ว่าง/null → fallback เป็น template message

LLM reply text เก็บใช้เสมอ (นั่นคือสิ่งที่ LLM ทำได้ดี)

## Tunables

- `scoring.js` :: `DIFFICULTY` — duration, scoreMul, harshness ต่อ difficulty
- `scoring.js` :: `RESULT_MUL` — multipliers ของ WIN/TIMEOUT/LOSE
- `scoring.js` :: `RANKS` — ขั้น emoji+label
- `llm.js` :: `TIMEOUT_MS`, `RETRY_TIMEOUT_MS`, `DEFAULT_MODEL`
- `chat.js` :: `TYPING_DELAY_MIN/MAX`, `BUBBLE_GAP`

## Phase 3 ต่อ

- Electron wrap → .exe installer
- เสียง notification, click, win/lose
- Achievements + daily challenge
- More combos, leaderboard
