# 🎮 แอดมินซิม — Architecture Document

> **Last updated:** May 28, 2026
> **Status:** Pre-development design
> **Stack:** Electron + Ollama + Typhoon 2 + HTML/CSS/JS

---

## 1. System Overview

เกมจำลองการเป็นแอดมินเพจ — ผู้เล่นต้องจัดการลูกค้าเอาใจยาก 1 คน ภายในเวลา 3 นาที โดยพยายาม "ปิดเคส" ให้มู้ดลูกค้าสูงพอ ขณะรักษากำไรร้าน

**User flow:**

```
[ดับเบิ้ลคลิก MyGame.exe]
        ↓
[First run? → ดาวน์โหลด Typhoon model (~2GB) + progress bar]
        ↓
[Main Menu] ← → [Settings / High Score]
        ↓
[เลือก Difficulty: Easy / Normal / Hardcore]
        ↓
[สุ่ม Combo: 1 ใน 49] (สถานการณ์ × สายลูกค้า)
        ↓
[เกมเล่น: 3 นาที / 1 เคส]
        ↓
[Results Screen] → [Save score → Main Menu]
```

---

## 2. Tech Stack

| Layer | Tech | Reason |
|---|---|---|
| Game UI | HTML5 + CSS + Vanilla JS | เบา ไม่ต้อง build pipeline ซับซ้อน |
| Desktop wrapper | Electron 28+ | คุ้นเคยกับ JS, ecosystem ใหญ่ |
| Local LLM runtime | Ollama (portable) | API ง่าย, supports Typhoon |
| LLM model | `scb10x/llama3.2-typhoon2-3b-instruct` Q4 | ภาษาไทยดีที่สุดในขนาดนี้ |
| Storage | electron-store | high score, settings |
| Build | electron-builder + NSIS | output .exe installer |
| Distribution | GitHub Releases | ฟรี, ไม่จำกัดขนาด |

---

## 3. File Structure

```
admin-sim/
├─ src/
│  ├─ index.html              ← เปิดเกม
│  ├─ menu.html               ← main menu
│  ├─ game.html               ← หน้าเกม (mockup ที่ทำไปแล้ว)
│  ├─ results.html            ← จบเกม
│  ├─ styles/
│  │  └─ main.css
│  ├─ js/
│  │  ├─ game.js              ← game loop + state machine
│  │  ├─ chat.js              ← UI ของ chat
│  │  ├─ scoring.js           ← mood/profit/score logic
│  │  ├─ llm.js               ← Ollama API client
│  │  ├─ content.js           ← โหลด combo data (49 entries)
│  │  └─ storage.js           ← save/load
│  └─ assets/
│     ├─ icons/
│     └─ sounds/              ← เสียง notify, ตี้ฮ่อ ฯลฯ
├─ data/
│  ├─ situations.json         ← 7 ร้าน
│  ├─ customer_types.json     ← 7 สาย
│  └─ dialogues.json          ← 49 openings + 28 reaction templates
├─ resources/                 ← bundle ใน .exe
│  ├─ ollama/                 ← portable binary
│  └─ models/                 ← Typhoon (download on first run)
├─ main.js                    ← Electron main process
├─ preload.js                 ← IPC bridge
├─ first-run.js               ← model download wizard
├─ package.json
└─ build/
   ├─ icon.ico
   └─ installer.nsh           ← NSIS config
```

---

## 4. Game State Machine

```
   ┌──────────┐
   │   INIT   │ ตรวจ Ollama, ตรวจ model
   └────┬─────┘
        │
        ▼
   ┌──────────┐
   │   MENU   │ ◄────────────────────────┐
   └────┬─────┘                          │
        │ (กด PLAY)                       │
        ▼                                │
   ┌──────────────┐                      │
   │ MATCH_INIT   │ สุ่ม combo,           │
   │              │ ตั้ง mood/profit/timer │
   └────┬─────────┘                      │
        │                                │
        ▼                                │
   ┌──────────┐  player picks/types      │
   │ PLAYING  │ ◄──┐                     │
   └────┬─────┘    │                     │
        │          │ customer reacts     │
        │          │                     │
        ▼          │                     │
   ┌──────────┐    │                     │
   │ TURN_END │ ───┘                     │
   └────┬─────┘                          │
        │                                │
   ┌────┴───────────────────┐            │
   │                        │            │
   ▼  (mood>=80)  ▼ (mood<=0)  ▼ (timer=0) │
   ┌──────┐  ┌──────┐  ┌─────────┐       │
   │ WIN  │  │ LOSE │  │ TIMEOUT │       │
   └──┬───┘  └──┬───┘  └────┬────┘       │
      │         │           │            │
      └─────────┴───────────┴────────────┤
                  │                      │
                  ▼                      │
            ┌───────────┐                │
            │  RESULTS  │ ───────────────┘
            └───────────┘
```

