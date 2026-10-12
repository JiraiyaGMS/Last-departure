/**
 * station.js — the level, as data.
 *
 * The design doc builds the station in Blender and exports one station.glb whose
 * object names carry prefixes (col_, nav_, hide_, int_, spawn_, patrol_, light_).
 * There is no Blender in this toolchain, so the same station is declared here and
 * `level.js` builds a THREE.Group of identically-named objects from it.
 *
 * level.js prefers public/models/station.glb whenever one exists, so exporting the
 * real level from Blender later replaces this file with no other code change.
 *
 * Units are metres. +X east, +Z south, +Y up. The bus bays are north (-Z),
 * the front doors south (+Z).
 */

export const ROOMS = [
  // id            label                  x range        z range        h    floor
  { id:'hall',      label:'Main Waiting Hall', x:[-14, 14], z:[ -6, 14], h:6.4, floor:'terrazzo' },
  { id:'concourse', label:'North Concourse',   x:[ -6,  6], z:[-24, -6], h:5.0, floor:'terrazzo' },
  { id:'baggage',   label:'Baggage Claim',     x:[-24, -6], z:[-24,-12], h:4.4, floor:'concrete' },
  { id:'diner',     label:'Diner Counter',     x:[  6, 22], z:[-24,-12], h:4.4, floor:'checker'  },
  { id:'ticket',    label:'Ticket Office',     x:[-24,-14], z:[ -6,  4], h:3.8, floor:'wood'     },
  { id:'lostfound', label:'Lost & Found',      x:[-24,-14], z:[  4, 14], h:3.8, floor:'concrete' },
  { id:'restroom',  label:'Restrooms',         x:[ 14, 24], z:[ -2,  8], h:3.8, floor:'tile'     },
  { id:'cctv',      label:'Security',          x:[ 14, 24], z:[  8, 16], h:3.6, floor:'concrete' },
  { id:'platform',  label:'Bus Bays 1–9',      x:[-32, 32], z:[-42,-24], h:9.0, floor:'asphalt', outdoor:true },
];

/** Openings cut out of shared walls. axis 'x' = wall runs along Z at that x. */
export const DOORS = [
  { axis:'z', at: -6, from:  -4, to:   4, tall:true,  id:'hall_concourse' },
  { axis:'x', at: -6, from: -20, to: -16, tall:false, id:'concourse_baggage' },
  { axis:'x', at:  6, from: -20, to: -16, tall:false, id:'concourse_diner' },
  { axis:'z', at:-24, from:  -4, to:   4, tall:true,  id:'bay_doors' },
  { axis:'x', at:-14, from:  -2, to:   1, tall:false, id:'hall_ticket',    door:'ticket' },
  { axis:'x', at:-14, from:   7, to:  10, tall:false, id:'hall_lostfound' },
  { axis:'x', at: 14, from:   1, to:   4, tall:false, id:'hall_restroom' },
  { axis:'x', at: 14, from:  10, to:  13, tall:false, id:'hall_cctv',      door:'cctv' },
  // The front doors. They open onto the concourse you just left.
  { axis:'z', at: 14, from:  -2, to:   2, tall:false, id:'front_doors',    front:true },
];

/**
 * Props. `kind` selects the mesh builder in level.js; `name` carries the prefix
 * that drives all gameplay wiring. rot is radians about Y.
 */
