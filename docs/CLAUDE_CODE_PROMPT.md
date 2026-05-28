# 🤖 Claude Code Prompt — แอดมินซิม (Admin Simulator)

> คัดลอกข้อความด้านล่างไปวางใน Claude Code
> แนบไฟล์ `ARCHITECTURE.md`, `DIALOGUE.md`, และ mockup HTML 3 ไฟล์ไปด้วย

---

## 📋 Prompt (คัดลอกส่วนนี้)

```
สร้างเกม "แอดมินซิม" (Admin Simulator) — เกมจำลองการเป็นแอดมินเพจ
ที่ต้องกล่อมลูกค้าหัวร้อนให้ใจเย็นภายใน 3 นาที

# Context files (อ่านก่อนเริ่ม)
- ARCHITECTURE.md — design ทั้งระบบ, tech stack, schemas, scoring
- DIALOGUE.md — บทสนทนา 49 คอมโบ + 28 reaction templates
- admin-sim-home.html — mockup หน้า home + game (UI ที่ต้องการเป๊ะๆ)
- admin-sim-mockup.html — mockup หน้าเกมละเอียด
- admin-sim-pitch.html — pitch deck (ดู game flow ตัวอย่าง)

# เป้าหมาย Phase 1 (MVP — ทำอันนี้ก่อน)
สร้างเกมเล่นได้จริงแบบ "choice mode" ยังไม่ต้องต่อ LLM
- หน้า Home: เลือก difficulty (Easy/Normal/Hardcore) + ปุ่มเริ่มเล่น
- หน้า Game: สุ่ม 1 ใน 49 คอมโบ, เล่นแบบกดเลือกคำตอบ 4 ตัวเลือก
- ระบบ scoring: มู้ดลูกค้า (0-100) + กำไรร้าน (0-100) + timer 3 นาที
- เงื่อนไขจบ: มู้ด≥80 = WIN, มู้ด≤0 = LOSE, หมดเวลา = TIMEOUT
- หน้า Results: แสดงคะแนน + rank + ปุ่มเล่นใหม่/กลับเมนู
- High score เก็บใน localStorage

# Tech stack
- Vanilla JS + HTML + CSS (ไม่ใช้ framework เพื่อให้เบาและ wrap Electron ง่าย)
- โครงสร้างไฟล์ตาม ARCHITECTURE.md section 3
- แยก data ออกเป็น JSON: situations.json (7), customer_types.json (7), dialogues.json (49 openings + 28 reactions)
- โค้ดแยก module: game.js, chat.js, scoring.js, content.js, storage.js

# UI requirements (สำคัญมาก)
- ลอก UI จาก admin-sim-home.html ให้เป๊ะ: phone frame, FB Messenger chat style,
  dark HUD ด้านบน, bubble ฟ้า/เทา, typing indicator, response buttons มี effect preview
- ใช้ font Kanit + Sarabun, theme สี orange/pink/yellow gradient
- ลูกค้าส่งหลาย bubble ซ้อนกันแบบมี delay (800ms-1.5s) ให้รู้สึกเหมือนพิมพ์จริง
- typing indicator โผล่ก่อนข้อความใหม่ทุกครั้ง
- mood bar เปลี่ยนสีตามค่า: <40 แดง, 40-70 เหลือง, >70 เขียว

# Scoring logic (ตาม ARCHITECTURE.md section 7)
- ต่อ turn: mood += base_change × customer_type.multiplier
- final_score = (mood × profit × time_remaining_pct) / 100
- ปรับ multiplier ตาม difficulty และ result (WIN ×1.0, TIMEOUT ×0.6, LOSE ×0.2)

# สิ่งที่ต้องระวัง
- ใช้บทสนทนาจาก DIALOGUE.md ทั้งหมด (49 openings + 28 reactions) อย่าแต่งใหม่
- สุ่ม customer name + emoji จาก list ใน customer_types
- "สายพลิก" (flip) ต้องลงโทษหนักถ้าปฏิเสธ (mood -30) ตามที่ระบุ
- ทำให้ choice mode สมบูรณ์ก่อน — ออกแบบ code ให้ต่อ LLM ใน Phase 2 ได้ง่าย
  (แยก function getCustomerReaction() ที่ Phase 2 จะสลับเป็น LLM call)

# Deliverable Phase 1
- เกมเล่นได้เต็ม loop: home → เลือก diff → เล่น → จบ → results → เล่นใหม่
- รันได้ใน browser ปกติ (เปิดไฟล์ index.html)
- โค้ดสะอาด มี comment ภาษาไทย/อังกฤษ พร้อม wrap Electron ใน Phase ถัดไป

เริ่มจากอ่าน context files ทั้งหมด แล้ววาง project structure ให้ดูก่อน
จากนั้นค่อยลงมือเขียนทีละ module
```

