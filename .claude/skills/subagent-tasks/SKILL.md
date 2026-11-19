---
name: subagent-tasks
description: Hand Solar, Chocolate or vanilla work to subagents (Claude Sonnet) to save usage. Use when asked to start, spin up or open an agent/subagent for tasks, when working through a batch of Trello cards, or when a task is self-contained enough to delegate.
---

# Delegating Solar work to subagents

The main session plans, checks results and talks to the owner. Subagents do the reading, editing and testing. This keeps the main conversation small and spends cheaper tokens on the heavy work.

## When to delegate

- A batch of Trello cards: group them by area (site PHP, Chocolate gameplay, Chocolate input/camera/UI, vanilla rendering) and start one agent per group, in parallel, with `run_in_background: true`.
- One self-contained bug or feature the owner asks an agent for.
- Not worth it: one-line fixes, questions you can answer from what you already know, or anything that needs the owner's decision first. Ask the owner, then delegate.

## How to start one

Use the Agent tool with `model: "sonnet"` and `run_in_background: true`. A subagent starts cold, so the prompt must stand alone. Give it:

1. **Where and what:** "Solar, a live Roblox-revival site at /var/www/html (PHP 8.2, MySQL); Chocolate at /var/www/html/chocolate; vanilla at /var/www/html/core/vanilla-rcc." Tell it to read /var/www/html/CLAUDE.md (and chocolate/CLAUDE.md for Chocolate work) first.
2. **The rules that bite:**
   - No comments in any code.
   - Never print secrets, so never cat or sed core/config.php.
   - Don't commit.
   - The DB and /var/www/assets are live: read-only checks only. No test accounts, no purchases, no /api/redraw, no overwriting avatar or render images.
   - Never use `confirm()`.
3. **The task:** the exact card text or bug report, plus everything you already know: suspected files, asset and user IDs, findings, what has been ruled out. Don't make it rediscover what you know.
4. **How to verify:**
   - PHP: `php -l`, and render pages from the CLI read-only.
   - Chocolate: the node tools run as `fone` (`tools/e2e2018.mjs`, `corescripts*.mjs`, `movement.mjs`, `touch.mjs`).
   - Vanilla: render through Arbiter's private `vanillaAvatar`/`vanillaPng` by reflection as www-data, PNGs to /tmp only, viewed with the Read tool.
   - Bump `RENDER_VERSION` for renderer changes.
   - There is no browser on the server; ask the agent to say plainly what it couldn't check.
5. **Restarting Chocolate:**
   - Changes under server/ or shared/ need a restart: check `curl -s http://127.0.0.1:4201/status` has no players.
   - Find the PID with `ps -eo pid,args | awk '$2=="node" && $3 ~ /chocolate\/server\/main.js$/ {print $1}'`. Never `pgrep -f`: it matches the agent's own shell.
   - Then start it again: `su fone -s /bin/sh -c 'cd /var/www/html/chocolate && setsid nohup sh server/start.sh > /tmp/chocolate-server.log 2>&1 < /dev/null &'`.
6. **Trello, when cards are involved:**
   - Give the card IDs and the Completed list ID, and tell it to load the tools with ToolSearch `select:mcp__claude_ai_Trello__trelloWriteCard,mcp__claude_ai_Trello__trelloReadList`.
   - Per card: comment the cause, the fix and how it was verified. If it's done, move it to Completed and mark it done; if not, leave it with what remains.
7. **Other agents running at the same time:** name the files the other agents are editing. Tell it to re-read a file right before editing and keep edits small.
8. **The report you want back:** per task, give the cause, the fix, the files changed, the verification, and what's left.

## Keeping usage down

- In the prompt: "Read only the parts of files you need (grep -n, sed -n ranges), don't dump big outputs, don't re-read files you just edited."
- Never read an agent's output file; its report arrives as a message.
- Don't repeat an agent's work in the main session while it runs, and don't poll it.
- Relay its report to the owner in a short summary; don't paste it.
- Start a fresh agent for a new problem instead of resuming an old one with stale context, unless the follow-up is about its own work.
- Don't spawn an agent to read a few lines you could read yourself.
- After it reports, spot-check only what matters (for example `php -l`, or one render), not the whole job.

## After it reports

- Check its claims that matter, especially anything that touched live data, permissions or secrets.
- Agents can't grant permissions. If one says it was blocked from an action, tell the owner; don't do the action for it.
- Tell the owner: what's done, what's partly done and needs them (a browser check, a config value, a decision), and any side effects (data written, files whose ownership changed, restarts).
- Once the work is pushed (Solar or Chocolate) or saved (vanilla, which has no commits), announce it with `php /var/www/html/tools/announce-update.php`, passing `--vanilla="..."` with a short summary when vanilla changed. Agents don't announce; you do, once.
