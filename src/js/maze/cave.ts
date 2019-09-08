import {Dir, Maze, Pos, Scr, Spec, Stair,
        bridge, poi, wall, write} from './maze.js';
import {Random} from '../random.js';
//import {Rom} from '../rom.js';
import {Location, Entrance, Exit} from '../rom/location.js';
//import {Monster} from '../rom/monster.js';
import {hex, seq} from '../rom/util.js';
import {iters, Multiset, DefaultMap} from '../util.js';
import { Monster } from '../rom/monster.js';

const [] = [write];

// invariants for shuffling caves:
//  - dead ends
//  - doors (types/directions)
//  - walls (number, not necessarily direction)
//  - "big rooms"
//  - treasure chests, etc.

// Exit types:
//  0: blocked
//  1: normal narrow passage
//  2: wide passage
//  3: river
//  4: spikes
//  6: narrow exit
//  7: blocked next to wide room

interface EntranceSpec {
  // entrance.coord
  entrance: number;
  // exit.tile
  exits: number[];
}
const EDGE_TYPES: {[edge: number]: {[dir: number]: EntranceSpec}} = {
  1: {
    [Dir.DOWN]: {
      // NOTE: These are incorrect for non-vertical-scrolling screens...
      // That case needs to move up by two tiles for the HUD.  We correct
      // for this case in Location.prototype.write.
      entrance: 0xdf80,
      exits: [0xe6, 0xe7, 0xe8, 0xe9],
    },
    [Dir.UP]: {
      // NOTE: again, for single-height screens these need to move UP
      // a single tile, to 2080 and 16..19
      entrance: 0x3080,
      exits: [0x26, 0x27, 0x28, 0x29],
    },
  },
  6: {
    [Dir.DOWN]: {
      entrance: 0xdf80,
      exits: [0xe7, 0xe8],
    },
    [Dir.UP]: {
      entrance: 0x3080,
      exits: [0x27, 0x28],
    },
  },
};

const BASIC_SCREENS = [
  // Normal cave screens
  Spec(0x0_0000, 0x80, ' '),
  Spec(0x0_0101, 0x81, '│', 0x2a, poi(4)),
  Spec(0x0_1010, 0x82, '─', 0x6e, poi(4)),
  Spec(0x0_0110, 0x83, '┌', 0xae, poi(2)),
  Spec(0x0_1100, 0x84, '┐', 0x6a, poi(2)),
  Spec(0x0_0011, 0x85, '└', 0x2e, poi(2)),
  Spec(0x0_1001, 0x86, '┘', 0x26, poi(2)),
  Spec(0x0_0111, 0x87, '├', 0x2ae, poi(3)),
  Spec(0x0_1111, 0x88, '┼', 0x26ae, poi(3)),
  Spec(0x0_1101, 0x89, '┤', 0x26a, poi(3)),
  Spec(0x0_1110, 0x8a, '┬', 0x6ae, poi(3)),
  Spec(0x0_1011, 0x8b, '┴', 0x26e, poi(3)),

  // Doors, walls, dead ends, etc
  Spec(0x2_0101, 0x8c, '┋', 0x2a), // full-screen stair hallway
  Spec(0x10_0101, 0x8d, '╫', 'fixed', 0x2a), // over bridge
  Spec(0x10_1010, 0x8e, '╫', 'fixed', 0x6e), // under bridge
  Spec(0x1_0101, 0x8f, '┆', wall(0x87, [0x2, 0xa])),
  Spec(0x1_1010, 0x90, '┄', wall(0x67, [0x2, 0xa])),
  Spec(0x1_1011, 0x94, '┸'/*┴*/, wall(0x37, [0x2, 0x6e])),
  Spec(0x2_1010, 0x95, '┸', 0x6e, Stair.up(0x40_80, 0x37)),
  Spec(0x1_1000, 0x96, '┚', 0x6, Stair.up(0x40_30, 0x32)),
  Spec(0x2_1000, 0x97, '┒', 0x6, Stair.down(0xaf_30, 0xb2)),
  Spec(0x1_0010, 0x98, '┖', 0xe, Stair.up(0x40_d0, 0x3c)),
  Spec(0x2_0010, 0x99, '┎', 0xe, Stair.down(0xaf_d0, 0xbc)),
  Spec(0x2_0001, 0x9a, '╹', 0x2, Stair.down(0x1f_80, 0x27)),
  Spec(0x2_0100, 0x9a, '╻', 0xa, Stair.up(0xd0_80, 0xc7)),
  Spec(0x4_0101, 0x9b, ' ', 0x2, 0xa), // vertical dead ends
  Spec(0x0_0001, 0x9b, '╵', 0x2, poi(0, -0x30, 0x78)), // vertical dead end
  Spec(0x0_0100, 0x9b, '╷', 0xa, poi(0, 0x110, 0x78)), // vertical dead end
  Spec(0x4_1010, 0x9c, ' ', 0x6, 0xe), // horizontal dead ends
  Spec(0x0_0010, 0x9c, '╶', 0xe, poi(0, 0x70, 0x108)), // horizontal dead end
  Spec(0x0_1000, 0x9c, '╴', 0x6, poi(0, 0x70, -0x28)), // horizontal dead end
  Spec(0x0_0601, 0x9e, '╽', 0x2a), // narrow bottom entrance
] as const;

