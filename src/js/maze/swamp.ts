import {Maze} from './maze.js';
import {SWAMP_SCREENS, readScreen, write2d} from './spec.js';
import {Dir, Pos, Scr} from './types.js';
import {Random} from '../random.js';
import {Rom} from '../rom.js';
import {Location} from '../rom/location.js';
import {Monster} from '../rom/monster.js';
import {hex} from '../rom/util.js';

// TODO - add a spoiler argument and draw map into it?
export function shuffleSwamp(rom: Rom, random: Random, attempts = 100): void {
  // 1. Start by fixing up the swamp tiles (note: we could possibly wait on this).
  extendSwampScreens(rom);

  const swamp = rom.locations.Swamp;

  const w = swamp.width;
  const h = swamp.height;

  // TODO - if we wanted to use up some of the extra space (see notes/compression),
  // how would we signify this - i.e. we need to increase the upper bound on the
  // number of unique screens from 9 to 9+N.  Possibly this is an argument to the
  // consolidate() function?  Maybe it takes a list of tiles to consolidate with
  // the extra ones?
  const extraTiles = [SCR_U, SCR_D, SCR_UD, SCR_DR, SCR_URD, SCR_LR];
  const available = [0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x7b, 0x7d, 0x7e];

  // Collect the available screens (7c is boss room, 7f is solid)
  for (let attempt = 0; attempt < attempts; attempt) {
    const maze = new Maze(random, h, w, SWAMP_SCREENS, extraTiles);
    if (!tryShuffleSwamp(rom, random, swamp, maze, available)) continue;
    
    return;
  }
  console.error(`Failed to shuhffle swamp after ${attempts} attempts.`);
}


