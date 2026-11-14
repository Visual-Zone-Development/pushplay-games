# physics-feel in a PushPlay game

The general `physics-feel` skill covers fixed-timestep integration, collision detection and response, bounce, friction, knockback and vehicles. This page gives the PushPlay side. AGENTS.md *Tech* is the rule.

## Debug hooks and the check

- Check determinism with a repro script (see [debugging.md](../debugging.md)): the same seed and inputs give the same result.

## Physics libraries

- For stacking, ragdolls, joints or many interacting bodies, use a physics library in a `--vite` game: `npm install <pkg>`, e.g. a small 2D engine such as planck.js or matter-js, or Rapier / cannon-es for 3D. Keep its timestep fixed, and keep its debug draw behind `?debug`.
