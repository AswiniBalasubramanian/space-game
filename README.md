# 3rd World — a cinematic space adventure (three.js)

*Helping others gives us the strength to save the people we love.*

Mother depends on an oxygen machine. Three black holes lead to three worlds. Help the
people in each world to earn an Oxygen Core, then fly home and save her.

## Run

```bash
npm install
npm run dev          # site:  http://localhost:5173/
                     # game:  http://localhost:5173/play.html
                     # admin: http://localhost:5173/admin.html
npm run build        # outputs dist/
```

Dev shortcut: `/play.html?dev=home|space|farm|knowledge|hunger` jumps straight into a world as a test player.

## Deploy to Vercel (own project, `3rdworld` name)

This repository is a self-contained Vite project (`package.json`, `vite.config.js`, `vercel.json`).

1. Go to **vercel.com/new** and import this GitHub repo.
2. **Project name:** `3rdworld`. The free address becomes `https://3rdworld.vercel.app` if that name is free.
3. **Root Directory:** leave it as the repository root. The build settings come from `vercel.json`.
4. **Environment Variables:** `VITE_SITE_URL` (your final address), `VITE_CONTACT_EMAIL`, and optionally
   `VITE_ADSENSE_CLIENT`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Click **Deploy**. The website is served at `/`, the game at `/play` and your admin console at `/admin`.
6. **Custom domain** (e.g. `3rdworld.com`, if you own it): open **Settings → Domains → Add** and
   follow Vercel's DNS instructions.

CLI alternative: `npx vercel --prod`, then choose the project name `3rdworld`.

## Website, SEO & Google AdSense

The game is a WebGL canvas, which crawlers can't read, so the site also ships static HTML pages:
`/` (landing + FAQ), `/how-to-play`, `/worlds`, `/about`, `/contact`, `/privacy`, `/terms` and a `404`.
Each has a title, meta description, canonical URL, Open Graph/Twitter tags, and the landing page has
`VideoGame` + `FAQPage` JSON-LD. The build also writes `sitemap.xml`, `robots.txt` (blocks `/admin`) and `ads.txt`.
Page sources are the root `*.html` files; `%SITE_URL%`, `%CONTACT_EMAIL%` and `%YEAR%` are filled in at build time.

To apply for AdSense:
1. Set `VITE_SITE_URL` and `VITE_CONTACT_EMAIL` in Vercel and deploy.
2. Add the site in **Google Search Console** and submit `https://<your-site>/sitemap.xml`.
3. Sign up at **adsense.google.com** with your site URL and copy your publisher ID (`ca-pub-…`).
4. Set `VITE_ADSENSE_CLIENT=ca-pub-…` in Vercel and redeploy. The AdSense tag is added to the content
   pages only, never inside the game or admin, and `/ads.txt` gets your line.
5. In AdSense, click **Request review**. Approval usually takes a few days to a few weeks.
6. **Privacy & messaging → European regulations:** turn on Google's consent message (a certified CMP),
   which is required to show ads to visitors in the EEA, UK and Switzerland.

AdSense only accepts a root domain you own, so a `*.vercel.app` address usually won't be approved. Connect a custom domain (e.g. `3rdworld.com`) first.

## CrazyGames build

```bash
npm run build:crazygames   # → dist-crazygames/ and 3rd-world-crazygames.zip
```

This builds the game only (no website pages or admin) with relative paths, ready to upload in the
CrazyGames Developer Portal as an **HTML5** game. In this build (`VITE_PORTAL=crazygames`, see `.env.crazygames`)
the game loads the CrazyGames SDK v3 through `src/core/platform.js` and:
- **saves** progress with the SDK **Data Module** instead of `localStorage` (Supabase is switched off);
- follows the **CrazyGames mute** setting;
- requests a **midgame ad** at the break between worlds, with the game's audio silenced while it plays;
- reports `loadingStart/Stop`, `gameplayStart/Stop` (walking, driving or flying, not paused) and `happytime`
  (each Oxygen Core and the finale).

Every SDK call is guarded, so if the SDK fails to load the game still runs and saves to `localStorage`.
Portal form answers: engine **HTML5**, progress save **Data Module**, and tick **CrazyGames muting**.

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
| Space | jump (walking) · lift off (car) · rise (space) |
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