const BOSS_SCREENS = [
  Spec(0x0_7176, 0x91, '╤', 'fixed', 0x2a, poi(1, 0x60, 0x78)),
  Spec(0x1_7176, 0x92, '╤', 'fixed',
       wall(0x27, [0x2, 0xa]), poi(1, 0x60, 0x78)),
  Spec(0x0_0070, 0x80, '╘'), // empty spot to left of boss room
  Spec(0x0_7000, 0x80, '╛'), // empty spot to right of boss room
  // TODO - f9... for various more boss rooms (but non-cave)
] as const;

const RIVER_SCREENS = [
  Spec(0x0_3333, 0xd3, '╬', 0x15, 0x3d,
       bridge(0xb6, [0x79, 0xbf]), poi(4, 0x00, 0x98)),
  Spec(0x0_0303, 0xd4, '║', 0x19, 0x3b),
  Spec(0x0_3030, 0xd5, '═', 0x5d, 0x7f),
  Spec(0x1_0303, 0xd6, '║', bridge(0x87, [0x19, 0x3b])),
  Spec(0x1_3030, 0xd7, '═', bridge(0x86, [0x5d, 0x7f])),
  Spec(0x0_0330, 0xd8, '╔', 0x9d, 0xbf),
  Spec(0x0_3300, 0xd9, '╗', 0x5b, 0x79),
  Spec(0x0_0033, 0xda, '╚', 0x1f, 0x3d),
  Spec(0x0_3003, 0xdb, '╝', 0x15, 0x37),
  Spec(0x0_3031, 0xdc, '╧', 0x25d, 0x7f),
  Spec(0x0_3130, 0xdd, '╤', 0x5d, 0x7af),
  Spec(0x0_1303, 0xde, '╢', 0x169, 0x3b),
  Spec(0x0_0313, 0xdf, '╟', 0x19, 0x3be),
  Spec(0x8_0303, 0xf0, ' ', 0x1, 0x3, 0x9, 0xb), // vertical dead ends
  Spec(0x0_0003, 0xf0, ' ', 0x1, 0x3, // vertical dead end
       poi(1, -0x30, 0x48), poi(1, -0x30, 0x98)),
  Spec(0x0_0300, 0xf0, ' ', 0x9, 0xb, // vertical dead end
       poi(1, 0x110, 0x48), poi(1, 0x110, 0x98)),
  Spec(0x8_3030, 0xf1, ' ', 0x5, 0x7, 0xd, 0xf), // horizontal dead ends
  Spec(0x0_0030, 0xf1, ' ', 0xd, 0xf, // horizontal dead end
       poi(1, 0x60, 0x108), poi(1, 0xa0, 0x108)),
  Spec(0x0_3000, 0xf1, ' ', 0x5, 0x7, // horizontal dead end
       poi(1, 0x60, -0x28), poi(1, 0xa0, -0x28)),
  Spec(0x0_0003, 0xf2, '╨', bridge(0x17, [0x1, 0x3])), // top/bottom bridge (top)
  Spec(0x0_0300, 0xf2, '╥', bridge(0xc6, [0x9, 0xb])), // top/bottom bridge (bot)
  Spec(0x0_3330, 0xf3, '╦', 0x5d, 0x79, 0xbf),
  Spec(0x0_3033, 0xf4, '╩', 0x15, 0x3d, 0x7f),
  Spec(0x2_0303, 0xf5, '╠', 0x19, 0x3, 0xb, // notched vertical hall
       poi(1, 0xc0, 0x98), poi(1, 0x40, 0x98)),
  Spec(0x4_0303, 0xf6, '╣', 0x1, 0x9, 0x3b, // notched vertical hall
       poi(1, 0xb0, 0x48), poi(1, 0x30, 0x48)),
] as const;

const WIDE_SCREENS = [
  Spec(0x0_0002, 0x71, '┻', 0x2, Stair.down(0xcf_80, 0xd7)),
  Spec(0x0_0202, 0x72, '┃', 0x2a),
  Spec(0x0_0012, 0xe0, '┖', 0x2e),
  Spec(0x0_1002, 0xe1, '┚', 0x26),
  Spec(0x0_1200, 0xe2, '┒', 0x6a),
  Spec(0x0_0210, 0xe3, '┎', 0xae),
  Spec(0x0_1212, 0xe6, '╂', 0x26ae),
  Spec(0x0_1012, 0xe7, '┸', 0x26e),
  Spec(0x0_1210, 0xe8, '┰', 0x6ae),
  Spec(0x0_0201, 0xe9, '╽', wall(0x37, [0x2, 0xa])),
] as const;

