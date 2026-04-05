// sender.js — Telegram send + edit with message tracking
const https = require('https');
const { BOT_TOKEN, CHAT_ID } = require('./config');

const GAP = 3000;
const MAX_RETRIES = 3;

let queue = [];
let sending = false;
let lastMessageId = null;

function tgRequest(method, payload, cb) {
  const body = JSON.stringify(payload);
  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/${method}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, res => {
    let d = ''; res.on('data', c => d += c);
    res.on('end', () => cb(null, d));
  });
  req.on('error', e => cb(e));
  req.write(body); req.end();
}

function sendNew(text) {
  if (!text) return;
  queue.push({ action: 'send', text });
  drain();
}

function editLast(text) {
  if (!text) return;
  if (!lastMessageId) { sendNew(text); return; }
  queue.push({ action: 'edit', text });
  drain();
}

function resetTracking() {
  lastMessageId = null;
}

function drain() {
  if (sending || !queue.length) return;
  sending = true;
  const job = queue.shift();

  if (job.action === 'edit' && lastMessageId) {
    tgRequest('editMessageText', {
      chat_id: CHAT_ID, message_id: lastMessageId,
      text: job.text, parse_mode: 'HTML',
      disable_web_page_preview: true,
    }, (err, d) => {
      if (err || !d || !d.includes('"ok":true')) {
        console.error('[sender] edit fail:', (d || '').slice(0, 100));
        queue.unshift({ action: 'send', text: job.text, _retries: (job._retries || 0) });
        lastMessageId = null;
      }
      sending = false; setTimeout(drain, GAP);
    });
    return;
  }

  tgRequest('sendMessage', {
    chat_id: CHAT_ID, text: job.text, parse_mode: 'HTML',
    disable_web_page_preview: true, disable_notification: true,
  }, (err, d) => {
    if (!err && d) {
      try {
        const res = JSON.parse(d);
        if (res.ok && res.result) lastMessageId = res.result.message_id;
      } catch {}
      if (!d.includes('"ok":true')) {
        const retries = (job._retries || 0) + 1;
        if (retries < MAX_RETRIES) {
          console.error(`[sender] send fail (retry ${retries}/${MAX_RETRIES}):`, d.slice(0, 200));
          queue.push({ action: 'send', text: job.text, _retries: retries });
        } else {
          console.error('[sender] send fail (dropped after max retries):', d.slice(0, 200));
        }
      }
    }
    if (err) {
      const retries = (job._retries || 0) + 1;
      if (retries < MAX_RETRIES) {
        console.error(`[sender] error (retry ${retries}/${MAX_RETRIES}):`, err.message);
        queue.push({ action: 'send', text: job.text, _retries: retries });
      } else {
        console.error('[sender] error (dropped after max retries):', err.message);
      }
    }
    sending = false; setTimeout(drain, GAP);
  });
}

module.exports = { sendNew, editLast, resetTracking };
