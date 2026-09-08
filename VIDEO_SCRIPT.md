# 0xWitness — 90 second demo script

Every beat below uses real, already-verified material from this session. Nothing to
fake, nothing to re-run blind — just record it.

Suggested tools: OBS / QuickTime screen recording + your own voice. If you'd rather not
talk on camera, use the on-screen caption text as subtitles instead (marked below) and
skip narration entirely — the visuals carry it.

---

## Shot 1 — Hook (0:00–0:08)

**Screen:** `0xwitness.vercel.app`, hero section, headline visible.

**Say:**
> "Every AI trading agent asks you to trust it. This one hands you the evidence instead."

**Caption alt:** *"Don't trust the screenshot. Replay the trade."*

Let the word-reveal animation play out — don't skip it, it's a nice two seconds.

---

## Shot 2 — The problem, fast (0:08–0:18)

**Screen:** Scroll to the "01 / 02 / 03" steps section.

**Say:**
> "When an agent loses your money, you get a P&L number and a vibe. No way to check what it actually saw, or why it acted. This fixes that."

Point (cursor or just let it sit on screen) at the three steps: Freeze the moment → Check it against the rules → Seal the record.

---

## Shot 3 — Real live trade, real block (0:18–0:40)

**Screen:** Terminal, full-screen or large.

**Type:**
```bash
npm run run -- --live
```

**What appears (real, already captured this session):**
```
receipt #0  bc12ef91e94f936c
  model     offline-momentum-v1
  proposal  SELL SOLUSDT $100 @ 1x
  reasoning 12h momentum on SOLUSDT is -1.65%, the strongest in the allowed set
  PASS  symbol-allowed
  PASS  notional-cap
  PASS  leverage-cap
  FAIL  position-pct       n/a% vs cap 25%
  PASS  open-positions
  PASS  losing-streak
  verdict   BLOCK
  outcome   blocked: position-pct
```

**Say:**
> "That's real. Real Binance Agent OS, real SOLUSDT price data, real decision. And it just got blocked — the sub-account has zero equity, so the policy engine refused the trade instead of guessing. That's the safety story actually working, not a demo of it working."

This is your strongest 20 seconds. Don't rush the "verdict BLOCK" line — let it sit on screen for a beat.

---

## Shot 4 — Tamper it, in the terminal (0:40–0:58)

**Type, in sequence, letting each result show:**
```bash
npm run verify
```
`→ VALID  hash=ok sig=ok chain=ok`

```bash
npm run tamper -- --seq 0
```
`→ tampered receipt #0: ... last close ... -> ...`

```bash
npm run verify
```
`→ INVALID  hash=bad sig=ok chain=ok`

**Say:**
> "One line of the sealed record changes — and it's caught. Not because I said so. Because the hash doesn't match anymore."

---

## Shot 5 — The same thing, in a browser, zero install (0:58–1:18)

**Screen:** Navigate to `0xwitness.vercel.app/verify.html`. It loads already verified — VALID / VALID, real live receipt.

**Say:**
> "You don't even need to clone anything. This runs the identical check — hash, signature, the whole decision — right in your browser."

**Click "Tamper with it" on screen.** Watch Content hash flip to INVALID live, decision box show "DIVERGED."

**Say:**
> "Same proof, zero setup. Break it yourself, right now, from this link."

This is the moment to linger on — it's the most shareable 10 seconds you have.

---

## Shot 6 — Close (1:18–1:30)

**Screen:** Back to the site, scroll to "What this doesn't claim" (docs.html) or just hold on the GitHub link / repo README.

**Say:**
> "0xWitness. Signed receipts for AI trading agents on Binance Agent OS. Link's below."

**On-screen end card:**
```
0xWitness
github.com/IamHarrie-Labs/0xwitness
0xwitness.vercel.app
```

---

## If you're recording solo and don't want to narrate live

Record the six screens silently in order, then add text captions instead of voice —
use the **Say** lines above verbatim as on-screen text, one per shot, fading in/out.
Keep each caption under 3 seconds on screen at a time; two sentences max per beat.

## Timing safety margin

This adds up to ~90s exactly if you don't pause. Realistically expect 100–110s once
you're actually clicking things — that's fine, most hackathon video caps are 2–3
minutes. Don't pad it artificially if you finish early; a tight 75-second cut that
ends on Shot 5 is stronger than a padded 3-minute one.

## Before you hit record

- [ ] `npm run run -- --live` actually connects (token still valid, sub-account still reachable)
- [ ] `0xwitness.vercel.app/verify.html` loads and shows VALID/VALID on first paint
- [ ] Terminal font size large enough to read on a phone screen
- [ ] Close any other tabs/notifications before screen-recording