export const PROPS = [
  // ── Main Waiting Hall ───────────────────────────────────────────────────────
  { name:'spawn_player',        kind:'empty',     pos:[  0,   0,   6 ], rot: 0 },
  { name:'hide_bench_01',       kind:'bench',     pos:[ -7,   0,   1 ], rot: 0 },
  { name:'hide_bench_02',       kind:'bench',     pos:[ -7,   0,   5 ], rot: 0 },
  { name:'hide_bench_03',       kind:'bench',     pos:[  0,   0,   1 ], rot: 0 },
  { name:'hide_bench_04',       kind:'bench',     pos:[  0,   0,   5 ], rot: 0 },
  { name:'hide_bench_05',       kind:'bench',     pos:[  7,   0,   1 ], rot: 0 },
  { name:'hide_bench_06',       kind:'bench',     pos:[  7,   0,   5 ], rot: 0 },
  { name:'int_departureboard',  kind:'board',     pos:[  0, 3.5,-5.75], rot: 0 },
  { name:'int_wallclock',       kind:'clock',     pos:[ -9, 3.9,-5.75], rot: 0 },
  { name:'int_rulessign',       kind:'sign',      pos:[ 13.7, 2.3, 2.5], rot:-Math.PI/2 },
  { name:'int_bench_note',      kind:'note',      pos:[  0, 0.47, 6.8], rot: 0 },
  { name:'col_pillar_01',       kind:'pillar',    pos:[-10,   0, -2 ] },
  { name:'col_pillar_02',       kind:'pillar',    pos:[ 10,   0, -2 ] },
  { name:'col_pillar_03',       kind:'pillar',    pos:[-10,   0, 10 ] },
  { name:'col_pillar_04',       kind:'pillar',    pos:[ 10,   0, 10 ] },
  { name:'int_trash_hall',      kind:'bin',       pos:[ 12,   0,  -4 ] },

  // ── Ticket Office ───────────────────────────────────────────────────────────
  { name:'int_ticketmachine',   kind:'machine',   pos:[-22.6, 0, -3.5], rot: Math.PI/2 },
  { name:'int_nightlog',        kind:'book',      pos:[-18, 1.03, 0.4], rot: 0.3 },
  { name:'int_stampdrawer',     kind:'drawer',    pos:[-18, 0.62,-1.4], rot: 0 },
  { name:'col_counter_ticket',  kind:'counter',   pos:[-18,   0, -0.5], rot: 0 },
  { name:'light_ticket',        kind:'empty',     pos:[-19, 3.3, -1  ] },

  // ── Restrooms ───────────────────────────────────────────────────────────────
  { name:'hide_stall_01',       kind:'stall',     pos:[ 22,   0,  -0.4], rot:-Math.PI/2 },
  { name:'hide_stall_02',       kind:'stall',     pos:[ 22,   0,   1.8], rot:-Math.PI/2 },
  { name:'hide_stall_03',       kind:'stall',     pos:[ 22,   0,   4.0], rot:-Math.PI/2 },
  { name:'int_mirror',          kind:'mirror',    pos:[ 16, 1.9,  7.75], rot: Math.PI },
  { name:'int_handwrittensign', kind:'note',      pos:[ 14.4, 1.7, 6.6], rot:-Math.PI/2 },
  { name:'col_sinks',           kind:'sinks',     pos:[ 16,   0,  7.4], rot: Math.PI },
  { name:'light_restroom_a',    kind:'empty',     pos:[ 17, 3.3,  1.0], flicker:0.9 },
  { name:'light_restroom_b',    kind:'empty',     pos:[ 21, 3.3,  5.5], flicker:0.6 },

  // ── Diner Counter ───────────────────────────────────────────────────────────
  { name:'int_vending_01',      kind:'vending',   pos:[ 20.4, 0,-22.4], rot: Math.PI },
  { name:'int_vending_02',      kind:'vending',   pos:[ 17.6, 0,-22.4], rot: Math.PI },
  { name:'int_jukebox',         kind:'jukebox',   pos:[ 21.2, 0,-14.5], rot:-Math.PI/2 },
  { name:'int_coffeepot',       kind:'pot',       pos:[ 11, 1.05,-17  ] },
  { name:'col_counter_diner',   kind:'counter',   pos:[ 11,   0,-18  ], rot: Math.PI/2 },
  { name:'light_diner',         kind:'empty',     pos:[ 14, 3.6,-18  ], flicker:0.3 },

  // ── Security / CCTV ─────────────────────────────────────────────────────────
  { name:'int_monitors',        kind:'monitors',  pos:[ 22.5, 1.2, 12 ], rot:-Math.PI/2 },
  { name:'int_pa_mic',          kind:'mic',       pos:[ 21.4, 1.08,10.4], rot:-Math.PI/2 },
  { name:'int_keyring',         kind:'keyring',   pos:[ 21.2, 1.05,13.4], rot: 0 },
  { name:'col_desk_cctv',       kind:'counter',   pos:[ 21.6, 0, 12 ],  rot: Math.PI/2 },
  { name:'light_cctv',          kind:'empty',     pos:[ 19, 3.1, 12 ],  flicker:0.5 },

  // ── Baggage Claim ───────────────────────────────────────────────────────────
  { name:'int_conveyor',        kind:'conveyor',  pos:[-15,   0,-18  ], rot: 0 },
  { name:'hide_conveyor',       kind:'empty',     pos:[-15,   0,-19.6] },
  { name:'hide_locker_01',      kind:'locker',    pos:[-23.4, 0,-14  ], rot: Math.PI/2 },
  { name:'hide_locker_02',      kind:'locker',    pos:[-23.4, 0,-15.2], rot: Math.PI/2 },
  { name:'hide_locker_03',      kind:'locker',    pos:[-23.4, 0,-16.4], rot: Math.PI/2 },
  { name:'hide_locker_04',      kind:'locker',    pos:[-23.4, 0,-17.6], rot: Math.PI/2 },
  { name:'int_lockerpanel',     kind:'panel',     pos:[-23.4, 1.6,-19.4],rot: Math.PI/2 },
  { name:'light_baggage_a',     kind:'empty',     pos:[-12, 3.9,-16  ], flicker:0.2, fails:'01:00' },
  { name:'light_baggage_b',     kind:'empty',     pos:[-20, 3.9,-20  ], flicker:0.2, fails:'01:00' },

  // ── Lost & Found ────────────────────────────────────────────────────────────
  { name:'int_shelf_01',        kind:'shelf',     pos:[-23.4, 0,  6  ], rot: Math.PI/2 },
  { name:'int_shelf_02',        kind:'shelf',     pos:[-23.4, 0,  9  ], rot: Math.PI/2 },
  { name:'int_shelf_03',        kind:'shelf',     pos:[-23.4, 0, 12  ], rot: Math.PI/2 },
  { name:'int_transferslips',   kind:'slips',     pos:[-16, 1.02, 9  ], rot: 0.2 },
  { name:'col_table_lf',        kind:'counter',   pos:[-16,   0,  9  ], rot: 0 },
  { name:'light_lostfound',     kind:'empty',     pos:[-19, 3.3, 9   ], flicker:0.4 },

  // ── Concourse ───────────────────────────────────────────────────────────────
  { name:'light_concourse_a',   kind:'empty',     pos:[  0, 4.4,-10  ] },
  { name:'light_concourse_b',   kind:'empty',     pos:[  0, 4.4,-16  ], flicker:0.35 },
  { name:'light_concourse_c',   kind:'empty',     pos:[  0, 4.4,-22  ] },
  { name:'int_routemap',        kind:'sign',      pos:[ -5.7, 2.3,-14 ], rot: Math.PI/2 },

  // ── Hall lights ─────────────────────────────────────────────────────────────
  { name:'light_hall_a',        kind:'empty',     pos:[ -7, 5.6,  0  ] },
  { name:'light_hall_b',        kind:'empty',     pos:[  7, 5.6,  0  ] },
  { name:'light_hall_c',        kind:'empty',     pos:[ -7, 5.6,  9  ], flicker:0.25 },
  { name:'light_hall_d',        kind:'empty',     pos:[  7, 5.6,  9  ] },

  // ── Bus bays ────────────────────────────────────────────────────────────────
  { name:'int_bus',             kind:'bus',       pos:[ 22,   0,-33  ], rot: 0 },
  { name:'light_bay_a',         kind:'empty',     pos:[-16, 6.0,-32  ], flicker:0.5, sodium:true },
  { name:'light_bay_b',         kind:'empty',     pos:[  0, 6.0,-32  ], flicker:0.5, sodium:true },
  { name:'light_bay_c',         kind:'empty',     pos:[ 16, 6.0,-32  ], flicker:0.5, sodium:true },
  { name:'col_shelter_01',      kind:'shelter',   pos:[-18,   0,-28  ] },
  { name:'col_shelter_02',      kind:'shelter',   pos:[ -6,   0,-28  ] },
  { name:'col_shelter_03',      kind:'shelter',   pos:[  6,   0,-28  ] },
  { name:'col_shelter_04',      kind:'shelter',   pos:[ 18,   0,-28  ] },

  // ── 1987 coins. Seven in the world, the machine wants five. ────────────────
  { name:'int_coin_01', kind:'coin', pos:[ -6.4, 0.44,  4.6] },   // under a bench
  { name:'int_coin_02', kind:'coin', pos:[ 19.9, 0.06,-21.1] },   // dropped at the vending machines
  { name:'int_coin_03', kind:'coin', pos:[ 21.4, 0.06,-15.9] },   // beside the jukebox
  { name:'int_coin_04', kind:'coin', pos:[ 22.4, 0.06,  2.1] },   // in a stall
  { name:'int_coin_05', kind:'coin', pos:[-15.2, 0.90,-18.0] },   // riding the conveyor
  { name:'int_coin_06', kind:'coin', pos:[-23.0, 0.06, 11.4] },   // back of Lost & Found
  { name:'int_coin_07', kind:'coin', pos:[  0.8, 0.06,-21.6] },   // concourse, near the bay doors
];

