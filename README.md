# Fireball Wizard

A third-person 3D browser game. You are a wizard with one spell, Fire Ball, fighting your way out of a cave system. Bigger fireballs kill faster, but your own blasts can burn you.

This build is **level 1, first pass**: the Mossfang Caves, a network of rooms and tunnels to explore, with goblins waiting in the rooms and a way out at the far end.

## How to play

| Control | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Aim |
| Automatic | Fire Ball casts on its own at a goblin you are facing (within about 20° of the crosshair) |
| Click (hold) | Cast Fire Ball by hand at the crosshair |
| `Space` | Great Fireball (8 s cooldown) |
| `M` | Map |
| `Esc` | Pause |

Find the glowing ring in **The Way Out** to clear the level. Goblins stand around in their rooms until they see you, then call their friends. Explosions hurt everything inside the blast, you included, so be careful when goblins are right on top of you.

**Boons.** Kills give XP (25 per goblin, 200 for the chief). When the bar at the bottom fills, the game pauses and offers three boons; pick one with a click or `1` `2` `3`. The same boon can be picked again: the first pick gives the full effect and each repeat adds a smaller step (Wide Blast is +30%, then +10% per repeat). Each boon after that needs 40 more XP than the last.

**Pets.** Four pets wait in cages: Fairies in the Mossy Cavern, the Ember Drake in the Goblin Camp, the Cave Cat in the Narrow Cut and the Shell Turtle in Echo Hall. Blast a cage with a fireball (click to cast by hand) to free the pet. You keep one pet at a time; freeing another sends the first home. Pets leave when the run ends.

| Pet | What it does |
| --- | --- |
| Fairies | Light up the caves around you and reveal more of the map |
| Ember Drake | Shoots small fireballs at goblins; its fire never hurts you |
| Cave Cat | +20% move speed, and pounces on goblins that get close |
| Shell Turtle | A magic shield that soaks 20 damage and recharges after 8 s without a hit |

The map fills in as you see new areas. The small map in the corner turns with you; press `M` for the full map, with room names, the treasure and the way out once you have seen them.

## What's in this build

- Nine rooms joined by winding tunnels, with a treasure vault off to the side and a goblin chief in Warden's Hall
- Wizard movement and an over-the-shoulder camera that pulls in near walls
- Fire Ball (0.6 s cooldown, casts automatically) and Great Fireball (8 s cooldown), each with a blast radius
- Self-damage from your own explosions
- Goblins with 25% fire resistance that notice you, chase, wind up and jab
- An XP bar and 14 stacking boons: Bigger Fireball, Hotter Flame, Swift Cast, Quick Flight, Twin Flame, Wide Blast, Ricochet, Piercing, Lingering Burn, Seeker, Overcharge, Fire Ward, Shrink, Fleet Foot
- Four pets in cages
- A treasure chest (+500 score, +40 HP) and an exit bonus
- A minimap and full map that reveal what you have seen
- Lighting from the fireballs themselves, torches and crystals, bloom, sparks, smoke and scorch marks
- Synthesized sound effects (no audio files)

The room layout is fixed for now; the design calls for shuffling it each attempt. Still to come: burning moss, crawlspaces for a shrunken wizard, the full enemy roster, then gold and permanent upgrades.

## Running it

Everything is static: open `index.html` through any web server, for example:

```
npx http-server . -p 8080
```

Three.js 0.160 loads from the jsDelivr CDN, so an internet connection is needed. The game is hosted with GitHub Pages from the `main` branch.

## Code layout

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, game loop, input, auto-cast, HUD and screens |
| `src/world.js` | Room layout, cave meshes, collision and line of sight |
| `src/map.js` | Minimap and full map with fog of war |
| `src/wizard.js` | Wizard model, movement and the chase camera |
| `src/goblin.js` | Goblin model and behavior |
| `src/fireball.js` | Fireball stats, flight (bounce, pierce, seek), explosions and damage |
| `src/boons.js` | The boons, their stacking rules and the XP curve |
| `src/pets.js` | Cages, pet models and what each pet does |
| `src/particles.js` | Pooled fire and smoke particles |
| `src/lights.js` | A fixed pool of point lights reused by fireballs and blasts |
| `src/audio.js` | Synthesized sound effects |
| `src/noise.js` | Value noise for rock and floor shapes |
