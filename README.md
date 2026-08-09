# Honeymoon Bridge

A two-player contract bridge variant, built to play with family on a phone.

Live at **[honeymoon-bridge.ericonice.com](https://honeymoon-bridge.ericonice.com)** — play the
computer on your own, or send an invite link and play a person on another device.

## The game

This is a house variant, not the classic draw or semi-exposed honeymoon bridge. Its distinguishing
feature is how the hands are built.

Both players start with nothing and take turns drawing from a single face-down stock. A turn spends
two cards and yields one: you look at the first card and commit — **before seeing the second** —
either to keep it, in which case the second is drawn, looked at, and thrown away; or to reject it,
in which case it is thrown away and you take the second sight-unseen. Thirteen turns each exhausts
the deck exactly, and half of it never enters play.

So each player has seen 26 cards and holds 13, the 26 they have not seen are split between the
opponent's hand and the opponent's discards in unknown proportion, and there is no record anywhere
of what you threw away. Remembering is meant to be part of the game.

From there it is bridge: a full auction, no partner and therefore no conventions, 13 tricks with
both hands concealed, and rubber scoring. One pass closes the auction rather than three — the
three-pass rule is a four-player artifact.

The rules in full, and the reasoning behind the ones that surprise people, are in
[`REQUIREMENTS.md`](REQUIREMENTS.md).

## Running it

Node 20 or newer, and npm workspaces — not pnpm.

```bash
npm install          # from the repo root

npm test             # all workspaces
npm run typecheck    # tsc --noEmit, all workspaces

npm run dev     --workspace @hb/web      # the app, on localhost
npm run dev:lan --workspace @hb/web      # also on the LAN, for testing on a phone
npm run dev     --workspace @hb/server   # the Worker, for networked play
```

`npm run deploy --workspace @hb/web` publishes to Cloudflare Pages, and the same in
`@hb/server` publishes the Worker.

## Layout

| | |
|---|---|
| `packages/engine/` | The rules, headless. No UI, no I/O, no network. |
| `packages/protocol/` | What crosses the wire, and the tests that it is only that. |
| `apps/web/` | Vite + React PWA. |
| `apps/web/src/bot/` | The computer opponent and the double-dummy solver it plays with. |
| `apps/web/bench/` | How the bot is measured. Not tests — slow, and they print numbers rather than pass. |
| `apps/server/` | Cloudflare Worker, one Durable Object per table. |

The rules exist exactly once and run in two places: in the browser for the game against the
computer, and on the server as the authority for network play. That is why the stack is TypeScript
end to end, and it is the one architectural commitment everything else follows from.

## The documents

Three, with different jobs, and it is worth knowing which is which before changing anything.

- **[`REQUIREMENTS.md`](REQUIREMENTS.md)** is the source of truth for the rules and the product
  decisions. It records why as well as what, and several decisions are deliberate and
  counter-intuitive. If a change contradicts it, either the change is wrong or the document needs
  updating first.
- **[`CLAUDE.md`](CLAUDE.md)** is the working guide: architecture, conventions, where the hidden
  information boundary is, and a long running account of what has been measured about the bot and
  what turned out to be wrong the first time.
- This file is the front door, and deliberately stays short enough not to drift out of date.
