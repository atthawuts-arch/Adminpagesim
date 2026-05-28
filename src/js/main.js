import { loadContent } from './content.js';
import * as game from './game.js';
import * as storage from './storage.js';
import * as llm from './llm.js';
import { getRank, formatTime, DIFFICULTY } from './scoring.js';

const RESULT_LABELS = {
  win:     { title: '🎉 WIN!',    sub: 'ปิดเคสได้สำเร็จ — ลูกค้ายิ้มกลับมา' },
  lose:    { title: '💀 LOSE',    sub: 'ลูกค้าโดน 1 ดาว เพจถูก review bomb' },
  timeout: { title: '⏱ TIMEOUT',  sub: 'หมดเวลา — เคสค้างไว้แบบนั้น' },
};

const $ = (id) => document.getElementById(id);

let selectedDiff = 'easy';

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(id).classList.add('active');
}

function renderHomeBestScore() {
  const best = storage.getBestScore();
  const el = $('hiScore');
  if (!best) {
    el.textContent = '🏆 ยังไม่มีสถิติ — เล่นเลย!';
    return;
  }
  const rank = getRank(best.score);
  el.textContent = `🏆 BEST: ${best.score.toLocaleString()} · ${rank.emoji} ${rank.label}`;
}

function bindHome() {
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDiff = btn.dataset.diff;
    };
  });

  $('startBtn').onclick = async () => {
    showPage('game');
    await game.startMatch(selectedDiff);
  };

  $('howToPlayBtn').onclick = () => $('howModal').classList.add('active');
  $('closeHowBtn').onclick = () => $('howModal').classList.remove('active');

  $('resetScoreBtn').onclick = () => {
    if (confirm('ล้างสถิติทั้งหมดเลย?')) {
      storage.clearAll();
      renderHomeBestScore();
    }
  };

  $('aiStatus').onclick = () => refreshAIStatus({ force: true });
}

async function refreshAIStatus({ force = false } = {}) {
  const el = $('aiStatus');
  el.classList.remove('ok', 'warn', 'bad');
  const backend = llm.getBackend();
  const backendLabel = backend === 'ollama' ? 'Ollama' : 'Server';
  el.textContent = `⏳ กำลังตรวจ ${backendLabel}…`;
  const s = await llm.probeBackend({ force });
  if (s.available && s.modelPresent) {
    el.classList.add('ok');
    el.textContent = `🤖 AI พร้อม · ${shortModel(s.model)} (Normal/Hardcore)`;
  } else if (s.available && !s.modelPresent) {
    el.classList.add('warn');
    const hint = backend === 'ollama'
      ? `⚠ Ollama ON แต่ยังไม่มีโมเดล — pull ${shortModel(s.model)}`
      : `⚠ Server up แต่ยังไม่ได้ตั้ง TYPHOON_API_KEY`;
    el.textContent = hint;
  } else {
    el.classList.add('bad');
    const hint = backend === 'ollama'
      ? '📋 Ollama offline — เล่นได้แต่โหมด Easy (template)'
      : '📋 Server offline — เล่นได้แต่โหมด Easy (template)';
    el.textContent = hint;
  }
}

function shortModel(m) {
  return (m || '').split('/').pop().replace(':latest', '');
}

function bindGame() {
  $('backBtn').onclick = () => {
    if (confirm('ออกจากเคสนี้ คะแนนจะไม่ถูกบันทึก ออกเลย?')) {
      game.abortMatch();
      showPage('home');
      renderHomeBestScore();
    }
  };
}

function bindResults() {
  $('playAgainBtn').onclick = async () => {
    showPage('game');
    await game.startMatch(selectedDiff);
  };
  $('backHomeBtn').onclick = () => {
    showPage('home');
    renderHomeBestScore();
  };
}

function showResults(entry) {
  const labels = RESULT_LABELS[entry.result];
  const rank = getRank(entry.score);
  const diff = DIFFICULTY[entry.diff];
  const resultMul = entry.result === 'win' ? 1.0 : entry.result === 'timeout' ? 0.6 : 0.2;

  const page = $('results');
  page.classList.remove('win', 'lose', 'timeout');
  page.classList.add(entry.result);

  $('resResult').textContent = labels.title;
  $('resSub').textContent = labels.sub;
  $('resScore').textContent = entry.score.toLocaleString();
  $('resRank').textContent = `${rank.emoji} ${rank.label}`;
  $('brkMood').textContent = `${entry.mood} / 100`;
  $('brkProfit').textContent = `${entry.profit} / 100`;
  $('brkTime').textContent = formatTime(entry.timeLeft);
  const aiTag = entry.llm ? ' · 🤖 AI' : (entry.diff === 'easy' ? '' : ' · 📋');
  const typingTag = entry.usedTyping ? ' · ⌨ +15%' : '';
  const creativityTag = entry.creativityBonus ? ` · ✨+${entry.creativityBonus}` : '';
  $('brkMult').textContent = `×${(diff.scoreMul * resultMul).toFixed(2)} (${diff.label})${aiTag}${typingTag}${creativityTag}`;

  const best = storage.getBestScore();
  if (entry.isNewBest) {
    $('brkBest').textContent = `🆕 NEW BEST! ${entry.score.toLocaleString()}`;
  } else if (best) {
    $('brkBest').textContent = best.score.toLocaleString();
  } else {
    $('brkBest').textContent = '—';
  }

  showPage('results');
}

async function bootstrap() {
  try {
    await loadContent();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `
      <div style="padding:40px; font-family:Sarabun,sans-serif; color:#333; text-align:center;">
        <h2 style="font-family:Kanit;">โหลดข้อมูลเกมไม่สำเร็จ</h2>
        <p style="margin-top:12px;">ดูเหมือนเปิดไฟล์ตรงๆ ผ่าน <code>file://</code> ทำให้ <code>fetch()</code> โดน CORS ปิด<br>
        ลองรันเป็น local server ด้วย <code>python -m http.server</code> หรือ <code>npx serve</code> ในโฟลเดอร์ <code>src/</code></p>
        <pre style="margin-top:12px; color:#a00; font-size:12px;">${err.message}</pre>
      </div>`;
    return;
  }

  bindHome();
  bindGame();
  bindResults();
  game.bindFinishCallback(showResults);
  renderHomeBestScore();
  // probe in background — don't block bootstrap
  refreshAIStatus();
}

bootstrap();
