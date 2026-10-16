---
name: debug-game
description: Find and fix a bug in a game in games/. Use for crashes, a failing `npm run check`, blank or black screens, controls not responding, broken saves, stutter or low FPS, or anything that "doesn't work". For new features or tuning use improve-game.
---

# Debug game

Follow AGENTS.md. Reference: [debugging.md](../../../docs/game-design/debugging.md), which has the common failures table, the debug overlay and test hooks, and the repro script.

1. **Reproduce first.**
   - Run `npm run check <id>` and read every ✗ and ⚠. Crashes, console errors, 404s, network requests and dialogs are all reported. Open the screenshot.
   - The check only plays for 3 seconds, tapping A once. If the bug happens later or needs specific inputs, copy the **repro script** from debugging.md into your scratch or temp directory, never the game folder. Set its input timeline to the user's steps, run it, read the console and **look at its screenshots**. Use `?debug`, `?seed=` and `window.__game` to reach the state quickly. If the game lacks those hooks, add them; they're part of the definition of done anyway.
   - If you can't reproduce it, ask the user one focused question: what they pressed, what they saw, controller or keyboard, on the Deck or in a browser.
2. **Narrow down.** Check the common failures table first. Then form one hypothesis at a time and confirm it with a trace (`console.error`, the overlay or `page.evaluate`) before changing code. Read the surrounding code; don't guess.
3. **Fix the root cause.** Keep it minimal and in the existing style. Don't rewrite systems or tune unrelated things while you're in there. If the real fix is a redesign, say so and hand off to `improve-game`.
4. **Verify.**
   - Re-run the repro script (the bug is gone and nothing new crashes) and `npm run check <id>`.
   - Remove temporary traces. Keep the debug overlay, since it's off by default.
   - Where it's cheap, add a guard so this class of bug fails safely, e.g. try/catch around `JSON.parse` of saves, or clamping `dt`.
5. **Record it.**
   - Bump the patch `version` in `pushplay.json`.
   - Add a Changelog line to DESIGN.md, if the game has one (`Fixed: …`).
   - Commit (`<Name>: fix <bug>`) and push.
6. **Explain** to the user in two or three sentences: what was wrong, why, and what changed. Mention anything they should re-test on the Deck.