**End conditions:**
- `mood >= 80` → **WIN** (ปิดเคสได้, full score)
- `mood <= 0` → **LOSE** (โดน 1-ดาวรีวิว, score × 0.2)
- `timer == 0` → **TIMEOUT** (เคสค้าง, score × 0.6)

---

## 5. Data Schemas

### `situations.json` (7 entries)

```json
{
  "id": "shop_clothes",
  "shop_name": "Boutique Pink",
  "category": "เสื้อผ้า",
  "icon": "👗",
  "complaint": "ลูกค้าสั่งผิดไซส์เอง ขอคืน/เปลี่ยน",
  "policy": "ทางร้านไม่รับคืนสินค้าทุกกรณี",
  "context_for_llm": "ร้านเสื้อผ้าออนไลน์ มีตารางไซส์ระบุชัดเจน ลูกค้าไม่ได้เช็คก่อนสั่ง"
}
```

### `customer_types.json` (7 entries)

```json
{
  "id": "drama",
  "name": "สายดราม่า",
  "icon": "😭",
  "starting_mood": 25,
  "tone_description": "ใช้อิโมจิ 😭💔 เยอะ พิมพ์ลากเสียง (ค่าาา) พูดถึงความเป็นแฟนคลับ",
  "name_examples": ["น้องนุ่น", "น้องเมย์", "หนูแอม"],
  "reaction_multipliers": {
    "yield": 1.2,
    "negotiate": 1.0,
    "refuse": 1.5,
    "deflect": 0.8
  }
}
```

### `dialogues.json` — Opening (49 entries)

```json
{
  "situation_id": "shop_clothes",
  "customer_type_id": "drama",
  "mood_override": 22,
  "messages": [
    "พี่ค่าาาา 😭😭😭",
    "หนูสั่งเสื้อมา ใส่ไม่ได้เลยค่าาา คับมากกก",
    "หนูดีใจมากที่เจอร้านพี่ แต่ใส่ไม่ได้หนูจะร้องไห้ 💔"
  ]
}
```

### `dialogues.json` — Reaction templates (28 entries: 7 types × 4 responses)

```json
{
  "customer_type_id": "drama",
  "response_type": "refuse",
  "mood_change": -15,
  "profit_change": 0,
  "message": "พี่ใจร้ายยยย 😭😭 ทำไมร้านพี่ใจร้ายกับหนูแบบนี้ 💔💔"
}
```

### Response types (player's 4 choices):

| ID | Tag | Base mood Δ | Base profit Δ |
|---|---|---|---|
| `yield` | ยอมทุกอย่าง | +30 | -40 |
| `negotiate` | เจรจาฉลาด | +15 | -10 |
| `refuse` | ปฏิเสธสุภาพ | -10 | 0 |
| `deflect` | ปั่น/โยกย้าย | 0 (ครั้งแรก), -5 (ครั้งต่อๆไป) | 0 |

ค่าจริง = base × customer_type.reaction_multipliers[response_type]

---

## 6. LLM Integration (Normal/Hardcore mode)

### When triggered:
- Normal mode: ผู้เล่นเลือกพิมพ์เองแทนกดปุ่ม
- Hardcore mode: ทุกครั้ง

### Ollama API call:
```javascript
const res = await fetch('http://127.0.0.1:11434/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'scb10x/llama3.2-typhoon2-3b-instruct',
    format: 'json',
    stream: false,
    options: { temperature: 0.8, num_predict: 200 },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: playerMessage }
    ]
  })
});
```

### System Prompt template:
```
คุณคือลูกค้าของร้าน {shop_name}
สถานการณ์: {complaint}
นโยบายร้าน: {policy}
บุคลิกคุณ: {customer_type.tone_description}
มู้ดปัจจุบัน: {mood}/100

แอดมินตอบกลับว่า: "{player_message}"

ตอบเป็น JSON เท่านั้น ห้ามมี text อื่น:
{
  "mood_change": <int -30 to +30>,
  "profit_change": <int -30 to 0>,
  "creativity_bonus": <int 0-20>,
  "customer_reply": "<ข้อความตอบกลับ 1-2 ประโยค ในบุคลิกของคุณ>"
}
```

### Fallback:
- ถ้า Ollama ไม่ตอบใน 5 วินาที → ใช้ reaction template แทน
- ถ้า JSON parse fail → retry 1 ครั้ง → fallback template

---

## 7. Scoring Logic