function tryShuffleSwamp(rom: Rom, random: Random, swamp: Location,
                         maze: Maze, available: number[]): boolean {
  const w = maze.width;
  const h = maze.height;

  // TODO - Allow other entrances?  Maybe read existing entrances
  // and respond to an earlier pass that shuffled it?
  const [boss, entrance] = (() => {
    let boss;
    let entrance;
    do {
      boss = random.nextInt(w);
      entrance = random.nextInt(h);
    } while (boss < 2 || entrance < 2);
    return [boss as Pos, (entrance << 4) as Pos];
  })();
  maze.setBorder(entrance, Dir.LEFT, 1);

  // Set up boundary, boss, and entrance
  maze.set(boss, 0xf1f0 as Scr, {force: true});
  maze.set((boss - 1) as Pos, 0x00f0 as Scr, {force: true});
  maze.set((boss + 1) as Pos, 0xf000 as Scr, {force: true});
  maze.fillAll({edge: 1});
  // for (let y = 0; y < h; y++) {
  //   for (let x = 0; x < w; x++) {
  //     const pos = (y << 4 | x) as Pos;
  //     if (pos === boss) {
  //     // } else if (pos === boss - 1) {
  //     //   maze.set(pos, 0x00f0 as Scr);
  //     // } else if (pos === boss + 1) {
  //     //   maze.set(pos, 0xf000 as Scr);
  //     } else {
  //       if (!maze.fill(pos, {edge: 1})) {
  //         throw new Error(`Could not initialize ${hex(pos)}`);
  //       }
  //     }
  //   }
  // }

  // Attempt to add w*h walls
  const entranceRoute = entrance << 8 | 0x10; // TODO - handle opposite sides?
  // const bossRoute = (boss + 16) << 8 | 0x01;
  function check(): boolean {
    const traversal = maze.traverse();
    const main = traversal.get(entranceRoute);
    return main && main.size === traversal.size || false;
    // return main && main.has(bossRoute) || false;
  }

  const allPos = [...maze].map(s => s[0]);
  for (let i = Math.floor(0.6 * w * h); i; i--) {
    const pos = random.pick(allPos);
    const dir = random.pick(Dir.ALL);
    const pos2 = Pos.plus(pos, dir);
    if (maze.isFixed(pos) || maze.isFixed(pos2) ||
        !(maze.get(pos)! & Dir.edgeMask(dir))) {
      i++; // try again
      continue;
    }
    maze.saveExcursion(() => {
      if (!maze.replaceEdge(pos, dir, 0)) return false;
      return !!(maze.get(pos) && maze.get(pos2) && check());
      //  || (() => { console.log(`failed\n${maze.show()}`); return false; })();
    });
    // console.log(maze.show());
  }

  // Need to consolidate.
  if (!maze.consolidate(available, check, rom)) return false;

  // Find a flaggable screen for the Oak entrance.
  const [oak, alt] = random.pick([...maze.alternates()]);
  if (alt != 0x1_0000) throw new Error(`unexpected alt: ${hex(alt)}`);
  maze.replace(oak, (maze.get(oak)! | alt) as Scr);

  // Set everything
  swamp.moveScreen(0x30, entrance);
  swamp.moveScreen(0x04, boss);
  maze.write(swamp, new Set());

  // console.log(maze.show());

  // Analyze screens
  const deadEnds = [];
  const bends = [];
  for (const [pos, scr] of maze) {
    if (pos === boss || pos === oak) continue;
    if (scr === 0x0001 || scr === 0x0010 || scr === 0x0100 || scr === 0x1000) {
      deadEnds.push(pos);
    }
    if (scr === 0x0011 || scr === 0x0110 || scr === 0x1100 || scr === 0x1001) {
      bends.push(pos);
    }
  }

  // Move oak exit - need to find the right spot.
    // for (let i = 0; i < 0xf; i++) {
    //   const screen = screens[i];
    //   if (screen == null) continue;
    //   const tiles = rom.screens[screen].tiles;
    //   for (let t = 0; t < 240; t++) {
    //     if (tiles[t] === 3 && tiles[t - 1] !== 3) exitScreens.set(i, t);
    //     if (tiles[t] === 0xf0) {
    //       let arr = puffSpots.get(i);
    //       if (!arr) puffSpots.set(i, arr = []);
    //       arr.push(t);
    //     }
    //   }
    // }

  const oakScreenTiles = rom.screens[swamp.screens[oak >> 4][oak & 0xf]].tiles;
  let oakTile = 0;
  for (let t = 0; t < 0xf0; t++) {
    if (oakScreenTiles[t] === 3) {
      oakTile = t;
      break;
    }
  }
  swamp.entrances[1].screen = oak;
  swamp.entrances[1].tile = oakTile + 0x11;
  for (let i = 0; i < 2; i++) {
    swamp.exits[5 + i].screen = oak;
    swamp.exits[5 + i].tile = oakTile + i;
  }

  // Place child in a dead end (if possible) or at least a bend
  const child = random.pick(deadEnds.length ? deadEnds : bends);
  swamp.spawns[1].screen = child;

  // Move monsters to reasonable places.
  const monsterPlacer = swamp.monsterPlacer(random);
  for (const spawn of swamp.spawns) {
    if (!spawn.isMonster()) continue;
    const monster = rom.objects[spawn.monsterId];
    if (!(monster instanceof Monster)) continue;
    const pos = monsterPlacer(monster);
    if (pos == null) {
      console.error(`no valid location for ${hex(monster.id)} in ${hex(swamp.id)}`);
      spawn.used = false;
      continue;
    } else {
      spawn.screen = pos >>> 8;
      spawn.tile = pos & 0xff;
    }
  }

  if (rom.spoiler) rom.spoiler.addMaze(swamp.id, swamp.name, maze.show());
  return true;
}

// open upward, dead end
const SCR_U = readScreen(
    `c8 c8 c8 c8 cf f6 c7 ad c4 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b8 b9 c3 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b7 b8 ad ad d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 c2 c3 b7 b8 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 c2 b7 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 ad ad b9 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 ad ad ad ad d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b9 b8 ad ad d2 e2 c8 c8 c8 c8
     c8 c8 c8 c8 e3 f6 c3 c3 b8 b6 d2 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 e3 fd ad ad fc e2 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 ff fb fb fa c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8`);
// open downward, dead end (door)
const SCR_D = readScreen(
    `c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 cd c9 c9 ca c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 cd eb a0 a0 cb ca c8 c8 c8 c8 c8
     c8 c8 c8 c8 cf a0 f9 f5 f7 f8 cb cc c8 c8 c8 c8
     c8 c8 c8 c8 cf a0 ed 08 09 a0 a0 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf db ee 0c 0b ef a0 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d0 d1 03 03 d8 db cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 c7 ad ad ae d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 ad b9 b7 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 c2 c3 c3 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 c5 c3 c3 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 c2 c3 c3 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b8 b6 b6 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b7 b7 b7 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b7 b7 b8 b6 d2 cc c8 c8 c8 c8`);
