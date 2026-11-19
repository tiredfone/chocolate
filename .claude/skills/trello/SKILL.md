---
name: trello
description: Read and update the Solar plan on Trello (the "Solar" board with Website, Client/Renderer and Completed lists). Use when asked what to work on next, to pick up a Trello card, to add a task, or after finishing a task that came from Trello.
---

# Solar on Trello

The plan lives on one Trello board through the Trello connector (`mcp__claude_ai_Trello__*` tools; load them with ToolSearch `trello` if they are not listed yet).

- Board: **Solar**, `https://trello.com/b/dhyGRqIM/solar`
  - ARI `ari:cloud:trello::board/workspace/6afa56af680884c6aa5141d0/6afa573b810cf7b392238dfb`

The user calls the lists "boards". Each list is a work area:

| List | What goes there | List ARI |
| --- | --- | --- |
| Website | Solar site work in `/var/www/html` (PHP, pages, APIs, catalog, admin) | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afa573b810cf7b392238e1c` |
| Client/Renderer | Chocolate (`/var/www/html/chocolate`) and vanilla (`/var/www/html/core/vanilla-rcc`) | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afa573b810cf7b392238e1d` |
| Studio | Chocolate's browser Studio (`/var/www/html/chocolate/studio`) and its plugins | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afe1f8c21a8c96713e6f8e2` |
| Completed | Finished cards | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afa5772218ccb7c28a38b99` |
| Suggestion Board | Ideas from players or staff. Not planned work: don't start them unless the user asks | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afa573b810cf7b392238e1b` |
| On-Hold or Denied | Paused or rejected. Never work these | `ari:cloud:trello::list/workspace/6afa56af680884c6aa5141d0/6afa5ac29bc2f613d47f136a` |

If an ARI stops working (list renamed or recreated), list the board again with `trelloReadList` `list_by_board` and update this file.

## Card name suffixes

Only the Website, Client/Renderer and Studio lists are the to-do lists. The user adds cards while you work, so list them again after finishing a card instead of relying on an earlier read.

Client/Renderer cards end with the target:

- `- 2018`: chocolate's 2018 client (`chocolate/client`, `chocolate/shared`, `chocolate/server`).
- `- 2012`: chocolate's 2012 client.
- `- 2012, 2018`: both.
- `- Vanilla`: the PHP renderer in `core/vanilla-rcc`.

Website and Studio cards have no suffix. A Website card and a Client/Renderer card with the same name (for example "Add Gamepasses & DevProducts") are two halves of one feature: the site side and the in-game side.

## Reading the plan

```
trelloReadCard action=list_by_board boardIdOrUrl=<board ARI> limit=50
```

returns every open card grouped by list. Use `trelloReadCard action=get` on a card for its description, checklists and comments before starting it; those hold details the title leaves out.

## Working a card

1. Read the card (`get`) and its comments.
2. Do the work following the CLAUDE.md of the folder you are in. Lint and verify as that file says.
3. When the task is done and verified, finish the card:
   - `trelloWriteCard action=add_comment` with a short summary: what changed, the main files, and anything left for the user (restart needed, follow-up, manual check).
   - `trelloWriteCard action=move` with `listId` = Completed ARI and `pos="top"`.
   - `trelloWriteCard action=mark_done`.
4. If you only finished part of a card, leave it in its list and comment what is done and what remains. Do not move it to Completed.
4a. The owner wants a card moved to Completed and marked done as soon as a fix is implemented, even if it couldn't be checked in a browser; say what's untested in the comment.
5. If a card needs something only the user can give (a decision, a secret, access), comment the question on the card and tell the user; move on to another card.

## Adding cards

Create new tasks found while working (bugs, follow-ups) with `trelloWriteCard action=create` in the matching list, using the same suffix style. Do not create cards for work you finish in the same session; just mention it in the finishing comment.

## Rules

- Do not archive or delete cards, and do not rename the user's cards, unless asked.
- Never put secrets, `core/config.php` values, tokens or private hostnames in card text or comments.
- Report Trello timestamps in the user's timezone (`trelloReadMember get_me` gives `prefs.timezone`).
