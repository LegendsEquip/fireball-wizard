// In-level boons. The first pick of a boon gives its full effect; each
// repeat adds a smaller step. `stack(first, each, n)` is that rule.
const stack = (first, each, n) => (n > 0 ? first + each * (n - 1) : 0);
const pct = (x) => `${Math.round(x * 100)}%`;

export const BOONS = [
  {
    id: 'bigger', name: 'Bigger Fireball', kind: 'Fireball',
    effect: (n) => `Fireballs ${pct(stack(0.25, 0.1, n))} bigger`,
    trade: (n) => `Your own blasts hurt ${pct(stack(0.15, 0.08, n))} more`,
    apply: (b, n) => { b.size += stack(0.25, 0.1, n); b.self += stack(0.15, 0.08, n); },
  },
  {
    id: 'hotter', name: 'Hotter Flame', kind: 'Fireball',
    effect: (n) => `+${pct(stack(0.2, 0.1, n))} damage`,
    trade: (n) => `+${pct(stack(0.1, 0.05, n))} cooldown`,
    apply: (b, n) => { b.dmg += stack(0.2, 0.1, n); b.cd += stack(0.1, 0.05, n); },
  },
  {
    id: 'swift', name: 'Swift Cast', kind: 'Fireball',
    effect: (n) => `−${pct(stack(0.15, 0.07, n))} cooldown`,
    trade: () => null,
    apply: (b, n) => { b.cd -= stack(0.15, 0.07, n); },
  },
  {
    id: 'quick', name: 'Quick Flight', kind: 'Fireball',
    effect: (n) => `Fireballs fly ${pct(stack(0.25, 0.1, n))} faster`,
    trade: () => null,
    apply: (b, n) => { b.speed += stack(0.25, 0.1, n); },
  },
  {
    id: 'twin', name: 'Twin Flame', kind: 'Fireball',
    effect: (n) => `${n + 1} fireballs per cast, fanned out`,
    trade: (n) => `Each does ${pct(Math.pow(0.85, n))} damage`,
    apply: (b, n) => { b.count += n; b.dmgEach *= Math.pow(0.85, n); },
  },
  {
    id: 'wide', name: 'Wide Blast', kind: 'Fireball',
    effect: (n) => `Blast radius +${pct(stack(0.3, 0.1, n))}`,
    trade: () => 'Blasts reach you more often',
    apply: (b, n) => { b.blast += stack(0.3, 0.1, n); },
  },
  {
    id: 'ricochet', name: 'Ricochet', kind: 'Fireball',
    effect: (n) => `Fireballs bounce off rock ${n} time${n > 1 ? 's' : ''}`,
    trade: () => 'A bounce can come back at you',
    apply: (b, n) => { b.bounces += n; },
  },
  {
    id: 'pierce', name: 'Piercing', kind: 'Fireball',
    effect: (n) => `Passes through ${n} enem${n > 1 ? 'ies' : 'y'}`,
    trade: (n) => `−${pct(stack(0.1, 0.05, n))} damage`,
    apply: (b, n) => { b.pierce += n; b.dmg -= stack(0.1, 0.05, n); },
  },
  {
    id: 'burn', name: 'Lingering Burn', kind: 'Fireball',
    effect: (n) => `Targets burn for ${stack(6, 3, n)} damage a second for 3 s`,
    trade: () => null,
    apply: (b, n) => { b.burn += stack(6, 3, n); },
  },
  {
    id: 'seeker', name: 'Seeker', kind: 'Fireball',
    effect: (n) => (n > 1 ? `Fireballs curve harder toward targets` : 'Fireballs curve toward targets'),
    trade: (n) => (n === 1 ? '−10% fireball speed' : null),
    apply: (b, n) => { b.seek += n; if (n > 0) b.speed -= 0.1; },
  },
  {
    id: 'overcharge', name: 'Overcharge', kind: 'Fireball',
    effect: (n) => `+${pct(stack(0.5, 0.2, n))} damage and size`,
    trade: (n) => `+${pct(stack(0.4, 0.15, n))} cooldown, own blasts hurt +${pct(stack(0.3, 0.15, n))}`,
    apply: (b, n) => { const k = stack(0.5, 0.2, n); b.dmg += k; b.size += k; b.cd += stack(0.4, 0.15, n); b.self += stack(0.3, 0.15, n); },
  },
  {
    id: 'ward', name: 'Fire Ward', kind: 'Wizard',
    effect: (n) => `Take ${pct(Math.min(0.8, stack(0.25, 0.1, n)))} less damage from your own fire`,
    trade: () => null,
    apply: (b, n) => { b.ward = Math.min(0.8, stack(0.25, 0.1, n)); },
  },
  {
    id: 'shrink', name: 'Shrink', kind: 'Wizard',
    effect: (n) => `Wizard ${pct(1 - Math.max(0.5, 1 - stack(0.3, 0.06, n)))} smaller and harder to hit`,
    trade: (n) => `−${pct(stack(0.1, 0.05, n))} max HP`,
    apply: (b, n) => { b.scale = Math.max(0.5, 1 - stack(0.3, 0.06, n)); b.hp -= stack(0.1, 0.05, n); b.dodge = Math.min(0.5, stack(0.2, 0.07, n)); },
  },
  {
    id: 'fleet', name: 'Fleet Foot', kind: 'Wizard',
    effect: (n) => `+${pct(stack(0.15, 0.07, n))} move speed`,
    trade: () => null,
    apply: (b, n) => { b.move += stack(0.15, 0.07, n); },
  },
];

export const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));

// Turn the picked boons (id -> count) into multipliers for the fireball and wizard.
export function buildFrom(picked) {
  const b = { size: 1, dmg: 1, dmgEach: 1, cd: 1, speed: 1, count: 1, blast: 1, bounces: 0, pierce: 0, burn: 0, seek: 0, self: 1, ward: 0, scale: 1, hp: 1, dodge: 0, move: 1 };
  for (const boon of BOONS) boon.apply(b, picked[boon.id] || 0);
  b.cd = Math.max(0.35, b.cd);
  b.dmg = Math.max(0.3, b.dmg);
  return b;
}

// Three different boons, at random
export function offer(rand = Math.random) {
  const pool = BOONS.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

// XP needed for the next boon grows a little each time
export const xpForBoon = (level) => 100 + level * 40;
