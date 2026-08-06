# Neon Balloon VR 🎈

A Balloon Fight-inspired floating combat arcade game built with IWSDK (Immersive Web SDK) for WebXR and browser play.

## Play

**[Play Now →](https://ellyz2426.github.io/neon-balloon/)**

## Gameplay

Float through the arena with your balloons, popping enemy balloons from above! Classic Balloon Fight mechanics reimagined with neon visuals and VR support.

### Core Mechanics
- **Flap to fly** — Press Space/W/↑ or VR triggers to gain altitude
- **Pop balloons** — Hit enemies from above to pop their balloons
- **Avoid attacks** — Enemies can pop YOUR balloons too
- **Horizontal wrap** — Fly off one side, appear on the other
- **Water hazard** — Fall in the water and you're done

### Enemy Types
| Type | Balloons | Behavior |
|------|----------|----------|
| Basic | 2 | Wanders, random flapping |
| Chaser | 2 | Pursues the player aggressively |
| Dodger | 1 | Erratic movement, hard to hit |
| Boss | 4 | Slow but powerful, lunges upward |

### Power-Ups
- 🛡️ **Shield** — Absorbs one balloon pop
- ⚡ **Speed** — Move faster for 8 seconds
- 🎈 **Extra Balloon** — Gain an additional balloon
- ⚡ **Lightning Immunity** — Lightning can't hurt you
- 🧲 **Magnet** — Pulls collectibles toward you

### Hazards
- ⚡ **Lightning** — Bolts strike from storm clouds (Phase 3+)
- 🌊 **Water** — Touch the water and lose a life
- 🐟 **Bonus Fish** — Catch fish jumping from the water for 500 points

## Game Modes

- **Arcade** — Clear phases of enemies, boss every 5th phase
- **Balloon Trip** — Side-scrolling obstacle course
- **Survival** — Endless waves with scaling difficulty

## Controls

### Keyboard
| Key | Action |
|-----|--------|
| Space / W / ↑ | Flap (gain altitude) |
| A / ← | Move left |
| D / → | Move right |
| Escape / P | Pause |

### VR Controllers
| Input | Action |
|-------|--------|
| Either Trigger | Flap |
| Thumbstick (L/R) | Move horizontally |
| Pointer | Menu interaction |

## Features

- Floating physics with balloon buoyancy
- 4 enemy types with distinct AI behaviors
- Boss fights every 5th phase
- 5 power-up types
- Lightning hazard system
- Fish catching bonus mechanic
- Combo scoring system
- Multiple game modes
- 3 difficulty levels
- Screen shake and slow-motion effects
- Particle effects system
- Neon visual aesthetic with glowing platforms
- Procedural audio (SFX + dynamic music)
- Career stats with localStorage persistence
- 6 UIKitML spatial UI panels
- Full XR controller + keyboard support
- Dual VR/browser mode

## Tech Stack

- **IWSDK 0.5.1** — Meta's Immersive Web SDK
- **Three.js** — 3D rendering (via @iwsdk/core)
- **ECS Architecture** — Entity Component System
- **UIKitML** — Spatial UI panels
- **Web Audio API** — Procedural sound

## Development

```bash
pnpm install
npm run dev
```

## License

MIT