// vertical passage
const SCR_UD = readScreen(
    `c8 c8 c8 c8 cf d3 b6 b6 c6 b6 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 c3 c7 b6 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f5 c3 c7 b6 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 b6 c6 c5 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 b6 c6 c3 c7 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f5 c3 c3 c3 c3 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 ad c2 c3 c3 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 c4 c5 c3 c3 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f5 b7 b7 b8 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 c2 b8 b6 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 b6 c2 b7 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d9 b6 b6 b6 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b7 b7 b8 b6 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b9 b7 b7 b7 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 b7 b7 c7 b6 d2 cc c8 c8 c8 c8`);
// down-right openings (turn right), with door
const SCR_DR = readScreen(
    `c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 cd c9 c9 c9 c9 c9 c9 c9 c9 c9
     c8 c8 c8 c8 c8 cd a0 a0 a0 e8 04 a0 e8 a0 a0 e4
     c8 c8 c8 c8 cf f8 a0 f0 f1 f5 f5 f7 e9 f4 f7 e5
     c8 c8 c8 c8 cf f6 f7 f8 f2 ea 06 aa e9 f0 f1 e6
     c8 c8 c8 c8 cf a0 dd e0 f3 e0 07 0c ea db f3 e7
     c8 c8 c8 c8 cf db d5 d0 d1 d1 03 03 d0 d1 da da
     c8 c8 c8 c8 cf d5 af c4 c4 ad ad ad ad ad c4 ad
     c8 c8 c8 c8 cf d3 b9 c3 c3 b8 ad ad ad c2 b7 b8
     c8 c8 c8 c8 cf f6 c3 c3 c3 c3 b8 ad ad ad ad ad
     c8 c8 c8 c8 cf f6 c7 ad c2 c3 c7 fc fb fb fb fb
     c8 c8 c8 c8 cf d3 ad ad ad ad d6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b9 b8 ad b9 f6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf f6 c7 ad b9 c7 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 b9 c3 b8 d2 cc c8 c8 c8 c8`);
// up-down-right
const SCR_URD = readScreen(
    `c8 c8 c8 c8 cf d3 c4 c3 c3 c3 f7 f8 ca c8 c8 c8
     c8 c8 c8 c8 cf f5 c3 c3 c3 c3 f7 f7 a0 ca c9 c9
     c8 c8 c8 c8 cf f6 c3 c3 b8 b6 d2 cf cf e8 e4 a0
     c8 c8 c8 c8 cf f5 b7 c3 b7 b8 d2 f0 f1 e9 e5 cf
     c8 c8 c8 c8 cf d3 c2 b8 c2 b8 d8 db cf ea e6 cf
     c8 c8 c8 c8 cf d3 ad ad ad ad ae d4 f3 dd e7 cf
     c8 c8 c8 c8 cf d3 ad ad ad ad ad ae d0 d1 d0 d1
     c8 c8 c8 c8 cf d3 c2 c3 c3 b7 b8 ad ad ad ad ad
     c8 c8 c8 c8 cf d3 ad ad c2 b7 b7 b7 b8 c4 ad ad
     c8 c8 c8 c8 cf d3 ad ad b6 b9 b7 b7 b7 b7 b8 ad
     c8 c8 c8 c8 cf d3 ad c4 c3 b7 b8 fc fb fb fb fb
     c8 c8 c8 c8 cf d3 b6 ad ad ad d6 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 ad ad ad ad d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 c4 c3 b7 b8 d2 cc c8 c8 c8 c8
     c8 c8 c8 c8 cf d3 b6 b9 b7 b7 f6 cc c8 c8 c8 c8`);
// horizontal tunnel
const SCR_LR = readScreen(
    `c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9 c9
     a0 e4 e8 eb e4 a0 a0 a0 eb eb e8 f0 f1 a0 e4 a0
     a0 e5 e9 f9 f5 f6 f6 f7 ec f9 f7 f8 f2 a0 e5 a0
     a0 e6 f0 f1 e6 e0 08 09 ed de ea de f2 a0 e6 a0
     db e7 db f3 e7 e1 0c 0b dd df e0 df f3 db e7 e0
     d0 d1 da da d0 d1 03 03 d0 d1 d0 d1 da da da da
     ad c4 ad ad ad ad ad ad ad ad ad ad ad ad ad ad
     c2 c5 b8 c6 c4 c4 b9 c7 c4 c5 c5 c7 ad ad ad ad
     ad ad ad ad c2 c3 c3 c3 c3 c3 c7 ad ad ad ad ad
     fb fb fb fb fb fb fb fb fb fb fb fb fb fb fb fb
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8
     c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8 c8`);

