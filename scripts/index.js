#!/usr/bin/env node
// session-monitor v12 — clean rewrite
const fs = require('fs');
const path = require('path');
const { pushUpdate, freezeMessage } = require('./sender');
const { DIR, loadKeys, getTag } = require('./sessions');
const { parse } = require('./parser');
const { buildMessage } = require('./formatter');

const POLL = 3000;
const MERGE_WINDOW = 1;
const MAX_MSG_LEN = 3500;

const sizes = new Map();
const sessionMeta = new Map();  // sid → { thinkingLevel }
let currentWindow = null;
let accGroups = new Map();
let hasSentInWindow = false;

function getWindowKey() {
  const d = new Date();
  return `${d.getDate()}h${d.getHours()}s${Math.floor(d.getMinutes() / MERGE_WINDOW)}`;
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
      if (!prev) {
        // First sighting: harvest head for thinking_level_change, then skip history
        try {
          const head = Buffer.alloc(Math.min(size, 4096));
          const fd = fs.openSync(fp, 'r');
          fs.readSync(fd, head, 0, head.length, 0);
          fs.closeSync(fd);
          const sid = path.basename(fp, '.jsonl');
          for (const raw of head.toString('utf8').split('\n')) {
            if (!raw.trim()) continue;
            try {
              const d = JSON.parse(raw);
              if (d.type === 'thinking_level_change' && d.thinkingLevel) {
                sessionMeta.set(sid, { thinkingLevel: d.thinkingLevel });
              }
            } catch {}
          }
        } catch {}
        sizes.set(fp, size);
        continue;
      }
      if (size <= prev) { sizes.set(fp, size); continue; }

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
            const d = JSON.parse(raw);
            if (d.type === 'thinking_level_change' && d.thinkingLevel) {
              sessionMeta.set(sid, { thinkingLevel: d.thinkingLevel });
            }
            const e = parse(d);
            if (e) {
              const meta = sessionMeta.get(sid);
              if (meta && meta.thinkingLevel) e.thinkingLevel = meta.thinkingLevel;
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
      if (hasSentInWindow) freezeMessage();
      currentWindow = window;
      accGroups = new Map();
      hasSentInWindow = false;
    }

    for (const [tag, entries] of newEntries) {
      if (!accGroups.has(tag)) accGroups.set(tag, []);
      accGroups.get(tag).push(...entries);
    }

    const msg = buildMessage(accGroups);
    if (!msg) return;

    if (hasSentInWindow && msg.length > MAX_MSG_LEN) {
      freezeMessage();
      accGroups = new Map();
      hasSentInWindow = false;
      for (const [tag, entries] of newEntries) {
        accGroups.set(tag, [...entries]);
      }
      const freshMsg = buildMessage(accGroups);
      if (freshMsg) {
        pushUpdate(freshMsg, true);
        hasSentInWindow = true;
      }
    } else {
      pushUpdate(msg, !hasSentInWindow);
      hasSentInWindow = true;
    }
  } catch (e) { console.error('[poll]', e.message); }
}

// PID file
const PID_FILE = path.join(__dirname, '.pid');
fs.writeFileSync(PID_FILE, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(PID_FILE); } catch {} });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// Start
loadKeys();
setInterval(loadKeys, POLL * 5);
poll();
setInterval(poll, POLL);
pushUpdate('\u{1F5A5}\uFE0F <b>Monitor v12</b> started', true);
