# performance-pass in a PushPlay game

The general `performance-pass` skill covers measuring and fixing frame rate, stutter, load time and memory. This page gives the PushPlay side: the target and where to measure. AGENTS.md *Performance* and *Screens and scaling* are the rules.

## Screen and scaling

- The target is a steady 60 fps on a Steam Deck and a Legion Go at DPR 2.
- Fill cost at DPR 2: use fewer full-screen layers and alpha overlays. `fitCanvas` already caps DPR at 2.

## Debug hooks and the check

- Reach the worst case with `window.__game.jumpTo(...)`, or by raising spawn counts in `TUNING`.
- Measure headlessly with a repro script (see [debugging.md](../debugging.md)) at **1280×800 DPR 1** and **1280×800 DPR 2** (the Legion Go case). Record the worst 1 s average and the worst single frame.
- A performance pass is a patch `version` bump; put the numbers in the Changelog line.