const PIT_SCREENS = [
  Spec(0x8_1010, 0xeb, '┈', 'pit', 0x6e),
  Spec(0x8_0101, 0xec, '┊', 'pit', 0x2a),
] as const;

const SPIKE_SCREENS = [
  Spec(0x0_0104, 0xed, '╿', 0x2a),
  Spec(0x0_0401, 0xee, '╽', 0x2a),
  Spec(0x0_1414, 0xef, '╂', 0x26ae),
  Spec(0x0_0404, 0xf7, '┃', 0x2a),
] as const;

const ALL_SCREENS = [BASIC_SCREENS, BOSS_SCREENS, RIVER_SCREENS,
                     WIDE_SCREENS, PIT_SCREENS, SPIKE_SCREENS];

// Maps a 4-bit mask to a count
const BITCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;
// Masks (1=up, 2=right, 4=down, 8=left) by tile
const EDGES_BY_TILE = new Map<number, number>();
// tile << 8 | YX (tile) for entrance => dir
const STAIRS_BY_TILE = new Map<number, Dir>();
// Which tiles have walls
const WALLS = new Set<number>();
// Which tiles are fixed
const FIXED_TILES = new Map<number, Spec>();

// Dead end tiles.
const DEAD_ENDS = new Set([0x9b, 0x9c, 0xf0, 0xf1]);
// Stair screens.
const STAIR_SCREENS = new Map<Scr, readonly [Dir, EntranceSpec]>();

// TODO - do a single top-level for-loop to populate these!
for (const spec of iters.concat(...ALL_SCREENS)) {
  for (const dir of Dir.ALL) {
    const edge = (spec.edges >> Dir.shift(dir)) & 0xf;
    if (edge && (edge & 7) != 7) {
      EDGES_BY_TILE.set(spec.tile,
                        (EDGES_BY_TILE.get(spec.tile) || 0) | (1 << dir));
    }
  }
  for (const stair of spec.stairs) {
    const pos = (stair.entrance & 0xf000) >> 8 | (stair.entrance & 0xf0) >> 4;
    STAIRS_BY_TILE.set(spec.tile << 8 | pos, stair.dir);
    STAIR_SCREENS.set(spec.edges, [
      stair.dir,
      {entrance: stair.entrance, exits: [stair.exit, stair.exit + 1]}]);
  }
  if (spec.wall) WALLS.add(spec.tile);
  if (spec.tile != 0x80 && spec.fixed) FIXED_TILES.set(spec.tile, spec);
}

// function exitCount(tile: number): number {
//   return BITCOUNT[EDGES_BY_TILE.get(tile) || 0];
// }

function detectScreenSet(loc: Location): Spec[] {
  const out: Spec[] = [];
  const screens = new Set(([] as number[]).concat(...loc.screens));
  // NOTE: no bridges yet.
  for (const set of ALL_SCREENS) {
    for (const scr of set) {
      if (scr.tile === 0x80) continue;
      if (screens.has(scr.tile)) {
        out.push(...set);
        break;
      }
    }
  }
  return out;
}

interface ExitSpec {
  entrance: number; // index into the entrance table
  exit: number; // location << 8 | target
  dir: Dir; // 0 (up) or 2 (down)
}  

