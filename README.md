# Last Departure

First-person time-loop horror in an abandoned 1987 bus terminal. You wake on a
bench at 11:47 PM. The last bus leaves Bay 9 at 3:33 AM. To board it you need a
valid ticket, and the station has rules about how you get one.

Built from the design doc: **Last Departure — Horror Game Design Doc**.
Three.js + Vite, no build step beyond `npm`.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/, upload anywhere
```

Headphones strongly recommended. There is a content warning and a
**reduced flashing** option on the title screen; it limits flicker rate and
depth without making the station any brighter.

## Controls

| | |
|---|---|
| WASD / arrows | move |
| mouse | look |
| **Shift** | run — rule one says don't |
| **Ctrl** | crouch (quiet) |
| **E** | interact, hide, climb out |
| **Space** | hold your breath while hidden |
| **F** | torch |
| **Q** | stow / show your ticket |
| **R** | punch your transfer slip |
| **Y** | answer the PA (the sign says not to) |
| **Tab** | notebook |
| **Esc** | pause |
| **M** | mute |
| **\\** | debug sliders (lil-gui) |

## What's in the slice

All eight areas of the map, the full ticket chain, the Attendant, the Echoes,
one complete loop, and four endings.

**The ticket**, as the doc specifies, in three parts:

1. **Stub** — five 1987 coins into the ticket machine. Seven coins are hidden in
   the station.
2. **Stamp** — Walter's locked drawer in the Ticket Office. His keyring is in
   Security, and taking it tells him exactly where you are.
3. **Transfer** — a passenger's slip from Lost & Found, punched with the
   conductor's punch. The punch is in a luggage locker. The dial spells the
   first letters of the cancelled routes on the departure board: **W A L T**.
   Nobody tells you that it is his name.

**The Attendant.** A state machine — Patrol, Investigate, Hunt, Stalk, Wait —
pathing over a nav grid. He never runs, and he is slower than a walking player,
so he cannot win a chase; he wins by knowing the building. The keyring is
implemented literally as the doc's tell: the jingle is emitted per footfall from
his position in 3D and **stops when he stops**. Silence means he is close and
standing still. From 3:00 he gives up the route and stands in front of the only
door out.

**The rules.** Seven posted rules, five of them live in any given loop, shuffled
deterministically per loop number so a loop can be learned and returned to. Two
are traps planted by something else in the building, and obeying a trap feeds it.
The handwritten sign in the restroom names the fakes; after 2 AM only the
mirrored rules are true. Breaking a real rule reports your exact position.

**The director.** Nothing fires at random. A tension value rises with the hour,
his proximity, the dark, and how long nothing has happened, and is spent on
weighted beats with cooldowns. The important one is the doc's: *the hum cuts out
right before something happens*, so most beats are scheduled as a pair — the hum
dies, then one and a half to three seconds of real silence, then the beat. After
the third time the silence does the work on its own.

Beats include the light behind you going out, a bang from a room you are not in,
a single breath directly behind your head, a silhouette at the far end of a
sightline that vanishes if you look straight at it, and the PA using your name.

**The Echoes** mutter, and move only while unobserved. You never catch one
moving. You only ever notice that it is nearer.

## Deploying

The build is a plain static folder — `npm run build` writes `dist/`, which can be
uploaded anywhere. `vite.config.js` sets `base: './'` so it works from a subpath
or inside an embedded frame, and the asset filenames are pinned rather than
content-hashed so a rebuild does not churn the paths a host already references.

**GitHub Pages.** `.github/workflows/pages.yml` builds and publishes on every
push to the default branch, or on demand from the Actions tab. Enable Pages
first, or the run will fail: **Settings → Pages → Build and deployment →
Source: "GitHub Actions"**. Then either push, or run it by hand from
**Actions → Deploy to Pages → Run workflow**.

**itch.io**, as the doc suggests: upload the contents of `dist/` as a zip, tick
*This file will be played in the browser*, and set the viewport to 960×600.

Mouse look uses Pointer Lock where the host allows it and falls back to
click-and-drag where it does not, so the game stays playable embedded.

One expected console entry on load: a `404` for `models/station.glb`. That is the
deliberate probe described below — the loader checks for a Blender export and
builds the station from data when there isn't one.

## Three places this differs from the doc

The doc's stack assumes tools this toolchain does not have. In each case the
contract is preserved so the intended pipeline drops straight back in.

1. **Blender → `station.glb`.** There is no Blender here, so the station is
   declared in `src/station.js` and `src/level.js` builds a group of objects
   with exactly the doc's prefixes (`col_`, `nav_`, `hide_`, `int_`, `spawn_*`,
   `patrol_NN`, `light_`). **`level.js` prefers `public/models/station.glb`
   whenever one exists**, so exporting the real level from Blender replaces the
   data file and changes no other code.
2. **Audio files.** There are none in the repo; every sound is synthesised in
   `src/audio.js`. This suits the brief better than samples: the hum is a real
   sustained tone that can be cut dead on a frame, the keyring is re-randomised
   per jingle so it never loops recognisably, and the PA is a formant synth
   driven by the syllables of the line — it sounds like a voice saying something
   you cannot quite make out, and the subtitles carry the words.
3. **`recast-navigation-js`.** It needs `nav_` surfaces from the glb to voxelise.
   Without them the walkable area is rasterised from the room rectangles and the
   door openings and searched with A* (`src/nav.js`). He still takes real routes
   through real doorways; swapping in recast later only changes `path()`.

## The doc's three open questions

Decisions made while building, so the slice could be played:

- **Loop length, 15 or 20 minutes?** 14× real time, which puts 11:47 PM → 3:33 AM
  at **≈16 minutes**. `RATE` in `src/loop.js`.
- **Should the player sprint at all, given the no-running rule?** **Yes.** A rule
  you cannot break is set dressing. Sprinting is fast, loud and against rule one,
  so every corridor becomes a decision about the clock versus the risk.
- **One handcrafted station, or randomised rules?** **Both, split.** The station
  is handcrafted so it can be learned by heart over loops, which the doc argues
  for. The *rules* reshuffle per loop — deterministically, seeded on the loop
  number, so a given loop is reproducible.

These are proposals, not amendments; the doc still lists them as open.

## Layout

```
index.html            shell, HUD, title screen, content warning
src/
  main.js             renderer, game loop, the night's schedule, endings
  station.js          the level as data — the stand-in for station.glb
  level.js            build the scene, then sort it by name prefix
  collision.js        capsule vs three-mesh-bvh, and line of sight
  nav.js              walkable grid + A*
  player.js           controls, crouch, noise output, breath, torch
  attendant.js        Walter: state machine, pathing, the keyring tell
  echoes.js           the fourteen passengers
  loop.js             11:47 → 3:33 at 14×, timed events, reset
  rules.js            the Station Rules, real and planted
  scares.js           the director — tension, beats, the silence before
  interact.js         raycast, prompts, the whole ticket chain
  notebook.js         the only thing that survives a reset (localStorage)
  audio.js            every sound in the game, synthesised
  lights.js           the fluorescent rig
  ps1.js              low-res target, vertex snapping, dither, CRT artefacts
  textures.js         every surface, drawn into small canvases
  ui.js               HUD, subtitles, panels
public/models/        drop station.glb here and level.js will use it
```

## Milestones

- [x] Vite project, a walkable room, mouse look and collision
- [x] Prefix loader for `col_`, `int_`, `hide_`, `light_`, `patrol_`, spawns
- [x] Loop manager with a working clock and reset to the bench
- [x] Attendant on the nav grid: patrol, hear noise, stalk, catch
- [x] Rules sign plus enforceable rules, real and fake
- [x] Ticket stub puzzle end to end — and the stamp and transfer too
- [x] PS1 render pass, flickering lights, fog, positional audio
- [x] Four endings
- [ ] Hidden areas: the maintenance tunnel, the manager's office, Bay 0
- [ ] All fourteen Echoes with their belongings (three are in)
- [ ] The walkie-talkie, and the manager's-office clock-hands puzzle
- [ ] Playtest the slice and re-tune the director's pacing
