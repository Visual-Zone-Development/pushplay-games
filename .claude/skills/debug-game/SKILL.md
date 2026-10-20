---
name: debug-game
description: Find and fix a bug in a game in games/. Use for crashes, a failing `npm run check`, blank or black screens, controls not responding, broken saves, stutter or low FPS, or anything that "doesn't work". For new features or tuning use improve-game.
---

# Debug game

Follow AGENTS.md. Reference: [debugging.md](../../../docs/game-design/debugging.md), which has the common failures table, the debug overlay and test hooks, and the repro script.

1. **Reproduce first.**
   - Run `npm run check <id>` and read every ✗ and ⚠. Crashes, console errors, 404s, network requests (including WebSockets), dialogs and blank screens are reported, and so are its input passes: gamepad, keyboard-only (Enter, then Esc must pause), touch (tap on the title menu), Start → `window.__game.state.screen === 'paused'`, and a 1920×1080 render at DPR 2. Each failing pass names the input it used; reproduce with that input first. Static findings (F10 bound, save key without the game id prefix, missing `tags`; warnings for `menu.js` not imported or `input.attach` missing) are code fixes, not play bugs.
   - The play passes are short (a few seconds, A once, a stick nudge, then Start). If the bug happens later or needs specific inputs, copy the **repro script** from debugging.md into your scratch or temp directory, never the game folder. Set its input timeline to the user's steps, run it, read the console and **look at its screenshots**. Use `?debug`, `?seed=` and `window.__game` (`state.screen`, `TUNING`) to reach the state quickly. If the game lacks those hooks, add them; they're part of the definition of done anyway.
   - "Pauses by itself" or "won't unpause" is usually `input.onPause` (it fires on blur, hidden tab, launcher overlay and when every pad disconnects) or `input.paused` not being cleared on Resume; "Esc quits my run" means `b` was treated as pause or `menu` as back.
   - If you can't reproduce it, ask the user one focused question: what they pressed, what they saw, which input (controller, keyboard, mouse, touch), on the Deck / Legion Go or in a browser, and at what window size.
2. **Narrow down.** Check the common failures table first. Then form one hypothesis at a time and confirm it with a trace (`console.error`, the overlay or `page.evaluate`) before changing code. Read the surrounding code; don't guess.
3. **Fix the root cause.** Keep it minimal and in the existing style. Don't rewrite systems or tune unrelated things while you're in there. Never patch a runtime file (`input.js`, `menu.js`, `fit.js`, `audio.js`, `save.js`, `settings.js`, `prompts.js`): if the bug is really in one, say so; the fix belongs in the kit. If the real fix is a redesign, say so and hand off to `improve-game`.
4. **Verify.**
   - Re-run the repro script (the bug is gone and nothing new crashes) and `npm run check <id>`, and redo the AGENTS.md **Verification** pass for the input the bug was reported on.
   - Remove temporary traces. Keep the debug overlay, since it's off by default.
   - Where it's cheap, add a guard so this class of bug fails safely, e.g. try/catch around `JSON.parse` of saves, or clamping `dt`.
5. **Record it.**
   - Bump the patch `version` in `pushplay.json`.
   - Add a Changelog line to DESIGN.md, if the game has one (`Fixed: …`).
   - Commit (`<Name>: fix <bug>`) and push.
6. **Explain** to the user in two or three sentences: what was wrong, why, and what changed. Mention anything they should re-test on the Deck or Legion Go.