### Per-turn:
```javascript
mood = clamp(mood + (base_mood_change × multiplier), 0, 100)
profit = clamp(profit + base_profit_change, 0, 100)
turn_score = mood_change × 2 + (creativity_bonus || 0)
```

### End-game:
```javascript
let final_score = (mood * profit * time_remaining_pct) / 100

// Bonuses & penalties
if (mode === 'normal' && used_typing) final_score *= 1.5
if (mode === 'hardcore') final_score *= 2.0
if (state === 'WIN') final_score *= 1.0
if (state === 'TIMEOUT') final_score *= 0.6
if (state === 'LOSE') final_score *= 0.2
```

### Display:
- 0-500: 😐 รอด
- 500-1500: 😊 ดี
- 1500-3000: 🌟 เยี่ยม
- 3000+: 👑 GOAT แอดมิน

---

## 8. UI Components

(อ้างอิงจาก mockup ที่ทำแล้ว)

- **Phone Frame** — visual container
- **Game HUD** (top, dark theme) — timer / mood / profit / score
- **FB Messenger Header** — customer avatar + name + active dot
- **Chat Area** — scrollable bubbles, typing indicator
- **Response Panel** (เปลี่ยนตาม mode):
  - Easy: 4 choice buttons
  - Normal: text input + 4 buttons (พิมพ์ = bonus)
  - Hardcore: text input only
- **End Screen** — score breakdown, ปุ่ม "เล่นอีก" / "กลับ menu"

---

## 9. Packaging & Distribution

### Build flow:
```bash
npm run build          # bundle assets
electron-builder --win # produce .exe
```

### Installer (NSIS):
- ขนาด ~250MB (ไม่รวม model)
- ติดตั้งใน `%LOCALAPPDATA%/AdminSim/`
- สร้าง shortcut บน Desktop + Start Menu
- Uninstaller ลบทุกอย่างรวมถึง model ที่โหลดมา

### First-run wizard:
1. ตรวจ Ollama → ถ้าไม่มี start จาก bundled binary
2. ตรวจ model → ถ้าไม่มี:
   - แสดง dialog "ดาวน์โหลดโมเดล AI (2GB)"
   - call `ollama pull scb10x/llama3.2-typhoon2-3b-instruct`
   - progress bar real-time
3. ตรวจ RAM ≥ 8GB → ถ้าน้อยกว่า warn

### Distribution:
- **Primary:** GitHub Releases (`AdminSim-Setup-1.0.0.exe`)
- **Secondary:** itch.io (รองรับ tag "thai", "indie")
- **README** บอกข้อกำหนด: Windows 10+, RAM 8GB+, Disk 4GB

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Windows SmartScreen warning | ใส่ instruction ใน README ให้กด "More info → Run anyway" หรือซื้อ certificate ($200/ปี) |
| Antivirus false positive | Submit เพื่อ whitelist กับ Microsoft, VirusTotal |
| Model download fail | Resume support + alternative mirror |
| LLM ตอบช้า/แปลก | Fallback to template, log สำหรับ debug |
| ผู้เล่น RAM น้อย | ใช้ model 1B แทน (toggle ใน settings) |
| First-run มี 2GB ต้องโหลด | แสดง progress ชัดเจน, allow skip → ใช้ choice mode อย่างเดียว |

---

## 11. MVP vs Full Scope

### MVP (Phase 1) — เกมเล่นได้ ไม่ต้อง LLM
- ✅ UI mockup เสร็จแล้ว
- ⬜ 49 combo content + 28 reaction templates
- ⬜ Game loop / scoring
- ⬜ Easy mode (choice only)
- ⬜ Electron wrap + basic .exe

### Phase 2 — LLM integration
- ⬜ Bundle Ollama
- ⬜ First-run model download
- ⬜ Normal mode (choice + typing)
- ⬜ Hardcore mode (typing only)
- ⬜ Polish, sound effects

### Phase 3 — Future
- ⬜ ระบบ achievement
- ⬜ Customer types เพิ่ม (สายเงียบ, สายตลก)
- ⬜ Mac/Linux build
- ⬜ Streamer/TikTok overlay mode

---

## 12. Open Questions

- [ ] เกม UI ใช้ Vanilla JS หรือ React? (mockup ตอนนี้เป็น HTML pure)
- [ ] เสียง notification ตอนลูกค้าทักมา — ใช้เสียง FB จริงๆ หรือทำเอง?
- [ ] ภาษาเดียวหรือมี EN switch ด้วย?
- [ ] High score แชร์ได้ไหม (leaderboard online ต้อง backend)
- [ ] รองรับ Mac/Linux จากแรกเลย หรือ Windows ก่อน?
