const TYPING_DELAY_MIN = 800;
const TYPING_DELAY_MAX = 1500;
const BUBBLE_GAP = 350;

function el() { return document.getElementById('chat'); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

function scrollDown() {
  const c = el();
  c.scrollTop = c.scrollHeight;
}

export function clearChat() {
  const c = el();
  c.innerHTML = '';
  const ts = document.createElement('div');
  ts.className = 'timestamp';
  ts.textContent = formatNow();
  c.appendChild(ts);
}

function formatNow() {
  const d = new Date();
  return `วันนี้ ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function showTyping(emoji) {
  const c = el();
  removeTyping();
  const row = document.createElement('div');
  row.className = 'msg-row';
  row.id = 'typingRow';
  row.innerHTML = `<div class="msg-avatar-sm">${emoji}</div><div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  c.appendChild(row);
  scrollDown();
}

function removeTyping() {
  document.getElementById('typingRow')?.remove();
}

/**
 * Render a sequence of customer bubbles with typing indicators between each.
 * Returns when all bubbles are rendered.
 */
export async function addCustomerBubbles(messages, emoji) {
  const c = el();
  for (let i = 0; i < messages.length; i++) {
    showTyping(emoji);
    await sleep(rand(TYPING_DELAY_MIN, TYPING_DELAY_MAX));
    removeTyping();

    // Find or create a contiguous msg-row to group bubbles.
    let row = c.lastElementChild;
    let bubbles;
    if (row && row.classList.contains('msg-row') && !row.classList.contains('out') && i > 0) {
      bubbles = row.querySelector('.bubbles');
    } else {
      row = document.createElement('div');
      row.className = 'msg-row';
      row.innerHTML = `<div class="msg-avatar-sm">${emoji}</div><div class="bubbles"></div>`;
      c.appendChild(row);
      bubbles = row.querySelector('.bubbles');
    }
    const b = document.createElement('div');
    b.className = 'bubble in';
    b.textContent = messages[i];
    bubbles.appendChild(b);
    scrollDown();
    if (i < messages.length - 1) await sleep(BUBBLE_GAP);
  }
}

export function addPlayerBubble(text) {
  const c = el();
  const row = document.createElement('div');
  row.className = 'msg-row out';
  row.innerHTML = `<div class="bubbles"><div class="bubble out"></div></div>`;
  row.querySelector('.bubble').textContent = text;
  c.appendChild(row);
  scrollDown();
}

export function addSystemBanner(html) {
  const c = el();
  const div = document.createElement('div');
  div.className = 'timestamp';
  div.style.cssText = 'margin-top:14px; font-weight:700;';
  div.innerHTML = html;
  c.appendChild(div);
  scrollDown();
}