interface Survey {
  size: number;
  deadEnds: number;
  branches: number;
  stairs: Map<Pos, ExitSpec>;
  walls: number;
  edges: Map<Pos, ExitSpec>;
  fixed: Map<Pos, Spec>;
  tiles: Multiset<number>;
}
function surveyMap(loc: Location): Survey {
  let size = 0;
  let deadEnds = 0;
  let branches = 0;
  let walls = 0;
  const stairs = new Map<Pos, ExitSpec>();
  const edges = new Map<Pos, ExitSpec>();
  const fixed = new Map<Pos, Spec>();
  const tiles = new Multiset<number>();

  // Set of Pos values of reachable screens.  Allows removing the
  // "wrong side" of bridges.
  const reachable =
      new Set([...loc.reachableTiles(true).keys()].map(t => t >>> 8));

  for (let i = 0; i < loc.entrances.length; i++) {
    const entrance = loc.entrances[i];
    const scr = loc.screens[entrance.screen >>> 4][entrance.screen & 0xf];
    const dir = STAIRS_BY_TILE.get(scr << 8 | entrance.tile);
    if (dir != null) {
      stairs.set(entrance.screen as Pos,
                 {entrance: i, exit: findExit(i), dir});
    }
  }
  for (let y = 0; y < loc.height; y++) {
    let edgeMask = 0;
    if (!y) edgeMask |= 1;
    if (y === loc.height - 1) edgeMask |= 4;
    for (let x = 0; x < loc.width; x++) {
      const pos = (y << 4 | x) as Pos;
      if (!reachable.has(pos)) continue;
      edgeMask &= ~0xa;
      if (!x) edgeMask |= 8;
      if (x === loc.width - 1) edgeMask |= 2;
      const tile = loc.screens[y][x];
      tiles.add(tile);
      if (tile === 0x80) continue;
      size++;
      // Look for exits on the edge of the map
      let edgeExits = EDGES_BY_TILE.get(tile)
      if (edgeExits == null) throw new Error(`Bad tile: ${hex(tile)}`);
      // NOTE: special-case the two-stair and dead-end cases.
      let edgeCount = BITCOUNT[edgeExits] + (stairs.has(pos) ? 1 : 0);
      if (tile === 0x9a) edgeCount = 2;
      if (tile === 0x9b || tile == 0x9c || tile == 0xf0 || tile == 0xf1) {
        edgeCount = 1;
      }
      if (edgeCount === 1) deadEnds++;
      if (edgeCount > 2) branches += (edgeCount - 2);
      if (WALLS.has(tile)) walls++;
      let fixedScr = FIXED_TILES.get(tile);
      if (DEAD_ENDS.has(tile)) edgeExits = 0;
      for (const dir of Dir.ALL) {
        if (edgeExits & edgeMask & (1 << dir)) {
          let entrance = null;
          for (let i = 0; i < loc.entrances.length; i++) {
            if (loc.entrances[i].screen === pos &&
                matchesDir(loc.entrances[i].tile, dir)) {
              entrance = i;
              break;
            }
          }
          if (entrance == null) continue;
          //if (entrance == null) throw new Error(`Could not find entrance for edge`);
          //const entrancePos = loc.entrances[entrance];
          const exit = findExit(entrance);
          edges.set(pos, {entrance, exit, dir});
        }
      }
      if (fixedScr != null) fixed.set(pos, fixedScr);
    }
  }
  return {size, deadEnds, branches, walls, stairs, edges, fixed, tiles};

  function findExit(entranceNum: number): number {
    const entrance = loc.entrances[entranceNum];
    for (const e of loc.exits) {
      if (Math.abs(e.x - entrance.x) < 20 &&
          Math.abs(e.y - entrance.y) < 20) {
        return e.dest << 8 | e.entrance;
      }
    }
    throw new Error(`Could not find exit for given entrance`);
  }
}

function matchesDir(tile: number, dir: Dir): boolean {
  if (dir === 0) return (tile >>> 4) < 0x4;
  if (dir === 1) return (tile & 0xf) > 0xd;
  if (dir === 2) return (tile >>> 4) > 0xc;
  if (dir === 3) return (tile & 0xf) < 0x2;
  return false;
}

export function shuffleBridgeCave(upper: Location, lower: Location,
                                  random: Random, {attempts = 100} = {}) {
  // TODO - doesn't work yet.

  // Plan - shuffle the first one normally, then find displacement and
  // set the initial displacement for the lower screen accordingly.
  //      - need to mark the correct stairs as fixed (and fix up how we
  //        handle fixed in general).

  shuffleCave(upper, random, {attempts});
  shuffleCave(lower, random, {attempts});
}

interface ShuffleCaveOptions {
  attempts?: number;
  check?: (maze: Maze) => boolean;
  allowTightCycles?: boolean;
}

function defaultCheck(maze: Maze): boolean {
  const traverse = maze.traverse();
  return traverse.size > 2 &&
      traverse[Symbol.iterator]().next().value[1].size === traverse.size;
  // TODO - must have at least one non-dead-end tile???
}

