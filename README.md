# 🖥️ OpenClaw Session Monitor

> Real-time agent session monitor for [OpenClaw](https://github.com/openclaw/openclaw) — watch your AI agents work, live in Telegram.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)

## What It Does

Polls your OpenClaw agent's JSONL session transcripts and pushes **live, formatted updates** to a Telegram chat. See every tool call, user message, and agent response as it happens — across all sessions simultaneously.

### Features

- 📡 **Real-time monitoring** — polls every 20s, pushes to Telegram instantly
- 🔄 **Smart message merging** — edits existing messages within time windows to avoid spam
- 🏷️ **Session tagging** — auto-labels direct chats, groups, subagents, heartbeats
- 🚀 **Subagent tracking** — resolves spawn labels and shows subagent activity
- 🧩 **Zero dependencies** — pure Node.js standard library, no `npm install` needed
- 📦 **AgentSkill compatible** — drop into any OpenClaw workspace as a skill

### Live Output Example

```
┌─────────────────────────────────────┐
│ main∙💓                             │
│ ⚡ │ 💓 heartbeat ping              │
│ 🤖 │ exec check-status --all       │
│ ↩️ │ 「3 workers active」           │
│ 🤖 │ All good. HEARTBEAT_OK 💤     │
├─────────────────────────────────────┤
│ 👶∙data-scraper∙abcdef01           │
│ 🤖 │ spawn🚀 Scrape page batch... │
│ ↩️ │ 「run」                        │
│ 🤖 │ exec python3 scrape.py        │
│ ↩️ │ 「✅」                         │
├─────────────────────────────────────┤
│ ✈ Agent↔Alice                      │
│ 👤 │ what's the status?            │
│ 🤖 │ Everything is running fine!   │
└─────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/jusaka/openclaw-session-monitor.git
cd openclaw-session-monitor

# 2. Configure
cp scripts/.env.example scripts/.env
# Edit scripts/.env — see Configuration below

# 3. Test (dry-run, prints to stdout)
node scripts/test.js

# 4. Run
nohup node scripts/index.js > scripts/monitor.log 2>&1 &
```

## Configuration

Edit `scripts/.env`:

```env
# Telegram bot token (create one via @BotFather)
BOT_TOKEN=your_bot_token_here

# Chat ID to push updates to (group or DM)
CHAT_ID=your_chat_id_here

# Display name of the agent being monitored
AGENT_NAME=Agent

# Session directory (default: ~/.openclaw/agents/main/sessions)
# SESSIONS_DIR=/path/to/sessions

# Map user IDs to display names (comma-separated)
# Shows as: ✈ Agent↔Alice
DIRECT_USERS=123456789:Alice,987654321:Bob

# Map group IDs to display names (comma-separated)
# Shows as: ✈ Dev Chat
GROUPS=-100123456789:Dev Chat,-100987654321:Ops Room
```

## Install as AgentSkill

Copy to your OpenClaw workspace skills directory:

```bash
cp -r openclaw-session-monitor ~/.openclaw/workspace/skills/session-monitor
```

Your agent can then manage the monitor via the skill instructions in `SKILL.md`.

## Process Management

```bash
# Check status
SKILL_DIR=/path/to/session-monitor
cat "$SKILL_DIR/scripts/.pid" && ps -p $(cat "$SKILL_DIR/scripts/.pid") -o pid,command

# Stop
kill $(cat scripts/.pid)

# View logs
tail -f scripts/monitor.log
```

## Message Format

| Icon | Meaning |
|------|---------|
| 🤖 | Agent response or tool call |
| 👤 | User message |
| ⚡ | System message (heartbeat, context injection) |
| ↩️ | Tool result |
| 👶 | Subagent |
| ✈ | External chat (Telegram) |

Tool calls are formatted as: **`tool`** **`target`** *`args`*

See [`references/REFERENCE.md`](references/REFERENCE.md) for the full format specification.

## Tuning

Edit `scripts/index.js`:

| Constant | Default | Description |
|----------|---------|-------------|
| `POLL` | `20000` | Poll interval in ms |
| `MERGE_WINDOW` | `3` | Minutes to merge updates into one message |

## Requirements

- Node.js 18+
- A Telegram bot token ([create one](https://t.me/BotFather))
- OpenClaw agent with JSONL session transcripts

## License

[MIT](LICENSE)

---

Built for the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem 🦞