---

## 🔧 Prompt เสริม — Phase 2 (หลัง MVP เสร็จ)

เมื่อ Phase 1 เล่นได้แล้ว ค่อยใช้ prompt นี้ต่อ:

```
ตอนนี้ MVP choice mode เล่นได้แล้ว ทำ Phase 2: ต่อ Local LLM + Electron

# 1. LLM Integration (Typhoon ผ่าน Ollama)
- เพิ่ม llm.js: เรียก http://127.0.0.1:11434/api/chat
- model: scb10x/llama3.2-typhoon2-3b-instruct, format: 'json'
- system prompt ตาม ARCHITECTURE.md section 6
- parse JSON response: { mood_change, profit_change, creativity_bonus, customer_reply }
- Fallback: ถ้า Ollama ไม่ตอบใน 5 วิ → ใช้ reaction template เดิม

# 2. Normal mode
- เพิ่ม text input ใต้ปุ่ม choice — ผู้เล่นพิมพ์เองได้
- พิมพ์เอง → ส่งให้ LLM ประเมิน → คะแนน × 1.5
- กดปุ่ม → ใช้ logic เดิม (choice)

# 3. Hardcore mode
- ซ่อนปุ่ม choice เหลือแต่ text input
- ทุก turn ผ่าน LLM, คะแนน × 2 + creativity_bonus

# 4. Electron wrapper
- electron main.js: spawn ollama serve ตอน start, kill ตอนปิด
- first-run.js: เช็ค model มั้ย ไม่มี → ollama pull + progress bar UI
- preload.js: IPC bridge ระหว่าง renderer กับ ollama
- electron-builder config: output .exe (NSIS installer)

# 5. ทดสอบ
- test ว่า fallback ทำงานเมื่อ Ollama ปิด
- test first-run download flow
- build .exe แล้วลองติดตั้งบนเครื่องสะอาด
```

---

## 💡 Tips การใช้ Claude Code

1. **แนบ context files ครบ** — ลาก ARCHITECTURE.md + DIALOGUE.md + mockup HTML ทั้งหมดเข้าไป
2. **ให้วาง structure ก่อน** — อย่าให้เขียนรวดเดียว ขอดู file tree + plan ก่อน
3. **ทำทีละ module** — content.js (data) → scoring.js → chat.js → game.js
4. **เทสต์บ่อย** — ขอให้เปิด browser ดูทุก milestone
5. **เก็บ choice mode ให้ดีก่อน** — LLM เป็น enhancement ไม่ใช่ core

## ⚙️ Setup ก่อนเริ่ม (ฝั่งคุณ)

```bash
# ติดตั้ง Ollama (สำหรับ Phase 2)
# ดาวน์โหลดจาก ollama.com

# โหลด Typhoon model
ollama run scb10x/llama3.2-typhoon2-3b-instruct

# ทดสอบว่า Ollama ทำงาน
curl http://127.0.0.1:11434/api/tags
```