export function shuffleCave(loc: Location, random: Random,
                            opts: ShuffleCaveOptions = {}): void {
  let {
    attempts = 50,
    check = defaultCheck,
  } = opts;

  if (loc.id === 0x27) check = cycleCaveCheck; //tornadoBraceletCaveCheck;
  if (loc.id === 0x4b) opts.allowTightCycles = true;
  if (loc.id === 0x4b || loc.id === 0x54) check = cycleCaveCheck;

  // Want a general-purpose algorithm.
  // Analyze the current location.
  const screens = detectScreenSet(loc);
  const w0 = loc.width;
  const h0 = loc.height;
  //const sizeDiff = random.nextInt(4);
  const w = Math.min(w0 + 1/*(sizeDiff & 1)*/, 8);
  const h = Math.min(h0 + 1/*(sizeDiff >>> 1)*/, 16);
  const allPos = seq(w * h, yx => ((yx % w) | Math.floor(yx / w) << 4) as Pos);

  // Count entrances and exits.
  const survey = surveyMap(loc);
  const density = survey.size / w / h;

  let tryShuffle: (maze: Maze) => boolean;

  if ((false as any) && !survey.branches) {
    tryShuffle = tryShuffleNoBranch;
  } else {
    tryShuffle = tryShuffleCave;
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Grow the width/height just a little.  We still try to keep roughly
    // the same number of screens, so we may not use the full size, but
    // it's here in case it helps.
    //const maze = new Maze(random, h0 + 2, Math.min(8, w0 + 2), screens);

    const maze = new Maze(random, h, w, screens);
    if (tryShuffle(maze)) return;
  }

  function tryShuffleNoBranch(maze: Maze): boolean {
    if (survey.tiles.count(0x91) || survey.tiles.count(0x92)) {
      throw new Error(`Cannot handle tile`);
    }

    // Basic plan: make a list of screens, which include turns, straights,
    // and fixed screens.
    let {size, walls} = survey;
    const [] = [walls];

    // We need at most two exits, at most one can be an edge.
    const edgeCount = survey.edges.size;
    const stairCount = survey.stairs.size;
    const exitCount = edgeCount + stairCount;
    if (edgeCount > 1) throw new Error(`too many edges: ${edgeCount}`);
    if (exitCount > 2) throw new Error(`too many exits: ${exitCount}`);

    let start: Pos;
    let entranceEdges: number;
    let target: ExitSpec | undefined;

    // Place the first tile.
    const stairs = [...survey.stairs.values()];
    if (edgeCount) {
      const [edge] = [...survey.edges.values()];
      start = randomEdge(edge.dir);
      maze.setBorder(start, edge.dir, 6);
      if (!maze.fill(start, {maxExits: 2})) return fail('entrance edge fill');
      entranceEdges = maze.get(start)! & ~Dir.edgeMask(edge.dir) & 0xffff;
      target = stairs[0];
    } else {
      // start with a stair
      start = maze.randomPos();
      if (!maze.fill(start, {maxExits: 1, stair: stairs[0].dir})) {
        return fail('entrance stair fill');
      }
      entranceEdges = maze.get(start)! & 0xffff;
      target = stairs[1];
    }    

    // Figure out start direction
    let startDir = 0 as Dir;
    for (; startDir < 4; startDir++) {
      if (entranceEdges & Dir.edgeMask(startDir)) break;
    }
    if (startDir === 4) return fail('no edge exit');

    // Make up a path
    type Turn = -1 | 0 | 1;
    function turn(): Turn { return (random.nextInt(3) - 1) as Turn; }
    const path = seq(size - 2 + random.nextInt(2), turn);
    const finalOpts = target ? {stair: target.dir} : {};
    if (!maze.fillPathToDeadEnd(start, startDir, path[Symbol.iterator](),
                                {edge: 1}, finalOpts)) {
      return fail(`could not fill path: ${path}`);
    }

    // Add in [fixed screens], stair halls/bridges, and walls (respectively).

    // TODO - flesh this out LATER, for now don't worry about non-branching.

    // for (const tile of [0x8c]) { // , 0x8d, 0x8e]) {
    //   if (survey.tiles.count(tile)) {
    //     const steps = random.shuffle(alts.filter(x => x[3].tile === tile));
    //     if (steps.length < survey.tiles.count(tile)) {
    //       return fail(`could not add stair hallway`);
    //     }
    //     for (let i = survey.tiles.count(tile) - 1; i >= 0; i--) {
    //       maze.replace(steps[i][0], steps[i][2]);
    //       replaced.add(steps[i][0]);
    //     }
    //   }
    // }

    // console.log(`done\n${maze.show()}`);
    if (loc.rom.spoiler) loc.rom.spoiler.addMaze(loc.id, loc.name, maze.show());
    return true;
  }


  function tryShuffleCave(maze: Maze): boolean {

    // Initial setup: add points of interest, then fill map with 1's as much
    // as possible.

    let {walls} = survey;
    const fixed = new Set<Pos>();
    for (const [pos0, edge] of survey.edges) {
      while (true) {
        const pos = randomEdge(edge.dir);
        if (fixed.has(pos)) continue;
        fixed.add(pos);
        const fixedScr = survey.fixed.get(pos0);
        if (fixedScr == null) {
          maze.setBorder(pos, edge.dir, 6);
        } else {
          // NOTE: location 35 (sabre N summit prison) has a '1' exit edge
          maze.setBorder(pos, edge.dir,
                         (fixedScr.edges >>> Dir.shift(edge.dir)) & 0xf);
          fixBorders(maze, pos, fixedScr.edges);
          maze.set(pos, fixedScr.edges);
          if (fixedScr.wall) walls--;
        }
        break;
      }
    }

    for (const [pos0, scr] of survey.fixed) {
      if (survey.edges.has(pos0)) continue;
      for (const pos of random.ishuffle(allPos)) {
        if (fixed.has(pos)) continue;
        const ok = maze.saveExcursion(() => {
          fixBorders(maze, pos, scr.edges);
          return maze.trySet(pos, scr.edges);
        });
        if (!ok) continue;
        fixed.add(pos);
        if (scr.wall) walls--;
        break;
      }
    }

    const stairs = [...survey.stairs.values()];
    let tries = 0;
    for (let i = 0; tries < 10 && i < stairs.length; tries++) {
      const pos = maze.randomPos();
      if (fixed.has(pos)) continue;
      if (!maze.fill(pos, {stair: stairs[i].dir})) continue;
      fixed.add(pos);
      // console.log(`Added ${stairs[i].dir} stair at ${hex(pos)}`);
      tries = 0;
      i++;
    }
    if (tries >= 10) return fail(`could not add all stairs`);
    // fill the edge screens and fixed screens and their neighbors first, since
    // they tend to have more esoteric requirements.

    const fillOpts = {
      edge: 1,
      fuzzy: 1,
      shuffleOrder: true,
      skipAlternates: true,
    };
    if (!maze.fillAll(fillOpts)) return fail(`could not fill open`);

    // console.log(`initial:\n${maze.show()}`);
    if (!check(maze)) return fail(`check failed after initial setup`);

    const empty = 0 as Scr;
    const opts2 = {skipAlternates: true};
    for (const [pos] of random.shuffle([...maze])) {
      if (maze.density() <= density) break;
      if (!maze.isFixed(pos)) {
        const changed =
            maze.saveExcursion(
                () => maze.setAndUpdate(pos, empty, opts2) && check(maze));
        if (changed) continue;
      }
    }

    // console.log(`percolated:\n${maze.show()}`);

    // Remove any tight cycles
    if (!opts.allowTightCycles) {
      for (let y = 1; y < h; y++) {
        for (let x = 1; x < w; x++) {
          const pos = (y << 4 | x) as Pos;
          if (!isTightCycle(maze, pos)) continue;
          // remove the tight cycle
          let replaced = false;
          for (const dir of random.ishuffle(Dir.ALL)) {
            // TODO - this will need to change if we invert the direction!
            const pos2 = (dir < 2 ? pos - 1 : pos - 16) as Pos;
            const ok =
                maze.saveExcursion(
                    () => maze.replaceEdge(pos2, dir, 0) && check(maze));
            if (!ok) continue;
            replaced = true;
          }
          if (!replaced) return fail(`failed to remove tight cycle`);
        }
      }
    }

    // Add stair hallways and walls
    //   TODO - make sure they're on *a* critical path?
    {
      const replaced = new Set<Pos>();
      const alts = [...maze.alternates()];
      for (const tile of [0x8c]) { // , 0x8d, 0x8e]) {
        if (survey.tiles.count(tile)) {
          const steps = random.shuffle(alts.filter(x => x[3].tile === tile));
          if (steps.length < survey.tiles.count(tile)) {
            return fail(`could not add stair hallway`);
          }
          for (let i = survey.tiles.count(tile) - 1; i >= 0; i--) {
            maze.replace(steps[i][0], steps[i][2]);
            replaced.add(steps[i][0]);
          }
        }
      }
      const wallScreens = random.shuffle(alts.filter(x => x[3].wall));
      for (let i = 0; i < walls; i++) {
        const scr = wallScreens.pop();
        if (scr == null) return fail(`could not add wall ${i}`);
        if (replaced.has(scr[0])) {
          i--;
          continue;
        }
        maze.replace(scr[0], scr[2]);
        replaced.add(scr[0]);
      }
    }

    return finish(maze);
  }

  function finish(maze: Maze): boolean {
    maze.trim();
    //console.log(`final:\n${maze.show()}`);
    maze.write(loc, new Set());

    // Map from priority to array of [y, x] pixel coords
    const poi =
        new DefaultMap<number, Array<readonly [number, number]>>(() => []);

    // Write back to the location.  Exits, entrances, npcs, triggers,
    // monsters, and chests must all be mapped to new locations.

    const posMapping = new Map<Pos, Pos>();
    const fixedPos = new DefaultMap<Scr, Pos[]>(() => []);
    for (const [pos, scr] of maze) {
      const spec = maze.getSpec(pos)!;
      if (spec.fixed) fixedPos.get(scr).push(pos);
      for (const {priority, dy, dx} of spec.poi) {
        poi.get(priority)
            .push([((pos & 0xf0) << 4) + dy, ((pos & 0xf) << 8) + dx]);
      }
    }
    for (const [pos0, spec] of survey.fixed) {
      const pos = random.shuffle(fixedPos.get(spec.edges)).pop();
      if (pos == null) throw new Error(`Unreplaced fixed screen`);
      posMapping.set(pos0, pos);
    }

    // First work on entrances, exits, and NPCs.
    // loc.entrances = [];
    loc.exits = [];
    //const mover = loc.screenMover(); // only handle spawns?
    const allEdges: Array<Array<Pos>> = [[], [], [], []];
    // separate array for edges of fixed screens
    const fixedEdges: Array<Array<Pos>> = [[], [], [], []];
    for (const dir of Dir.ALL) {
      for (const pos of Dir.allEdge(dir, maze.height, maze.width)) {
        const scr = maze.get(pos);
        if (!scr) continue;
        const edgeType = Scr.edge(scr, dir);
        if (edgeType && edgeType != 7) {
          if (FIXED_TILES.has(loc.screens[pos >> 4][pos & 0xf])) {
            fixedEdges[dir].push(pos);
          } else {
            allEdges[dir].push(pos);
          }
        }
      }
      random.shuffle(allEdges[dir]);
      random.shuffle(fixedEdges[dir]);
    };
    const allStairs: Array<Array<readonly [Pos, EntranceSpec]>> =
        [[], [], [], []]; // NOTE: 1 and 3 unused
    for (const [pos, scr] of maze) {
      // TODO - should no longer need STAIR_SCREENS w/ Maze#getSpec
      const dir = STAIR_SCREENS.get(scr);
      if (dir != null) allStairs[dir[0]].push([pos, dir[1]]);
    }
    random.shuffle(allStairs[Dir.UP]);
    random.shuffle(allStairs[Dir.DOWN]);
    for (const [pos0, exit] of survey.edges) {
      const edgeList = survey.fixed.has(pos0) ? fixedEdges : allEdges;
      const edge: Pos | undefined = edgeList[exit.dir].pop();
      if (edge == null) throw new Error('missing edge');
      posMapping.set(pos0, edge);
      //mover(pos0, edge); // move spawns??
      const edgeType = Scr.edge(maze.get(edge)!, exit.dir);
      const edgeData = EDGE_TYPES[edgeType][exit.dir];
      loc.entrances[exit.entrance] =
          Entrance.of({screen: edge, coord: edgeData.entrance});
      for (const tile of edgeData.exits) {
        loc.exits.push(
            Exit.of({screen: edge, tile,
                     dest: exit.exit >>> 8, entrance: exit.exit & 0xff}));
      }
    }
    const stairDisplacements = new Map<Pos, [number, number]>();
    for (const [pos0, exit] of survey.stairs) {
      const stair: readonly [Pos, EntranceSpec] | undefined =
          allStairs[exit.dir].pop();
      if (stair == null) throw new Error('missing stair');
      posMapping.set(pos0, stair[0]);
      const entrance = loc.entrances[exit.entrance];
      const x0 = entrance.tile & 0xf;
      const y0 = entrance.tile >>> 4;
      entrance.screen = stair[0];
      entrance.coord = stair[1].entrance;
      const x1 = entrance.tile & 0xf;
      const y1 = entrance.tile >>> 4;
      stairDisplacements.set(pos0, [y1 - y0, x1 - x0]);
      for (const tile of stair[1].exits) {
        loc.exits.push(Exit.of({
          screen: stair[0], tile,
          dest: exit.exit >>> 8, entrance: exit.exit & 0xff}));
      }
    }

    // Move other NPCs.  Wall spawns have already been handled.
    const spawnMap = new Map<number, number>(); // map of old -> new yyyxxx
    const monsterPlacer = loc.monsterPlacer(random);
    for (const spawn of loc.spawns) {
      // Walls already moved (by maze#write).
      if (spawn.type === 3) continue;
      if (spawn.isMonster()) {
        const monster = loc.rom.objects[spawn.monsterId];
        if (!(monster instanceof Monster)) continue;
        const pos = monsterPlacer(monster);
        if (pos == null) {
          console.error(`no valid location for ${hex(monster.id)} in ${hex(loc.id)}`);
          spawn.used = false;
          continue;
        } else {
          spawn.screen = pos >>> 8;
          spawn.tile = pos & 0xff;
        }
        continue;
      }
      const pos0 = spawn.screen as Pos;
      const mapped = posMapping.get(pos0);
      const sameSpawn = spawnMap.get(spawn.y << 12 | spawn.x);
      if (sameSpawn != null) {
        spawn.y = sameSpawn >>> 12;
        spawn.x = sameSpawn & 0xfff;
      } else if (mapped != null) {
        spawn.screen = mapped;
        // If the remapping was a stairs, then we may have more work to do...
        const displacement = stairDisplacements.get(pos0);
        if (displacement != null) {
          const [dy, dx] = displacement;
          spawn.yt += dy;
          spawn.xt += dx;
        }
      } else if (spawn.isTrigger()) {
        // Can't move triggers, need a way to handle them.
        if (spawn.id === 0x8c) {
          // Handle leaf abduction trigger behind zebu
          spawn.screen = posMapping.get(0x21 as Pos)! - 16;
        } else {
          console.error(`unhandled trigger: ${spawn.id}`);
        }
      } else {
        // NPCs, chests - pick a POI
        const keys = [...poi.keys()].sort((a, b) => a - b);
        if (!keys.length) throw new Error(`no poi`);
        for (const key of keys) {
          const displacements = poi.get(key)!;
          if (!displacements.length) continue;
          const oldSpawn = spawn.y << 12 | spawn.x;
          const i = random.nextInt(displacements.length);
          [[spawn.y, spawn.x]] = displacements.splice(i, 1);
          spawnMap.set(oldSpawn, spawn.y << 12 | spawn.x);
          if (!displacements.length) poi.delete(key);
          break;
        }
      }      
    }



    // walls, NPCs, triggers, chests, monsters...?


      // TODO - random things like triggers (summit cave, zebu cave), npcs?

    // TODO - need to actually fill in exits, stairs, monsters, chests
    // TODO - extend out any additional needed dead-ends, either
    //        just to get the right number, or to have a chest

    if (loc.rom.spoiler) loc.rom.spoiler.addMaze(loc.id, loc.name, maze.show());
    return true;      
  }

  function randomEdge(dir: Dir): Pos {
    const tile = random.nextInt(dir & 1 ? h : w);
    const other = dir === Dir.RIGHT ? w - 1 : dir === Dir.DOWN ? h - 1 : 0;
    return (dir & 1 ? tile << 4 | other : other << 4 | tile) as Pos;
  }
  throw new Error(`Could not shuffle`);
}

