# Astra — A Breath Between Worlds

A cozy, watercolour, Ghibli-inspired 3D adventure in the browser, built with **three.js**.

Mom is ill and her oxygen machine is failing. Your father's old star map shows three black holes, and beyond each one a world that might help. You fly the old blue car through a painted cosmos. In each world you help people, and they give you an **Oxygen Core** in return. Then you go home.

> *Helping others gives us the strength to save the people we love.*

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

- Game: `index.html`
- Admin console: `admin.html` (also linked from the entry screen footer)

## Controls

| Action | Keyboard / mouse | VR (WebXR) |
|---|---|---|
| Move | `W A S D` / arrows | left stick |
| Look | mouse (click canvas to lock the pointer), right-drag | head + right stick snap-turn |
| Run | `Shift` | — |
| Interact / advance dialogue | `E` (also `Space`/`Enter` in dialogue) | trigger |
| Dialogue choices | `1`–`3`, arrows + `E`, or click | left stick + trigger |
| Drive (home) | `W/S` drive, `A/D` steer, `Space` lift off, `E` get out | left stick |
| Fly (space) | `W/S` thrust, `A/D` + mouse steer, `Space`/`C` climb/dive, `Shift` boost | left stick, right stick pitch, A/B |
| Sound / paint filter | `M` / `V` (or the buttons bottom-right) | — |

Add `?dev=4` to the URL to run the game clock 4× faster. It's useful for testing cutscenes on slow machines.

## The journey

1. **Entry**: pick a nickname and an explorer (female or male). Profiles are saved per nickname.
2. **Home**: talk to Mom, read Dad's star map, open the front door, get in the car and lift off.
3. **The Quiet Sea (space)**: a watercolour planet below you, nebulae, asteroid rivers, comets, and three enormous black holes with gravitational lensing. Fly close to one: *UNKNOWN WORLD DETECTED · [E] ENTER*.
4. **Farm World, "Harvest Day"**: golden fields under a celestial ring that fills half the sky. Harvest glowing sheaves and carry them to the cart (6 at a time, 12 in total).
5. **Knowledge World, "Share Knowledge"**: a wealthy floating plaza, with children living in its shadow below. Borrow Lumen Books, ride the light-lift down, and answer each child's question to teach them.
6. **Hunger World, "Feed the World"**: cracked dusk plains around a mirror lake that reflects the whole sky. Gather wood and stone, build a dock, fish, cook, and fill the empty storehouse.
7. **Home is calling**: a light beam marks your house on the planet. Land, bring the three cores to the machine, and share dinner with Mom. The story ends on a wide shot of the tiny house under the enormous sky.

Each world is its own lazily-loaded module. Worlds load while the screen is dark inside the black-hole transition (*distortion → light stretch → darkness → silence → bell → flash*).

## Visual style

- **Cel shading**: a soft 4-band toon ramp, inverted-hull ink outlines on characters and hero props.
- **Watercolour post pass** (`src/render/WatercolorShader.js`): wobbly brush edges, pigment pooling at tone edges, paper grain and fibres, uneven pigment blotches, a warm vignette. The same pass handles black-hole **lensing** and the portal **warp / darkness / flash**.
- **Painted everything**: sky domes with brushed cirrus, cumulus sprites painted on canvas at load time, a hand-painted planet texture, streaky accretion disks, and the celestial rings. The game uses no image files.
- **Procedural audio**: soft pads and a music-box melody per world, wind, and small sound effects, all generated with WebAudio.

## VR

When a WebXR headset is available, an **Enter VR** button appears. The game renders directly to the headset (the watercolour pass can't run per-eye, so VR shows the cel-shaded scene). You play in first person, with a floating paper panel that mirrors dialogue, prompts and the current objective. VR support has not been tested on a physical headset yet.

## Admin console

`admin.html` is kept separate from the game. It has:
- **Dashboard**: active players, worlds discovered, missions completed, oxygen cores collected, and a progress funnel.
- **Players**: view, edit (character, world, story stage, mission status, inventory), reset, delete, and export/import JSON.
- **Missions**: tune crop targets, carry capacity, and wood/stone/fish counts. The game reads these overrides.
- **Worlds & NPCs**: worlds, portals, moods, NPCs and lessons.

The game has no backend. Profiles and settings live in the browser's `localStorage`, so the admin console sees the players on the same device and browser.

## Project structure

```
src/
  core/        Engine (renderer, post chain, XR), Game (state manager, camera director, transitions), Input, Tween
  render/      toon materials + outlines, watercolour shader, painted textures, sky, nature builders, cosmic (rings, black holes)
  character/   procedural anime characters (player, Mom, NPCs)
  player/      CharacterController
  vehicle/     Car model, VehicleController (ground + flight)
  worlds/      BaseWorld, MissionWorld, TitleWorld, HomeWorld, FarmWorld, KnowledgeWorld, HungerWorld
  space/       SpaceWorld (the hub)
  npcs/        NPC
  dialogue/    DialogueSystem (typewriter lines + choices)
  missions/    MissionSystem
  inventory/   InventorySystem
  progression/ RewardSystem (oxygen core cinematic)
  save/        SaveSystem (per-nickname profiles)
  ui/          HUD, EntryScreen, XRPanel
  audio/       AudioSystem
  data/        content.js: items, worlds, NPCs, missions, lessons (shared with admin)
  admin/       admin console
docs/DESIGN.md  concept analysis, risks, architecture, data model, state flow
```
