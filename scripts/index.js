#!/usr/bin/env node
// session-monitor v9 — main entry point
const fs = require('fs');
const path = require('path');
const { sendNew, editLast, resetTracking } = require('./sender');
const { DIR, loadKeys, getTag } = require('./sessions');
const { parse } = require('./parser');
const { buildMessage } = require('./formatter');

// ── Configuration ────────────────────────────────
const POLL = 3000;            // poll interval (ms)
const MERGE_WINDOW = 1;       // merge edits within N minutes into one message
const NEW_MSG_THRESHOLD = 3000; // start new message if current exceeds this many chars
// ─────────────────────────────────────────────────

const sizes = new Map();

// ── Time-window accumulator ──────────────────────
let currentWindow = null;
let accGroups = new Map();
let hasSentInWindow = false;

function getWindowKey() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const slot = String(Math.floor(d.getMinutes() / MERGE_WINDOW));
  return `${dd}${hh}s${slot}`;
}

function poll() {
  try {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'));
    const newEntries = new Map();

    for (const f of files) {
      const fp = path.join(DIR, f);
      const prev = sizes.get(fp) || 0;
      let size;
      try { size = fs.statSync(fp).size; } catch { continue; }
      if (!prev) { sizes.set(fp, size); continue; }
      if (size < prev) { sizes.set(fp, size); continue; } // file was compacted/rewritten
      if (size === prev) continue;
      try {
        const fd = fs.openSync(fp, 'r');
        const buf = Buffer.alloc(size - prev);
        fs.readSync(fd, buf, 0, buf.length, prev);
        fs.closeSync(fd);
        sizes.set(fp, size);
        const sid = path.basename(fp, '.jsonl');
        const tag = getTag(sid);
        for (const raw of buf.toString('utf8').split('\n')) {
          if (!raw.trim()) continue;
          try {
            const e = parse(JSON.parse(raw));
            if (e) {
              if (!newEntries.has(tag)) newEntries.set(tag, []);
              newEntries.get(tag).push(e);
            }
          } catch {}
        }
      } catch { sizes.set(fp, size); }
    }

    if (!newEntries.size) return;

    const window = getWindowKey();
    if (window !== currentWindow) {
      currentWindow = window;
      accGroups = new Map();
      hasSentInWindow = false;
      resetTracking();
    }

    for (const [tag, entries] of newEntries) {
      if (!accGroups.has(tag)) accGroups.set(tag, []);
      accGroups.get(tag).push(...entries);
    }

    const msg = buildMessage(accGroups);
    if (!msg) return;

    // If message is too large, freeze old message and start fresh with new entries only
    if (hasSentInWindow && msg.length > NEW_MSG_THRESHOLD) {
      accGroups = new Map(newEntries);
      const freshMsg = buildMessage(accGroups);
      if (freshMsg) sendNew(freshMsg.length > 3950 ? freshMsg.slice(0, 3950) + '\n…' : freshMsg);
      hasSentInWindow = true;
    } else if (hasSentInWindow) {
      editLast(msg);
    } else {
      sendNew(msg);
      hasSentInWindow = true;
    }
  } catch (e) { console.error('[poll]', e.message); }
}

// ── PID file ─────────────────────────────────────
const PID_FILE = path.join(__dirname, '.pid');
fs.writeFileSync(PID_FILE, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// ── Start ────────────────────────────────────────
loadKeys();
setInterval(loadKeys, POLL * 5);  // refresh session keys every 5 poll cycles
poll();
setInterval(poll, POLL);

// startup banner
sendNew('🖥️ <b>Monitor</b> (poll: ' + (POLL/1000) + 's, merge: ' + MERGE_WINDOW + 'min, split: ' + NEW_MSG_THRESHOLD + ')');