function fail(msg: string): false {
  console.error(`Reroll: ${msg}`);
  return false;
}

// // NOTE: This version makes slightly prettier $27 maps, but it's better
// // just to go with the more general version.
// function tornadoBraceletCaveCheck(maze: Maze): boolean {
//   const t1 = [...maze.traverse({without: [0x30, 0x21] as Pos[]})];
//   const t2 = [...maze.traverse({without: [0x22, 0x33] as Pos[]})];
//   return t1[0][1].size === t1.length && t2[0][1].size === t2.length;
// }

function cycleCaveCheck(maze: Maze): boolean {
  const allTiles = [...maze];
  const nonCritical = allTiles.filter(t => {
    const trav = [...maze.traverse({without: [t[0]]})];
    return trav[0][1].size === trav.length;
  });
  if (!nonCritical.length) return false;
  // find two noncritical tiles that together *are* critical
  for (let i = 0; i < nonCritical.length; i++) {
    for (let j = 0; j < i; j++) {
      const trav = [...maze.traverse({without: [nonCritical[i][0],
                                                nonCritical[j][0]]})];
      if (trav[0][1].size !== trav.length) return true;
    }
  }
  return false;
}

function isTightCycle(maze: Maze, pos: Pos): boolean {
  const ul = maze.get((pos - 17) as Pos) || 0;
  const dr = maze.get((pos) as Pos) || 0;
  return !!((ul & 0x0f00) && (ul & 0x00f0) && (dr & 0xf000) && (dr & 0x000f));
}

