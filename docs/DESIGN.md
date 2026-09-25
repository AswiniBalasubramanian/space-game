# Astra: design notes

This covers the brief's "first task": the concept analysis, the risks, the MVP, the architecture, the data model, the state flow, the scene structure, the reusable components and the build order.

## 1. Concept

The game is an emotional loop at two scales. There is a tiny, warm home and an enormous universe. The player never simply collects oxygen. Each core is a thank-you for helping a civilisation, and the finale ties those favours back to Mom.

The requested art direction mixes two things. The brief asks for photoreal cosmic scale. The reference images are Ghibli-like watercolour anime. The build keeps the brief's **composition and scale**: tiny figures, sky-filling celestial structures, golden accretion light, reflective water. It renders all of that in a **painted, cel-shaded watercolour style** so everything feels cozy.

## 2. Technical risks and how they're handled

| Risk | Mitigation |
|---|---|
| Browser performance (many worlds, big skies) | Worlds are code-split and loaded only when entered. Vegetation is instanced. There is one shadow-casting light, and its frustum follows the player. The pixel ratio is capped at 1.5. Textures are painted once and cached. |
| Load hitches during transitions | Loading happens while the screen is black inside the black-hole sequence. |
| Asset pipeline and licensing | There are no external assets. Geometry, textures and audio are all procedural. |
| "Black holes look like glowing circles" | A void, a tilted accretion disk, a camera-facing lensed ring, infalling dust, and **screen-space lensing** in the post pass. |
| Watercolour look vs. readability | The post pass has a strength uniform, a toggle (`V`), gentle saturation handling, and a neutral tone map. |
| WebXR can't run the post chain per eye | In XR the scene renders directly. DOM UI is mirrored onto a 3D panel, and XR gamepads feed the same input axes. |
| Save/progression without a backend | Per-nickname profiles in `localStorage`, plus admin export/import. |

## 3. MVP and what shipped

The requested vertical slice (entry → home → car → space → one black hole → Farm World → harvest → oxygen → return) was built first. The rest was then layered on: Knowledge World, Hunger World, the return home, the finale, saving, and the admin console. The full loop is covered by an automated end-to-end playthrough, run during development.

## 4. Architecture

```
Game (GameStateManager)
 ├─ Engine: WebGLRenderer, camera + XR rig, EffectComposer (Render → Bloom → Output → Watercolour)
 ├─ Input: keyboard/mouse/pointer-lock + WebXR gamepads → shared axes
 ├─ Tweens: frame-driven promises; every cutscene is async/await
 ├─ Systems: Audio · HUD · XRPanel · Dialogue · Missions · Inventory · Rewards · Save
 ├─ Player: CharacterModel + CharacterController
 ├─ Vehicle: Car + VehicleController (ground / flight)
 └─ World (one at a time, lazily imported)
      BaseWorld → MissionWorld → Farm / Knowledge / Hunger
      BaseWorld → Home, Space, Title
```

A world provides: `build()`, `enter()`, `arrive()`, `heightAt(x, z, y)`, `collide(pos, r)`, `interactables[]`, `waypoint()`, `holes[]` (for lensing), and `updaters[]`.

## 5. Data model (saved profile)

```js
{
  nickname, character,                  // 'female' | 'male'
  currentWorld,                         // 'home' | 'space' | 'farm' | 'knowledge' | 'hunger'
  story: { stage, starMap, worldsDiscovered[], finale, endingSeen, focus },
  missions: { [id]: { status, stage, progress, total, label } },
  inventory: { oxygenCore, crops, books, wood, stone, fish, food },
  worldState: { farm: { harvested[], delivered }, knowledge: { taught[] }, hunger: { woodUsed[], stoneUsed[], dockBuilt, delivered } },
  stats: { playSeconds, created }, updatedAt
}
```

Content definitions (missions, NPCs, items, lessons) live in `src/data/content.js`. Admin tuning overrides go to `localStorage["astra.config"]`.

## 6. Game-state flow

```
title/entry → welcome text → HOME(start)
  talk Mom → star map → open door → car → lift off
SPACE ─(approach hole, E)→ portal → WORLD
  WORLD mission stages → reward (core) → car → lift off → SPACE
  ...×3
SPACE (stage 'home') → beacon → landing → HOME(return)
  insert cores → Mom wakes → dinner → wide shot → ending card
```

Story stages: `talk → map → leave → space → cores/car → home → machine → done`. Each world mission has its own stages. For example, Feed the World runs `talk → gather → build → fish → cook → deliver → reward → done`.

## 7. Scene structure

Each world owns its own `THREE.Scene`, with its sky dome and star layers following the camera. The player, the car, the XR rig and the XR panel move from scene to scene. Outgoing scenes are disposed.

## 8. Reusable components

CharacterController, VehicleController, WorldManager (`Game.loadWorld`), PortalManager (`Game.enterBlackHole`, `SpaceWorld` interactables), NPC, DialogueSystem, MissionSystem, InventorySystem, RewardSystem, SaveSystem, and the builders in `render/` (terrain, grass, forests, rocks, mountains, water, clouds, rings, black holes).

## 9. Build order used

Architecture → rendering style → controller → home → Mom and dialogue → car → space → black-hole portal → Farm World and harvest → reward → return → Knowledge World → Hunger World → finale → save/resume → admin → end-to-end verification.
