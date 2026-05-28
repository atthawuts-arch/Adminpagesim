# 🎮 แอดมินซิม (Admin Simulator)

เกมจำลองการเป็นแอดมินเพจ — กล่อมลูกค้าหัวร้อนให้ใจเย็นภายใน 3 นาที
สุ่ม 7 ร้าน × 7 สายลูกค้า = 49 คอมโบ · เล่นบน Desktop · ใช้ Local LLM (Typhoon)

---

## 📁 โครงสร้าง

```
admin-sim/
├─ README.md              ← ไฟล์นี้
├─ package.json           ← Electron entry + build config
├─ main.js                ← Electron main process
├─ preload.js             ← IPC bridge (placeholder)
├─ src/                   ← เนื้อเกม (renderer)
│  ├─ index.html
│  ├─ styles/main.css
│  ├─ js/                 ← game.js, chat.js, scoring.js, content.js, storage.js, llm.js
│  ├─ data/               ← situations.json, customer_types.json, dialogues.json
│  └─ README.md           ← วิธีรัน + ติดตั้ง Ollama
├─ docs/                  ← ARCHITECTURE, DIALOGUE
├─ mockups/               ← clickable HTML prototypes
├─ tools/                 ← LLM smoke test scripts (Node)
├─ build/                 ← electron-builder assets (icon ฯลฯ)
└─ dist/                  ← .exe installer ออกที่นี่ (gitignored)
```

---

## 🚀 รัน

มี 3 รูปแบบ ขึ้นกับว่าใช้ AI ตรงไหน:

### 1. Electron dev (LLM = local Ollama)

```bash
npm install
npm run dev              # เปิดเกมใน Electron window — เรียก Ollama 127.0.0.1:11434
```

### 2. Web server dev (LLM = Typhoon API proxy)

```bash
npm install
cp .env.example .env     # ใส่ TYPHOON_API_KEY ใน .env
npm start                # ตั้งเซิร์ฟเวอร์ที่ http://localhost:3000
```

`llm.js` ในเบราว์เซอร์จะ auto-detect protocol — เห็น `http://` → ใช้ `/api/llm/turn`
proxy ผ่านเซิร์ฟเวอร์ไป Typhoon API

### 3. Static-only (ไม่มี AI — Easy mode template เท่านั้น)

```bash
python -m http.server 8765 --directory src
# เปิด http://localhost:8765
```

### Build portable .exe (Recommended ตอนนี้)

```bash
npm run pack:win         # → dist/AdminSim-win32-x64/AdminSim.exe (188MB)
npm run zip:win          # → dist/AdminSim-portable-win-x64.zip (พร้อมแจกจ่าย)
```

แค่ดับเบิ้ลคลิก `AdminSim.exe` ได้เลย ไม่ต้องติดตั้ง

### Build NSIS installer (advanced — ต้อง Windows Dev Mode)

```bash
npm run build:win        # → dist/AdminSim-Setup-x.x.x.exe
npm run build:dir        # → dist/win-unpacked/
```

> ⚠️ electron-builder ต้องสร้าง symlinks ใน cache → ต้องเปิด
> **Windows Developer Mode** ก่อน (Settings → Privacy & security → For developers → Developer Mode = On)
> หรือรันคำสั่งเป็น Administrator ครั้งแรก

---

## 🌐 Deploy เป็น web app (Railway)

ต้องการให้คนเล่นบนเว็บโดยไม่ต้องติดตั้งอะไรเลย — เซิร์ฟเวอร์ทำหน้าที่ proxy LLM ให้

### Setup

1. **เอา Typhoon API key** จาก [opentyphoon.ai](https://opentyphoon.ai)
2. **Create project บน Railway** → connect GitHub repo
3. **ตั้ง Environment Variables** ใน Railway dashboard:
   ```
   TYPHOON_API_KEY=sk-...
   TYPHOON_MODEL=typhoon-v2.5-30b-a3b-instruct    # default (30B MoE, ~2-3s/turn)
   ALLOW_ORIGINS=https://your-app.up.railway.app  # หรือ * ตอน dev
   ```
4. **Deploy** — Railway จะอ่าน [railway.toml](railway.toml) อัตโนมัติ
   - `npm install` → build
   - `npm start` → run `node server/index.mjs`
   - Health check ที่ `/api/health`
5. **เปิด URL ที่ Railway สร้างให้** → เกมเล่นได้ทันที!

### Cost estimate

- Railway: $5/mo (Hobby plan) — เซิร์ฟเวอร์ Node เล็กๆ
- Typhoon API: free tier available, paid `$0.x/1M tokens` ถ้าใช้เยอะ
- ปริมาณ token: 1 เกม ~ 500-1000 token (5-10 turns × 100-200 token/turn)

### LLM provider อื่น

`server/index.mjs` พูดกับ OpenAI-compatible API — สลับได้:

| Provider | TYPHOON_API_BASE | TYPHOON_MODEL |
|---|---|---|
| Typhoon (default) | `https://api.opentyphoon.ai/v1` | `typhoon-v2.5-30b-a3b-instruct` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Together.ai | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Local Ollama (dev) | `http://127.0.0.1:11434/v1` | `scb10x/llama3.1-typhoon2-8b-instruct` |

---

## 🤖 LLM mode (Normal / Hardcore)

ต้องมี **Ollama + Typhoon 8B** บนเครื่อง:

```powershell
winget install Ollama.Ollama
ollama pull scb10x/llama3.1-typhoon2-8b-instruct
```

ดูรายละเอียดใน [src/README.md](src/README.md)

ไม่มี Ollama ก็ยังเล่นได้ — โหมด Easy ใช้ template, Normal/Hardcore จะใช้
keyword classifier + template fallback (มี ⚠ บอกใน HUD)

---

## ⚙️ Tech Stack

- **Renderer:** Vanilla JS + HTML + CSS (ES modules)
- **Desktop:** Electron 33 + electron-builder + NSIS
- **Local LLM:** Ollama + Typhoon 2 8B Q4 (4.6GB) — ภาษาไทยดีเยี่ยม
- **Storage:** localStorage (best score, history)

---

## 🎯 Status

| Phase | สิ่งที่ทำ | สถานะ |
|---|---|---|
| **0. Design** | mockup + dialogue + architecture | ✅ |
| **1. MVP** | choice mode เล่นได้ครบ loop | ✅ |
| **2. AI** | Ollama + Typhoon 8B + hybrid safety net | ✅ |
| **3. Electron** | desktop app + portable .exe (188MB) | ✅ |
| **3b. NSIS installer** | one-click installer | ⏸ blocked by Windows symlink/Dev Mode |
| **3c. Web server** | Express + Typhoon API proxy + Railway config | ✅ |
| **4. Polish** | sound, achievements, more content, icon | ⬜ |

---

## 📚 เอกสาร

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design, state machine, scoring
- [docs/DIALOGUE.md](docs/DIALOGUE.md) — 49 openings + 28 reactions
- [src/README.md](src/README.md) — รัน + ติดตั้ง Ollama + hybrid mode explanation
