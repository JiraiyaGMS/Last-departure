# models

Drop a Blender export named `station.glb` here and `src/level.js` will load and
walk it instead of building the station from `src/station.js`.

Name objects with the prefixes the loader sorts on:

| prefix | meaning |
|---|---|
| `col_` | invisible collision walls and floors |
| `nav_` | the walkable floor |
| `hide_` | hiding spots (lockers, stalls, under benches, behind the conveyor) |
| `int_` | interactables, e.g. `int_ticketmachine` |
| `spawn_player`, `spawn_attendant` | start positions |
| `patrol_01`, `patrol_02`, … | the Attendant's route, walked in name order |
| `light_` | empties that become flickering fluorescents in code |

Re-export and refresh the browser. Nothing needs importing by hand.
