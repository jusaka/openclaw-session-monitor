// sessions.js — Session key lookup and tag formatting
const fs = require('fs');
const path = require('path');
const { SESSIONS_DIR, DIRECT_NAMES, GROUP_NAMES } = require('./config');

const DIR = SESSIONS_DIR;
const TAG_MAX = 40;

// Derive agent ID from SESSIONS_DIR path (e.g. .../agents/jixiaolan/sessions → jixiaolan)
const AGENT_ID = (() => {
  const m = SESSIONS_DIR.match(/agents\/([^/]+)\/sessions/);
  return m ? m[1] : 'main';
})();

// ── Channel icons ────────────────────────────────
// Add more channels as needed (discord: '💬', slack: '📱', etc.)
const CHANNEL_ICONS = {
  telegram: '✈',
  // discord: '💬',
  // slack: '📱',
  // whatsapp: '📲',
  // signal: '🔒',
};

// ── Internal state ──────────────────────────────

let keyMap = {};      // sessionId → session key
let labelMap = {};    // subagent UUID prefix → label (from sessions.json)
let derivedMap = {};  // sessionId → derived name (from JSONL, cached)

function loadKeys() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, 'sessions.json'), 'utf8'));
    keyMap = {};
    labelMap = {};
    for (const [key, s] of Object.entries(data)) {
      const id = s.sessionId || s.id;
      if (!id) continue;
      keyMap[id] = key;
      if (s.label) {
        const m = key.match(/subagent:([0-9a-f]{8})/);
        if (m) labelMap[m[1]] = s.label;
      }
    }
  } catch {}
}

// ── Subagent name resolution ────────────────────
// Priority: sessions.json label → JSONL content → short UUID.
// Override getSubagentName() to customize name extraction.

function getSubagentName(sid, key) {
  const m = key.match(/subagent:([0-9a-f]{8})/);
  const uuid = m ? m[1] : null;

  // 1. label from sessions.json
  if (uuid && labelMap[uuid]) {
    return labelMap[uuid];
  }

  // 2. derived from JSONL file content (cached)
  if (derivedMap[sid]) return derivedMap[sid];
  try {
    const fp = path.join(DIR, sid + '.jsonl');
    const fd = fs.openSync(fp, 'r');
    const buf = Buffer.alloc(4000);
    const bytesRead = fs.readSync(fd, buf, 0, 4000, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8', 0, bytesRead);
    const pm = head.match(/\/prompts\/(.+?)\.txt/);
    if (pm) { derivedMap[sid] = pm[1]; return pm[1]; }
  } catch {}

  // 3. fallback: short UUID
  return uuid || sid.slice(0, 8);
}

// ── Tag formatting ──────────────────────────────
//
// External (channel sessions):
//   ✈ Agent↔Alice        direct chat
//   ✈ My Group            group chat
//
// Internal (agent sessions):
//   👶∙task-name∙abcdef01  subagent
//   main                    main CLI
//   main∙💓                 heartbeat

function getTag(sid) {
  let key = keyMap[sid] || sid;

  // strip agent:<id>: prefix
  key = key.replace(/^agent:/, '').replace(new RegExp('^' + AGENT_ID + ':'), '');

  // ── External channels ──
  for (const [channel, icon] of Object.entries(CHANNEL_ICONS)) {
    if (!key.startsWith(channel + ':')) continue;
    const rest = key.slice(channel.length + 1);

    for (const [pattern, name] of Object.entries(DIRECT_NAMES)) {
      if (rest.startsWith(pattern)) {
        const suffix = rest.slice(pattern.length);
        const extra = suffix.replace(/:/g, '∙').replace(/\bheartbeat\b/g, '💓');
        return extra ? `${icon} ${name}${extra}` : `${icon} ${name}`;
      }
    }

    for (const [pattern, name] of Object.entries(GROUP_NAMES)) {
      if (rest.startsWith(pattern)) {
        const suffix = rest.slice(pattern.length);
        const extra = suffix.replace(/:/g, '∙').replace(/\bheartbeat\b/g, '💓');
        return extra ? `${icon} ${name}${extra}` : `${icon} ${name}`;
      }
    }

    let tag = `${icon} ${rest}`;
    tag = tag.replace(/\bheartbeat\b/g, '💓');
    tag = tag.replace(/\b([0-9a-f]{6,})-[0-9a-f-]+\b/g, '$1');
    tag = tag.replace(/:/g, '∙');
    return tag.length > TAG_MAX ? tag.slice(0, TAG_MAX) : tag;
  }

  // ── Internal: subagent ──
  if (/\bsubagent\b/.test(key)) {
    const m = key.match(/subagent:([0-9a-f]{8})/);
    const uuid = m ? m[1] : sid.slice(0, 8);
    const name = getSubagentName(sid, key);
    const hasHb = /heartbeat/.test(key.split('subagent:')[1] || '');
    const base = name !== uuid ? `👶∙${name}∙${uuid}` : `👶∙${uuid}`;
    return hasHb ? `${base}∙💓` : base;
  }

  // ── Internal: other ──
  key = key.replace(/\bheartbeat\b/g, '💓');
  key = key.replace(/\b([0-9a-f]{6,})-[0-9a-f-]+\b/g, '$1');
  key = key.replace(/:+$/g, '').replace(/^:+/g, '');
  key = key.replace(/:/g, '∙');
  return key.length > TAG_MAX ? key.slice(0, TAG_MAX) : key;
}

module.exports = { DIR, loadKeys, getTag };
