# 3rd World — a cinematic space adventure (three.js)

*Helping others gives us the strength to save the people we love.*

Mother depends on an oxygen machine. Three black holes lead to three worlds. Help the
people in each world to earn an Oxygen Core, then fly home and save her.

## Run

```bash
npm install
npm run dev          # game:  http://localhost:5173/
                     # admin: http://localhost:5173/admin.html
npm run build        # outputs dist/
```

Dev shortcut: `/?dev=home|space|farm|knowledge|hunger` jumps straight into a world as a test player.

## Deploy to Vercel (own project, `3rdworld` name)

This repository is a self-contained Vite project (`package.json`, `vite.config.js`, `vercel.json`).

1. Go to **vercel.com/new** and import this GitHub repo.
2. **Project name:** `3rdworld`. The free address becomes `https://3rdworld.vercel.app` if that name is free.
3. **Root Directory:** leave it as the repository root. The build settings come from `vercel.json`.
4. **Environment Variables** (optional, for the database): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Click **Deploy**. The game is served at `/` and your admin console at `/admin`.
6. **Custom domain** (e.g. `3rdworld.com`, if you own it): open **Settings → Domains → Add** and
   follow Vercel's DNS instructions.

CLI alternative: `npx vercel --prod`, then choose the project name `3rdworld`.

## Database (Supabase) & private admin

Without configuration the game saves to `localStorage` only. To keep a real database:

1. Create a Supabase project and run [`supabase/migrations/0001_astra.sql`](supabase/migrations/0001_astra.sql)
   in its SQL editor. It creates `players`, `game_config` and `admins`, with Row Level Security.
2. **Authentication → Providers:** enable **Anonymous sign-ins** (players get a silent session).
3. **Authentication → Users → Add user:** your admin email + a password. The migration lists
   that email in `admins`; edit the `insert into public.admins` line to change it.
4. Copy `.env.example` to `.env.local`, fill in the project URL and anon key, then `npm run dev` / `npm run build`.

Who can see what:
- **Players:** each browser reads and writes only its own saves.
- **Admin (`/admin`):** requires your email and password. The database returns
  everyone's data only to accounts in `admins`, so anyone else who opens the page sees nothing.
- **Admin edits:** changes to a player's save are picked up the next time that player continues.
  Content edits apply to everyone on their next load.

## Controls

| | |
|---|---|
| WASD / arrows | walk · drive · fly |
| Mouse (click to capture) or drag | look / steer |
| Shift | run / boost |
| E | interact, advance dialogue |
| Space / C | lift off · rise / sink in space |
| 1–4 | dialogue choices |
| Tab · Esc · M | inventory · pause · mute |
| VR | an **Enter VR** button appears on WebXR headsets (left stick moves, right stick turns, trigger interacts) |

## The journey

Home (Mother, the machine, the mission) → walk out → car → drive and lift off → Space Hub →
**Black Hole 01: Farm World** (Harvest Day) · **02: Knowledge World** (Share Knowledge — teach
four children) · **03: Hunger World** (Feed the World — gather fallen branches, driftwood and stones (no tree cutting), repair the dock, fish, cook,
deliver) → 3 / 3 cores → Home is calling → land → insert the cores → dinner with Mother → final wide shot.

## Look

The hand-painted style is procedural, with no image assets. It uses toon ramps, sun-banded
"paint" shading on foliage, soft billboard cumulus, wind-blown instanced grass and wheat,
snow-capped mountains and a Kuwahara brush-stroke post filter (you can toggle it in the
pause menu). A cinematic pass adds gravitational lensing, warp streaks, vignette and grain.

## Architecture (`src`)

| Folder | Contents |
|---|---|
| `core/` | Engine (renderer, post passes, WebXR), Input, AudioSys (procedural music and SFX), SaveSystem, noise |
| `systems/` | CharacterController + NPCs, VehicleController, Dialogue, Missions (inventory and rewards), Interactions and markers, Cinematic camera, physics |
| `world/` | Environment kit (sky, clouds, grass, trees, mountains, water, mirror lake), cosmic kit (black holes, nebula, planets, rings), architecture helpers |
| `scenes/` | `base.js` (WorldManager base), `home`, `space`, `farm`, `knowledge`, `hunger`, `common` (arrival, core reward, leaving). Each world is lazily imported and disposed |
| `ui/` | HUD, overlays (fades, letterbox, title cards, warp streaks), entry screen, in-headset XR panel |
| `data/content.js` | All editable content: worlds, missions, NPCs, characters, rewards |
| `admin/` | A separate admin console for players, progression, content and import/export |

Progress and admin overrides persist in `localStorage` (`astra.players.v1`, `astra.config.v1`).
