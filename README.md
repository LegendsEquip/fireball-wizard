# Fireball Wizard

A third-person 3D browser game. You are a wizard with one spell, Fire Ball, fighting your way out of a cave system. Bigger fireballs kill faster, but your own blasts can burn you.

This is **step 1** of the level 1 build: one test cave with goblin waves, to try out movement, aiming and the fireball.

## How to play

| Control | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Aim |
| Click (hold to keep casting) | Fire Ball |
| `Space` | Great Fireball (8 s cooldown) |
| `Esc` | Pause |

Goblins come out of the three tunnel mouths in waves. Each wave is bigger and a little faster. Explosions hurt everything inside the blast, you included, so don't fire at goblins that are right on top of you.

## What's in step 1

- The Mossfang test cave: a domed cavern with rock pillars, moss, crystals and torches
- Wizard movement and an over-the-shoulder camera that pulls in near walls
- Fire Ball (0.6 s cooldown) and Great Fireball (8 s cooldown), each with a blast radius
- Self-damage from your own explosions
- Goblins with 25% fire resistance that chase, wind up and jab
- Lighting from the fireballs themselves, bloom, sparks, smoke and scorch marks
- Synthesized sound effects (no audio files)

Next steps, from the design doc: bounces and burning moss, the boon choices, the cave network with an exit, the full enemy roster, then pets, gold and permanent upgrades.

## Running it

Everything is static: open `index.html` through any web server, for example:

```
npx http-server . -p 8080
```

Three.js 0.160 loads from the jsDelivr CDN, so an internet connection is needed. The game is hosted with GitHub Pages from the `main` branch.

## Code layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, game loop, input, waves, HUD and screens |
| `src/world.js` | Builds the cave and handles collision with rock |
| `src/wizard.js` | Wizard model, movement and the chase camera |
| `src/goblin.js` | Goblin model and behavior |
| `src/fireball.js` | Fireball stats, flight, explosions and damage |
| `src/particles.js` | Pooled fire and smoke particles |
| `src/lights.js` | A fixed pool of point lights reused by fireballs and blasts |
| `src/audio.js` | Synthesized sound effects |
| `src/noise.js` | Value noise for rock and floor shapes |