/** The Attendant's route. He walks it in order, then back again. */
export const PATROL = [
  { name:'patrol_01', pos:[   0, 0,  10 ] },  // hall, by the front doors
  { name:'patrol_02', pos:[ -10, 0,   2 ] },  // west side of the hall
  { name:'patrol_03', pos:[ -16, 0,   9 ] },  // Lost & Found doorway
  { name:'patrol_04', pos:[ -10, 0,  -3 ] },
  { name:'patrol_05', pos:[   0, 0,  -9 ] },  // into the concourse
  { name:'patrol_06', pos:[  -8, 0, -17 ] },  // Baggage Claim
  { name:'patrol_07', pos:[ -20, 0, -20 ] },  // deep in the lockers
  { name:'patrol_08', pos:[  -8, 0, -17 ] },
  { name:'patrol_09', pos:[   0, 0, -21 ] },  // under the bay doors
  { name:'patrol_10', pos:[   9, 0, -18 ] },  // the diner
  { name:'patrol_11', pos:[  19, 0, -20 ] },
  { name:'patrol_12', pos:[   0, 0,  -9 ] },
  { name:'patrol_13', pos:[  10, 0,   2 ] },  // east side of the hall
  { name:'patrol_14', pos:[  18, 0,   3 ] },  // the restrooms
  { name:'patrol_15', pos:[  18, 0,  12 ] },  // Security
  { name:'patrol_16', pos:[  10, 0,  11 ] },
];

export const SPAWN_ATTENDANT = [ 0, 0, -20 ];

/** Where he stands from 3:00 on. Right in front of the only door out. */
export const BAY9 = [ 22, 0, -29.5 ];

/** Echoes. Fourteen passengers; these are the ones that sit in the slice. */
export const ECHOES = [
  { id:'e01', name:'the woman with the hatbox', pos:[ -7, 0,  1 ], rot: Math.PI,
    mutter:['I only closed my eyes for a minute.','They said the coast by morning.','Is that the time? Is that really the time?'] },
  { id:'e02', name:'the man in the work coat',  pos:[  7, 0,  5 ], rot: Math.PI,
    mutter:['Fourteen of us. I counted twice.','He stamped mine. I watched him do it.','Don’t let him stamp it twice.'] },
  { id:'e03', name:'the boy',                   pos:[  0, 0, -14], rot: 0,
    mutter:['My mum went to ask about the bus.','She’s coming back.','She’s been coming back for a while now.'],
    asks:true },
  { id:'e04', name:'the woman at Bay 9',        pos:[ 22, 0,-30 ], rot: Math.PI,
    mutter:['It idles all night and never leaves.','I gave him my ticket. That was the mistake.'] },
];