function fixBorders(maze: Maze, pos: Pos, scr: Scr): void {
  try {
    for (const dir of Dir.ALL) {
      if (!maze.inBounds(Pos.plus(pos, dir)) &&
          ((scr >> Dir.shift(dir)) & 0x7) === 7) {
        maze.setBorder(pos, dir, 7);
      }
    }
  } catch (err) {}
}

    //maze.trackOpenEdges();

    //const mapping: Array<[Pos, Pos]> = []; // NOTE: may need to xform if shrink
    //const poi: Array<[Pos, Dir]> = [];
    //let {branches, deadEnds, size, walls} = survey;


    

    // // Possible approach:
    // //  1. seed a bunch of initial screens
    // //  2. check step: traverse the map with
    // //     missing items treated as connecting everything
    // //  3. add random screens, biasing toward fewer exits
    // //     based on branching factor?
    // // This should ensure we don't do anything too stupid to
    // // paint ourselves into a corner.

    // Place (1) edge exits, (2) fixed screens, (3) stairs.
//     const setEdges = new Set<Pos>();
//     for (const [, edge] of survey.edges) {
//       while (true) {
//         const tile = /*1 +*/ random.nextInt(edge.dir & 1 ? h0 : w0);
//         const other =
//             edge.dir === Dir.RIGHT ? /*1 +*/ w0 :
//             edge.dir === Dir.DOWN ? /*1 +*/ h0 : 0;
//         const pos = (edge.dir & 1 ? tile << 4 | other : other << 4 | tile) as Pos;
//         if (setEdges.has(pos)) continue;
//         maze.setBorder(pos, edge.dir, 6);
//         break;
//       }
//       // if (!maze.fill(moved, {maxExits: 2 + branches})) continue OUTER;
//       // const filled = maze.get(moved)!;
//       // mapping.push([pos, moved]);
//       // let exits = 0;
//       // for (const dir of Dir.ALL) {
//       //   if (dir != edge.dir && (filled & Dir.edgeMask(dir))) {
//       //     // poi.push([moved, dir]);
//       //     exits++;
//       //   }
//       // }
//       // size--;
//       // if (exits > 1) branches -= (exits - 1);
//     }

//     for (const [, scr] of survey.fixed) {
//       if (maze.addScreen(scr) == null) continue OUTER;
//     }

//     for (const stair of survey.stairs) {
//       const eligible = [];
//       for (const spec of screens) {
//         if (spec.stairs.some(s => s.dir === stair.dir)) eligible.push(spec.edges);
//       }
//       if (maze.addScreen(random.pick(eligible)) == null) continue OUTER;
//     }

//     // // Now fill out a basic structure by walking random paths.
//     // while (maze.density() < density) {
//     //   if (maze.randomExtension(branches / size)) branches--;
//     //   size--;
//     // }


//     //   for (let i = 0; i < 10; i++) {
//     //     const tile0 = random.nextInt(h0 * w0);
//     //     const x = tile0 % w0;
//     //     const y = (tile0 - x) / w0;
//     //     if (!maze.trySet(pos, 
//     // }


//     // for (const stair of survey.stairs) {
//     //   // Find a random location for a correct-direction stair.
//     //   const pos = maze.randomUnfilledPos();
//     // }

//     console.log(maze.show());
//   }
// }