export function extendSwampScreens(rom: Rom) {
  // Move up to 13 swamp tiles to the alternate palette
  // so that we can selectively open up different options for
  // the Oak entrance (or possibly hide other caves?)
  //  - Screens 76, 7a, 7b and then close up 7e.
  //  - Tiles   ac -> da; aa -> dc, e4, e5, e6, e7, f0, f1, f2, f3

  // for (let i = 0; i < 0xa; i++) {
  //   const screen = SWAMP_SCREENS[i];
  //   if (!screen) continue;
  //   rom.screens[0x80 | i].tiles = screen.split(/\s+/g).map(x => parseInt(x, 16));
  // }

  // Make a handful of removable tiles - defaults to CLOSED!
  const ts = rom.metatilesets.swamp;
  ts.getTile(0x03).copyFrom(0xda).setAlternative(0xac);
  ts.getTile(0x04).copyFrom(0xe4).setAlternative(0xaa);
  ts.getTile(0x05).copyFrom(0xe5).setAlternative(0xaa);
  ts.getTile(0x06).copyFrom(0xe6).setAlternative(0xaa);
  ts.getTile(0x07).copyFrom(0xe7).setAlternative(0xaa);
  ts.getTile(0x08).copyFrom(0xf0).setAlternative(0xaa);
  ts.getTile(0x09).copyFrom(0xf1).setAlternative(0xaa);
  ts.getTile(0x0a).copyFrom(0xf2).setAlternative(0xaa);
  ts.getTile(0x0b).copyFrom(0xf3).setAlternative(0xaa);
  ts.getTile(0x0c).copyFrom(0xdc).setAlternative(0xaa);
  ts.getTile(0x0d).copyFrom(0xdd).setAlternative(0xaa);

  // TODO - none of these should actually touch the screens...?
  //      - we could have a moveFrom primitive that does?

  // TODO - how to do modifications with new metascreen system?
  


  rom.swapMetatiles([0xa0],
                    [[0x03, 0xac], ~0xda],
                    [[0x04, 0xaa], ~0xe4],
                    [[0x05, 0xaa], ~0xe5],
                    [[0x06, 0xaa], ~0xe6],
                    [[0x07, 0xaa], ~0xe7],
                    [[0x08, 0xaa], ~0xf0],
                    [[0x09, 0xaa], ~0xf1],
                    [[0x0a, 0xaa], ~0xf2],
                    [[0x0b, 0xaa], ~0xf3],
                    [[0x0c, 0xaa], ~0xdc],
                    [[0x0d, 0xaa], ~0xdd]);

  // TODO - can we make the removables default closed?

  // Plug removable tiles into several of the screens.
  write2d(rom.screens[0x7f].tiles, 0x00, [ // solid block - add left column
    [0xa8, 0xcc], // 0
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xa8, 0xcc],
    [0xd2, 0xcc], // 9
    [0xd2, 0xcc],
    [0xd2, 0xcc],
    [0xd2, 0xe2], // c
    [0xe2, 0xc8], // d
  ]);

  write2d(rom.screens[0x76].tiles, 0x4c, [ // left dead end - add optional door
    [0x08, 0x09], // f0 f1
    [0x0c, 0x0b], // dc f3
    [0x03, 0x03], // da da
  ]);

  write2d(rom.screens[0x7a].tiles, 0x25, [ // tee - add an optional door
    [    ,     , 0x04], //       e4
    [0x08, 0x09, 0x05], // f0 f1 e5
    [    , 0x0a, 0x06], //    f2 e6
    [    , 0x0b, 0x07], //    f3 e7
    [    , 0x03, 0x03], //    da da
  ]);

  write2d(rom.screens[0x7b].tiles, 0x24, [ // right dead end - add optional door
    [0x04      ], // e4
    [          ], //
    [0x06      ], // e6
    [0x07, 0x0d], // e7 dd
    [0x03, 0x03], // da da
  ]);

  write2d(rom.screens[0x7e].tiles, 0x47, [ // down/left - existing door optional
    [0x08, 0x09], // f0 f1
    [0x0c, 0x0b], // dc f3
    [0x03, 0x03], // da da
  ]);
}
