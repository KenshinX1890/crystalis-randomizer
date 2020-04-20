import {Location} from './location.js'; // import type
import {Exit, Flag as LocationFlag} from './locationtables.js';
import {Flag} from './flags.js';
import {Metascreen, Uid} from './metascreen.js';
import {Metatileset} from './metatileset.js';
import {hex} from './util.js';
import {Rom} from '../rom.js';
import {DefaultMap, Table, iters, format} from '../util.js';
import {UnionFind} from '../unionfind.js';
import {ConnectionType} from './metascreendata.js';
import {Random} from '../random.js';
import {Monster} from './monster.js';

const [] = [hex];

// Model of a location with metascreens, etc.

// Trick: we need something to own the neighbor cache.
//  - probably this belongs in the Metatileset.
//  - method to regenerate, do it after the screen mods?
// Data we want to keep track of:
//  - given two screens and a direction, can they abut?
//  - given a screen and a direction, what screens open/close that edge?
//    - which one is the "default"?

// TODO - consider abstracting exits here?
//  - exits: Array<[ExitSpec, number, ExitSpec]>
//  - ExitSpec = {type?: ConnectionType, scr?: number}
// How to handle connecting them correctly?
//  - simply saying "-> waterfall valley cave" is not helpful since there's 2
//    or "-> wind valley cave" when there's 5.
//  - use scrId as unique identifier?  only problem is sealed cave has 3...
//  - move to different screen as necessary...
//    (could also just ditch the other two and treat windmill entrance as
//     a down entrance - same w/ lighthouse?)
//  - only a small handfull of locations have disconnected components:
//      windmill, lighthouse, pyramid, goa backdoor, sabera, sabre/hydra ledges
//  - we really do care which is in which component.
//    but map edits may change even the number of components???
//  - do we do entrance shuffle first or map shuffle first?
//    or are they interleaved?!?
//    if we shuffle sabre overworld then we need to know which caves connect
//    to which... and possibly change the connections?
//    - may need leeway to add/subtract cave exits??
// Problem is that each exit is co-owned by two metalocations.


export type Pos = number;
export type LocPos = number; // location << 8 | pos
export type ExitSpec = readonly [LocPos, ConnectionType];

export class Metalocation {

  // TODO - store metadata about windmill flag?  two metalocs will need a pos to
  // indicate where that flag should go...?  Or store it in the metascreen?

  // Caves are assumed to be always open unless there's a flag set here...
  customFlags = new Map<Pos, Flag>();
  freeFlags = new Set<Flag>();

  readonly rom: Rom;

  private _height: number;
  private _width: number;

  private _pos: Pos[]|undefined = undefined;

  private _exits = new Table<Pos, ConnectionType, ExitSpec>();

  //private _monstersInvalidated = false;

  /** Key: (y<<4)|x */
  private _screens: Metascreen[];

  // NOTE: keeping track of reachability is important because when we
  // do the survey we need to only count REACHABLE tiles!  Seamless
  // pairs and bridges can cause lots of important-to-retain unreachable
  // tiles.  Moreover, some dead-end tiles can't actually be walked on.
  // For now we'll just zero out feature metascreens that aren't
  // reachable, since trying to do it correctly requires storing
  // reachability at the tile level (again due to bridge double stairs).
  // private _reachable: Uint8Array|undefined = undefined;

  constructor(readonly id: number, readonly tileset: Metatileset,
              height: number, width: number) {
    this.rom = tileset.rom;
    this._height = height;
    this._width = width;
    this._screens = new Array(height << 4).fill(tileset.empty);
  }

  /**
   * Parse out a metalocation from the given location.  Infer the
   * tileset if possible, otherwise it must be explicitly specified.
   */
  static of(location: Location, tileset?: Metatileset): Metalocation {
    const {rom, width, height} = location;
    if (!tileset) {
      // Infer the tileset.  Start by adding all compatible metatilesets.
      const {fortress, labyrinth} = rom.metatilesets;
      const tilesets = new Set<Metatileset>();
      for (const ts of rom.metatilesets) {
        if (location.tileset === ts.tileset.id) tilesets.add(ts);
      }
      // It's impossible to distinguish fortress and labyrinth, so we hardcode
      // it based on location: only $a9 is labyrinth.
      tilesets.delete(location.id === 0xa9 ? fortress : labyrinth);
      // Filter out any tilesets that don't include necessary screen ids.
      for (const screen of new Set(iters.concat(...location.screens))) {
        for (const tileset of tilesets) {
          if (!tileset.getMetascreens(screen).length) tilesets.delete(tileset);
          if (!tilesets.size) {
            throw new Error(`No tileset for ${hex(screen)} in ${location}`);
          }
        }
      }
      if (tilesets.size !== 1) {
        throw new Error(`Non-unique tileset for ${location}: [${
                         Array.from(tilesets, t => t.name).join(', ')}]`);
      }
      tileset = [...tilesets][0];
    }

    // Traverse the location for all tiles reachable from an entrance.
    // This is used to inform which metascreen to select for some of the
    // redundant ones (i.e. double dead ends).  This is a simple traversal
    const reachable = location.reachableTiles(true); // traverseReachable(0x04);
    const reachableScreens = new Set<Pos>();
    for (const tile of reachable.keys()) {
      reachableScreens.add(tile >>> 8);
      //reachableScreens.add((tile & 0xf000) >>> 8 | (tile & 0xf0) >>> 4);
    }
    // NOTE: some entrances are on impassable tiles but we still care about
    // the screens under them (e.g. boat and shop entrances).  Also make sure
    // to handle the seamless tower exits.
    for (const entrance of location.entrances) {
      reachableScreens.add(entrance.screen);
    }
    for (const exit of location.exits) {
      reachableScreens.add(exit.screen);
    }
    //const exit = tileset.exit;
    const screens = new Array<Metascreen>(height << 4).fill(tileset.empty);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t0 = y << 4 | x;
        const metascreens = tileset.getMetascreens(location.screens[y][x]);
        let metascreen: Metascreen|undefined = undefined;
        if (metascreens.length === 1) {
          metascreen = metascreens[0];
        } else if (!metascreens.length) {
          throw new Error('impossible');
        } else {
          // TOOD - filter based on who has a match function, or matching flags
          const flag = location.flags.find(f => f.screen === ((y << 4) | x));
          const matchers: Metascreen[] = [];
          const best: Metascreen[] = [];
          for (const s of metascreens) {
            if (s.data.match) {
              matchers.push(s);
            } else if (s.flag === 'always' && flag?.flag === 0x2fe ||
                       !s.flag && !s.data.wall && !flag) {
              best.unshift(s); // front-load matching flags
            } else {
              best.push(s);
            }
          }
          if (matchers.length) {
            function reach(dy: number, dx: number) {
              const x0 = (x << 8) + dx;
              const y0 = (y << 8) + dy;
              const t =
                  (y0 << 4) & 0xf000 | x0 & 0xf00 | y0 & 0xf0 | (x0 >> 4) & 0xf;
              return reachable.has(t);
            }
            for (const matcher of matchers) {
              if (!matcher.data.match!(reach, flag != null)) continue;
              metascreen = matcher;
              break;
            }
          }
          if (!metascreen) metascreen = best[0];
        }
        if (!metascreen) throw new Error('impossible');
        // if ((metascreen.data.exits || metascreen.data.wall) &&
        //     !reachableScreens.has(t0) &&
        //     tileset !== rom.metatilesets.tower) {
        //   // Make sure we don't survey unreachable screens (and it's hard to
        //   // to figure out which is which later).  Make sure not to do this for
        //   // tower because otherwise it'll clobber important parts of the map.
        //   metascreen = tileset.empty;
        // }
        screens[t0] = metascreen;
        // // If we're on the border and it's an edge exit then change the border
        // // screen to reflect an exit.
        // const edges = metascreen.edgeExits();
        // if (y === 0 && (edges & 1)) screens[t0 - 16] = exit;
        // if (x === 0 && (edges & 2)) screens[t0 - 1] = exit;
        // if (y === height && (edges & 4)) screens[t0 + 16] = exit;
        // if (x === width && (edges & 8)) screens[t0 + 1] = exit;
      }
    }

    // Figure out exits
    const exits = new Table<Pos, ConnectionType, ExitSpec>();
    for (const exit of location.exits) {
      const srcPos = exit.screen;
      if (!reachableScreens.has(srcPos)) continue;
      const srcScreen = screens[srcPos];
      const srcExit = srcScreen.findExitType(exit.tile, height === 1,
                                             !!(exit.entrance & 0x20));
      const srcType = srcExit?.type;
      if (!srcType) {
        const id = location.id << 16 | srcPos << 8 | exit.tile;
        if (unknownExitWhitelist.has(id)) continue;
        const all = srcScreen.data.exits?.map(
            e => e.type + ': ' + e.exits.map(hex).join(', ')).join('\n  ');
        console.warn(`Unknown exit ${hex(exit.tile)}: ${srcScreen.name} in ${
                      location} @ ${hex(srcPos)}:\n  ${all}`);
        continue;
      }
      if (exits.has(srcPos, srcType)) continue; // already handled
      const dest = rom.locations[exit.dest];
      if (srcType.startsWith('seamless')) {
        const down = srcType === 'seamless:down';
        // NOTE: this seems wrong - the down exit is BELOW the up exit...?
        const tile = srcExit!.exits[0] + (down ? -16 : 16);
        const destPos = srcPos + (tile < 0 ? -16 : tile >= 0xf0 ? 16 : -0);
        const destType = down ? 'seamless:up' : 'seamless:down';
        //console.log(`${srcType} ${hex(location.id)} ${down} ${hex(tile)} ${hex(destPos)} ${destType} ${hex(dest.id)}`);
        exits.set(srcPos, srcType, [dest.id << 8 | destPos, destType]);
        continue;
      }
      const entrance = dest.entrances[exit.entrance & 0x1f];
      let destPos = entrance.screen;
      let destCoord = entrance.coord;
      if (srcType === 'door' && (entrance.y & 0xf0) === 0) {
        // NOTE: The item shop door in Oak straddles two screens (exit is on
        // the NW screen while entrance is on SW screen).  Do a quick hack to
        // detect this (proxying "door" for "upward exit") and adjust search
        // target accordingly.
        destPos -= 0x10;
        destCoord += 0x10000;
      }
      // Figure out the connection type for the destTile.
      const destScrId = dest.screens[destPos >> 4][destPos & 0xf];
      const destType = findEntranceType(dest, destScrId, destCoord);
      // NOTE: initial spawn has no type...?
      if (!destType) {
        const lines = [];
        for (const destScr of rom.metascreens.getById(destScrId, dest.tileset)) {
          for (const exit of destScr.data.exits ?? []) {
            if (exit.type.startsWith('seamless')) continue;
            lines.push(`  ${destScr.name} ${exit.type}: ${hex(exit.entrance)}`);
          }
        }
        console.warn(`Bad entrance ${hex(destCoord)}: raw ${hex(destScrId)
                      } in ${dest} @ ${hex(destPos)}\n${lines.join('\n')}`);
        continue;
      }
      exits.set(srcPos, srcType, [dest.id << 8 | destPos, destType]);
      // if (destType) exits.set(srcPos, srcType, [dest.id << 8 | destPos, destType]);
    }

    const metaloc = new Metalocation(location.id, tileset, height, width);
    // for (let i = 0; i < screens.length; i++) {
    //   metaloc.setInternal(i, screens[i]);
    // }
    metaloc._screens = screens;
    metaloc._exits = exits;

    // Fill in custom flags
    for (const f of location.flags) {
      const scr = metaloc._screens[f.screen];
      if (scr.flag?.startsWith('custom')) {
        metaloc.customFlags.set(f.screen, rom.flags[f.flag]);
      } else if (!scr.flag) {
        metaloc.freeFlags.add(rom.flags[f.flag]);
      }
    }
    // for (const pos of metaloc.allPos()) {
    //   const scr = rom.metascreens[metaloc._screens[pos + 16]];
    //   if (scr.flag === 'custom') {
    //     const f = location.flags.find(f => f.screen === pos);
    //     if (f) metaloc.customFlags.set(pos, rom.flags[f.flag]);
    //   }
    // }

    // TODO - store reachability map?
    return metaloc;

    function findEntranceType(dest: Location, scrId: number, coord: number) {
      for (const destScr of rom.metascreens.getById(scrId, dest.tileset)) {
        const type = destScr.findEntranceType(coord, dest.height === 1);
        if (type != null) return type;
      }
      return undefined;
    }
  }

  // isReachable(pos: Pos): boolean {
  //   this.computeReachable();
  //   return !!(this._reachable![pos >>> 4] & (1 << (pos & 7)));
  // }

  // computeReachable() {
  //   if (this._reachable) return;
  //   this._reachable = new Uint8Array(this.height);
  //   const map = this.traverse({flight: true});
  //   const seen = new Set<number>();
  //   const reachable = new Set<Pos>();
  //   for (const [pos] of this._exits) {
  //     const set = map.get(pos)
  //   }
  // }

  getUid(pos: Pos): Uid {
    return this._screens[pos].uid;
  }

  get(pos: Pos): Metascreen {
    return this._screens[pos];
  }

  // Readonly accessor.
  // get screens(): readonly Uid[] {
  //   return this._screens;
  // }

  get width(): number {
    return this._width;
  }
  set width(width: number) {
    this._width = width;
    this._pos = undefined;
  }

  get height(): number {
    return this._height;
  }
  set height(height: number) {
    if (this._height > height) {
      this._screens.splice((height + 2) << 4, (this._height - height) << 4);
    } else if (this._height < height) {
      this._screens.length = (height + 2) << 4;
      this._screens.fill(this.tileset.empty,
                         (this.height + 2) << 4, this._screens.length);
    }
    this._height = height;
    this._pos = undefined;
  }

  // TODO - resize function?

  allPos(): readonly Pos[] {
    if (this._pos) return this._pos;
    const p: number[] = this._pos = [];
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        p.push(y << 4 | x);
      }
    }
    return p;
  }

  set(pos: Pos, scr: Metascreen | null) {
    this._screens[pos] = scr ?? this.tileset.empty;
  }

  //invalidateMonsters() { this._monstersInvalidated = true; }

  inBounds(pos: Pos): boolean {
    // return inBounds(pos, this.height, this.width);
    return (pos & 15) < this.width && pos >= 0 && pos >>> 4 < this.height;
  }

  // isFixed(pos: Pos): boolean {
  //   return this._fixed.has(pos);
  // }

  /**
   * Force-overwrites the given range of screens.  Does validity checking
   * only at the end.  Does not do anything with features, since they're
   * only set in later passes (i.e. shuffle, which is last).
   */
  set2d(pos: Pos,
        screens: ReadonlyArray<ReadonlyArray<Metascreen|null>>): boolean {
    for (const row of screens) {
      let dx = 0;
      for (const scr of row) {
        if (scr) this.set(pos + dx++, scr);
      }
      pos += 16;
    }
    // return this.verify(pos0, screens.length,
    //                    Math.max(...screens.map(r => r.length)));
    return this.validate();
  }

  /** Check all the currently invalidated edges, then clears it. */
  validate(): boolean {
    for (const dir of [0, 1]) {
      for (let y = dir ? 0 : 1; y < this.height; y++) {
        for (let x = dir; x < this.width; x++) {
          const pos0: Pos = y << 4 | x;
          const scr0 = this._screens[pos0];
          const pos1: Pos = pos0 - (dir ? 1 : 16);
          const scr1 = this._screens[pos1];
          if (scr0.isEmpty()) continue;
          if (scr1.isEmpty()) continue;
          if (!scr0.checkNeighbor(scr1, dir)) {
            throw new Error(format('bad neighbor %s (%02x) %s %s (%02x)',
                                   scr1.name, pos1, DIR_NAME[dir],
                                   scr0.name, pos0));
          }
        }
      }
    }
    return true;
  }

  spliceColumns(left: number, deleted: number, inserted: number,
                screens: ReadonlyArray<ReadonlyArray<Metascreen>>) {
    // First adjust the screens.
    for (let p = 0; p < this._screens.length; p += 16) {
      this._screens.copyWithin(p + left + inserted, p + left + deleted, p + 10);
      this._screens.splice(p + left, inserted, ...screens[p >> 4]);
    }
    // Update dimensions and accounting
    const delta = inserted - deleted;
    this.width += delta;
    this._pos = undefined;
    // Move relevant exits
    const move: [Pos, ConnectionType, Pos, ConnectionType][] = [];
    for (const [pos, type] of this._exits) {
      const x = pos & 0xf;
      if (x < left + deleted) {
        if (x >= left) this._exits.delete(pos, type);
        continue;
      }
      move.push([pos, type, pos + delta, type]);
    }
    this.moveExits(...move);
    // Move flags and spawns in parent location
    const parent = this.rom.locations[this.id];
    const xt0 = (left + deleted) << 4;
    for (const spawn of parent.spawns) {
      if (spawn.xt < xt0) continue;
      spawn.xt -= (delta << 4);
    }
    for (const flag of parent.flags) {
      if (flag.xs < left + deleted) {
        if (flag.xs >= left) flag.screen = 0xff;
        continue;
      }
      flag.xs -= delta;
    }
    parent.flags = parent.flags.filter(f => f.screen !== 0xff);

    // TODO - move pits??

  }

  ////////////////////////////////////////////////////////////////
  // Exit handling

  setExit(pos: Pos, type: ConnectionType, spec: ExitSpec) {
    const other = this.rom.locations[spec[0] >>> 8].meta;
    if (!other) throw new Error(`Cannot set two-way exit without meta`);
    this.setExitOneWay(pos, type, spec);
    other.setExitOneWay(spec[0] & 0xff, spec[1], [this.id << 8 | pos, type]);
  }
  setExitOneWay(pos: Pos, type: ConnectionType, spec: ExitSpec) {
    // const prev = this._exits.get(pos, type);
    // if (prev) {
    //   const other = this.rom.locations[prev[0] >>> 8].meta;
    //   if (other) other._exits.delete(prev[0] & 0xff, prev[1]);
    // }
    this._exits.set(pos, type, spec);
  }

  getExit(pos: Pos, type: ConnectionType): ExitSpec|undefined {
    return this._exits.get(pos, type);
  }

  exits(): Iterable<readonly [Pos, ConnectionType, ExitSpec]> {
    return this._exits;
  }

  // TODO - counted candidates?
  exitCandidates(type: ConnectionType): Metascreen[] {
    // TODO - figure out a way to use the double-staircase?  it won't
    // happen currently because it's fixed, so it's excluded....?
    const hasExit: Metascreen[] = [];
    for (const scr of this.tileset) {
      if (scr.data.exits?.some(e => e.type === type)) hasExit.push(scr);
    }
    return hasExit;
  }

  // TODO - short vs full?
  show(): string {
    const lines = [];
    let line = [];
    for (let x = 0; x < this.width; x++) {
      line.push(x.toString(16));
    }
    lines.push('   ' + line.join('  '));
    for (let y = 0; y < this.height; y++) {
      for (let r = 0; r < 3; r++) {
        line = [r === 1 ? y.toString(16) : ' ', ' '];
        for (let x = 0; x < this.width; x++) {
          const screen = this._screens[y << 4 | x];
          line.push(screen?.data.icon?.full[r] ?? (r === 1 ? ' ? ' : '   '));
        }
        lines.push(line.join(''));
      }
    }
    return lines.join('\n');
  }

  screenNames(): string {
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = [];
      for (let x = 0; x < this.width; x++) {
        const screen = this._screens[y << 4 | x];
        line.push(screen?.name);
      }
      lines.push(line.join(' '));
    }
    return lines.join('\n');
  }

  traverse(opts: TraverseOpts = {}): Map<number, Set<number>> {
    // Returns a map from unionfind root to a list of all reachable tiles.
    // All elements of set are keys pointing to the same value ref.
    const uf = new UnionFind<number>();
    const connectionType = (opts.flight ? 2 : 0) | (opts.noFlagged ? 1 : 0);
    for (const pos of this.allPos()) {
      const scr = opts.with?.get(pos) ?? this._screens[pos];
      for (const segment of scr.connections[connectionType]) {
        if (!segment.length) continue; // e.g. empty
        // Connect within each segment
        uf.union(segment.map(c => (pos << 8) + c));
      }
    }

    const map = new Map<number, Set<number>>();
    const sets = uf.sets();
    for (let i = 0; i < sets.length; i++) {
      const set = sets[i];
      for (const elem of set) {
        map.set(elem, set);
      }
    }

    return map;
  }  

  /**
   * Attach an exit/entrance pair in two directions.
   * Also reattaches the former other ends of each to each other.
   */
  attach(srcPos: Pos, dest: Metalocation, destPos: Pos,
         srcType?: ConnectionType, destType?: ConnectionType) {
    if (!srcType) srcType = this.pickTypeFromExits(srcPos);
    if (!destType) destType = dest.pickTypeFromExits(destPos);

    // TODO - what if multiple reverses?  e.g. cordel east/west?
    //      - could determine if this and/or dest has any seamless.
    // No: instead, do a post-process.  Only cordel matters, so go
    // through and attach any redundant exits.

    const destTile = dest.id << 8 | destPos;
    const prevDest = this._exits.get(srcPos, srcType)!;
    if (prevDest) {
      const [prevDestTile, prevDestType] = prevDest;
      if (prevDestTile === destTile && prevDestType === destType) return;
    }
    const prevSrc = dest._exits.get(destPos, destType)!;
    this._exits.set(srcPos, srcType, [destTile, destType]);
    dest._exits.set(destPos, destType, [this.id << 8 | srcPos, srcType]);
    // also hook up previous pair
    if (prevSrc && prevDest) {
      const [prevDestTile, prevDestType] = prevDest;
      const [prevSrcTile, prevSrcType] = prevSrc;
      const prevSrcMeta = this.rom.locations[prevSrcTile >> 8].meta!;
      const prevDestMeta = this.rom.locations[prevDestTile >> 8].meta!;
      prevSrcMeta._exits.set(prevSrcTile & 0xff, prevSrcType, prevDest);
      prevDestMeta._exits.set(prevDestTile & 0xff, prevDestType, prevSrc);
    } else if (prevSrc || prevDest) {
      const [prevTile, prevType] = prevSrc || prevDest;
      const prevMeta = this.rom.locations[prevTile >> 8].meta!;
      prevMeta._exits.delete(prevTile & 0xff, prevType);      
    }
  }

  pickTypeFromExits(pos: Pos): ConnectionType {
    const types = [...this._exits.row(pos).keys()];
    if (!types.length) return this.pickTypeFromScreens(pos);
    if (types.length > 1) {
      throw new Error(`No single type for ${hex(pos)}: [${types.join(', ')}]`);
    }
    return types[0];
  }

  /**
   * Moves an exit from one pos/type to another.
   * Also updates the metalocation on the other end of the exit.
   * This should typically be done atomically if rebuilding a map.
   */
  // TODO - rebuilding a map involves moving to a NEW metalocation...
  //      - given this, we need a different approach?
  moveExits(...moves: Array<[Pos, ConnectionType, LocPos, ConnectionType]>) {
    const newExits: Array<[Pos, ConnectionType, ExitSpec]> = [];
    for (const [oldPos, oldType, newPos, newType] of moves) {
      const destExit = this._exits.get(oldPos, oldType)!;
      const [destTile, destType] = destExit;
      const dest = this.rom.locations[destTile >> 8].meta!;
      dest._exits.set(destTile & 0xff, destType,
                      [this.id << 8 | newPos, newType]);
      newExits.push([newPos, newType, destExit]);
      this._exits.delete(oldPos, oldType);
    }
    for (const [pos, type, exit] of newExits) {
      this._exits.set(pos, type, exit);
    }
  }

  moveExit(prev: Pos, next: Pos,
           prevType?: ConnectionType, nextType?: ConnectionType) {
    if (!prevType) prevType = this.pickTypeFromExits(prev);
    if (!nextType) nextType = this.pickTypeFromScreens(next);
    const destExit = this._exits.get(prev, prevType)!;
    const [destTile, destType] = destExit;
    const dest = this.rom.locations[destTile >> 8].meta!;
    dest._exits.set(destTile & 0xff, destType,
                    [this.id << 8 | next, nextType]);
    this._exits.set(next, nextType, destExit);
    this._exits.delete(prev, prevType);
  }  

  pickTypeFromScreens(pos: Pos): ConnectionType {
    const exits = this._screens[pos].data.exits;
    const types = (exits ?? []).map(e => e.type);
    if (types.length !== 1) {
      throw new Error(`No single type for ${hex(pos)}: [${types.join(', ')}]`);
    }
    return types[0];
  }

  transferFlags(orig: Metalocation, random: Random) {
    // Copy over the free flags
    this.freeFlags = new Set(orig.freeFlags);
    // Collect all the custom flags.
    const customs = new DefaultMap<Metascreen, Flag[]>(() => []);
    for (const [pos, flag] of orig.customFlags) {
      customs.get(orig._screens[pos]).push(flag);
    }
    // Shuffle them just in case they're not all the same...
    // TODO - for seamless pairs, only shuffle once, then copy.
    for (const flags of customs.values()) random.shuffle(flags);
    // Find all the custom-flag screens in the new location.
    for (const pos of this.allPos()) {
      const scr = this._screens[pos];
      if (scr.flag?.startsWith('custom')) {
        const flag = customs.get(scr).pop();
        if (!flag) {
          throw new Error(`No flag for ${scr.name} at ${
                           this.rom.locations[this.id]} @${hex(pos)}`);
        }
        this.customFlags.set(pos, flag);
      }
    }
  }

  /**
   * Takes ownership of exits from another metalocation with the same ID.
   * @param {fixed} maps destination location ID to pos where the exit is.
   */
  transferExits(orig: Metalocation, random: Random) {
    // Determine all the eligible exit screens.
    const exits = new DefaultMap<ConnectionType, Pos[]>(() => []);
    const selfExits = new DefaultMap<ConnectionType, Set<Pos>>(() => new Set());
    for (const pos of this.allPos()) {
      const scr = this._screens[pos];
      for (const {type} of scr.data.exits ?? []) {
        if (type === 'edge:top' && (pos >>> 4)) continue;
        if (type === 'edge:left' && (pos & 0xf)) continue;
        if (type === 'edge:bottom' && (pos >>> 4) < this.height - 1) continue;
        if (type === 'edge:right' && (pos & 0xf) < this.width - 1) continue;
        exits.get(type).push(pos);
      }
    }
    for (const arr of exits.values()) {
      random.shuffle(arr);
    }
    // Find a match for each original exit.
    for (const [opos, type, exit] of orig._exits) {
      if (selfExits.get(type).has(opos)) continue;
      // opos,exit from original version of this metalocation
      const pos = exits.get(type).pop(); // a Pos in this metalocation
      if (pos == null) {
        throw new Error(`Could not transfer exit ${type} in ${
                         this.rom.locations[this.id]}: no eligible screen\n${
                         this.show()}`);
      }
      // Look for a reverse exit: exit is the spec from old meta.
      // Find the metalocation it refers to and see if the exit
      // goes back to the original position.
      const eloc = this.rom.locations[exit[0] >>> 8].meta;
      const epos = exit[0] & 0xff;
      const etype = exit[1];
      if (eloc === orig) {
        // Special case of a self-exit (happens in hydra and pyramid).
        // In this case, just pick an exit of the correct type.
        const npos = exits.get(etype).pop();
        if (npos == null) throw new Error(`Impossible`);
        this._exits.set(pos, type, [this.id << 8 | npos, etype]);
        this._exits.set(npos, etype, [this.id << 8 | pos, type]);
        // Also don't visit the other exit later.
        selfExits.get(etype).add(epos);
        continue;
      }
      const ret = eloc._exits.get(epos, etype)!;
      if (!ret) {
        const eeloc = this.rom.locations[exit[0] >>> 8];
        console.log(eloc);
        throw new Error(`No exit for ${eeloc} at ${hex(epos)} ${etype}\n${
                         eloc.show()}\n${this.rom.locations[this.id]} at ${
                         hex(opos)} ${type}\n${this.show()}`);
      }
      if ((ret[0] >>> 8) === this.id && ((ret[0] & 0xff) === opos) &&
          ret[1] === type) {
        eloc._exits.set(epos, etype, [this.id << 8 | pos, type]);
      }
      this._exits.set(pos, type, exit);
    }
  }

  /**
   * Moves NPCs, triggers, and chests based on proximity to screens,
   * exits, and POI.
   */
  transferSpawns(that: Metalocation, random: Random) {
    // Start by building a map between exits and specific screen types.
    const reverseExits = new Map<ExitSpec, [number, number]>(); // map to y,x
    // Array of [old y, old x, new y, new x, max distance (squared)]
    const map: Array<[number, number, number, number, number]> = [];
    const walls: Array<[number, number]> = [];
    const bridges: Array<[number, number]> = [];
    // Pair up arenas.
    const arenas: Array<[number, number]> = [];
    for (const loc of [this, that]) {
      for (const pos of loc.allPos()) {
        const scr = loc._screens[pos];
        const y = pos & 0xf0;
        const x = (pos & 0xf) << 4;
        if (loc === this && scr.hasFeature('wall')) {
          if (scr.data.wall == null) throw new Error(`Missing wall prop`);
          walls.push([y | (scr.data.wall >> 4), x | (scr.data.wall & 0xf)]);
        } else if (loc === this && scr.hasFeature('bridge')) {
          if (scr.data.wall == null) throw new Error(`Missing wall prop`);
          bridges.push([y | (scr.data.wall >> 4), x | (scr.data.wall & 0xf)]);
        }
        if (!scr.hasFeature('arena')) continue;
        if (loc === this) {
          arenas.push([y | 8, x | 8]);
        } else {
          const [ny, nx] = arenas.pop()!;
          map.push([y | 8, x | 8, ny, nx, 144]); // 12 tiles
        }
      }
      if (loc === this) random.shuffle(arenas);
    }
    // Now pair up exits.
    for (const loc of [this, that]) {
      for (const [pos, type, exit] of loc._exits) {
        const scr = loc._screens[pos];
        const spec = scr.data.exits?.find(e => e.type === type);
        if (!spec) throw new Error(`Invalid exit: ${scr.name} ${type}`);
        const x0 = pos & 0xf;
        const y0 = pos >>> 4;
        const x1 = spec.exits[0] & 0xf;
        const y1 = spec.exits[0] >>> 4;
        if (loc === this) {
          reverseExits.set(exit, [y0 << 4 | y1, x0 << 4 | x1]);
        } else if ((exit[0] >>> 8) !== this.id) { // skip self-exits
          const [ny, nx] = reverseExits.get(exit)!;
          map.push([y0 << 4 | y1, x0 << 4 | x1, ny, nx, 25]); // 5 tiles
        }
      }
    }
    // Make a list of POI by priority (0..5).


    // TODO - consider first partitioning the screens with impassible
    // walls and placing poi into as many separate partitions (from
    // stairs/entrances) as possible ???  Or maybe just weight those
    // higher?  don't want to _force_ things to be inaccessible...?


    const ppoi: Array<Array<[number, number]>> = [[], [], [], [], [], []];
    for (const pos of this.allPos()) {
      const scr = this._screens[pos];
      for (const [p, dy = 0x70, dx = 0x78] of scr.data.poi ?? []) {
        const y = ((pos & 0xf0) << 4) + dy;
        const x = ((pos & 0x0f) << 8) + dx;
        ppoi[p].push([y, x]);
      }
    }
    for (const poi of ppoi) {
      random.shuffle(poi);
    }
    const allPoi = [...iters.concat(...ppoi)];
    // Iterate over the spawns, look for NPC/chest/trigger.
    const loc = this.rom.locations[this.id];
    for (const spawn of random.shuffle(loc.spawns)) {
      if (spawn.isMonster()) {
        // TODO - move platforms, statues?
        continue; // these are handled elsewhere.
      } else if (spawn.isWall()) {
        const wall = (spawn.wallType() === 'bridge' ? bridges : walls).pop();
        if (!wall) {
          throw new Error(`Not enough ${spawn.wallType()
                           } screens in new metalocation: ${loc}\n${
                           this.show()}`);
        }
        const [y, x] = wall;
        spawn.yt = y;
        spawn.xt = x;
        continue;
      } else if (spawn.isNpc() || spawn.isBoss() || spawn.isTrigger()) {
        //let j = 0;
        let best = [-1, -1, Infinity];
        for (const [y0, x0, y1, x1, dmax] of map) {
          const d = (spawn.yt - y0) ** 2 + (spawn.xt - x0) ** 2;
          if (d <= dmax && d < best[2]) {
            best = [spawn.yt + y1 - y0, spawn.xt + x1 - x0, d];
          }
        }
        if (Number.isFinite(best[2])) {
          // Keep track of any NPCs we already moved so that anything that's
          // on top of it (i.e. dual spawns) move along with.
          //if (best[2] > 4) map.push([spawn.xt, spawn.yt, best[0], best[1], 4]);
          // - TODO - I don't think we need this, since any future spawn should
          //   be placed by the same rules.
          [spawn.yt, spawn.xt] = best;
          continue;
        }
      }
      // Wasn't able to map an arena or exit.  Pick a new POI, but triggers and
      // bosses are ineligible.
      if (spawn.isTrigger() || spawn.isBoss()) {
        throw new Error(`Could not place ${loc} ${
                         spawn.isBoss() ? 'Boss' : 'Trigger'} ${spawn.hex()
                         }\n${this.show()}`);
      }
      const next = allPoi.shift();
      if (!next) throw new Error(`Ran out of POI for ${loc}`);
      const [y, x] = next;
      map.push([spawn.y >>> 4, spawn.x >>> 4, y >>> 4, x >>> 4, 4]);
      spawn.y = y;
      spawn.x = x;
    }
  }

  /**
   * Given a seamless pair location, sync up the exits.  For each exit of
   * either, check if it's symmetric, and if so, copy it over to the other side.
   */
  reconcileExits(that: Metalocation) {
    const add: [Metalocation, Pos, ConnectionType, ExitSpec][] = [];
    const del: [Metalocation, Pos, ConnectionType][] = [];
    for (const loc of [this, that]) {
      for (const [pos, type, [destTile, destType]] of loc._exits) {
        if (destType.startsWith('seamless')) continue;
        const dest = this.rom.locations[destTile >>> 8];
        const reverse = dest.meta._exits.get(destTile & 0xff, destType);
        if (reverse) {
          const [revTile, revType] = reverse;
          if ((revTile >>> 8) === loc.id && (revTile & 0xff) === pos &&
              revType === type) {
            add.push([loc === this ? that : this, pos, type,
                      [destTile, destType]]);
            continue;
          }
        }
        del.push([loc, pos, type]);
      }
    }
    for (const [loc, pos, type] of del) {
      loc._exits.delete(pos, type);
    }
    for (const [loc, pos, type, exit] of add) {
      loc._exits.set(pos, type, exit);
    }
    // this._exits = new Table(exits);
    // that._exits = new Table(exits);
  }

  /**
   * Saves the current state back into the underlying location.
   * Currently this only deals with entrances/exits.
   */
  write() {
    const srcLoc = this.rom.locations[this.id];
    let seamlessPartner: Location|undefined;
    for (const [srcPos, srcType, [destTile, destType]] of this._exits) {
      const srcScreen = this._screens[srcPos];
      const dest = destTile >> 8;
      let destPos = destTile & 0xff;
      const destLoc = this.rom.locations[dest];
      const destMeta = destLoc.meta!;
      const destScreen = destMeta._screens[destTile & 0xff];
      const srcExit = srcScreen.data.exits?.find(e => e.type === srcType);
      const destExit = destScreen.data.exits?.find(e => e.type === destType);
      if (!srcExit || !destExit) {
        throw new Error(`Missing ${srcExit ? 'dest' : 'source'} exit:
  From: ${srcLoc} @ ${hex(srcPos)}:${srcType} ${srcScreen.name}
  To:   ${destLoc} @ ${hex(destPos)}:${destType} ${destScreen.name}`);
      }
      // See if the dest entrance exists yet...
      let entrance = 0x20;
      if (destExit.type.startsWith('seamless')) {
        seamlessPartner = destLoc;
      } else {
        let destCoord = destExit.entrance;
        if (destCoord > 0xefff) { // handle special case in Oak
          destPos += 0x10;
          destCoord -= 0x10000;
        }
        entrance = destLoc.findOrAddEntrance(destPos, destCoord);
      }
      for (let tile of srcExit.exits) {
        //if (srcExit.type === 'edge:bottom' && this.height === 1) tile -= 0x20;
        srcLoc.exits.push(Exit.of({screen: srcPos, tile, dest, entrance}));
      }
    }
    srcLoc.width = this._width;
    srcLoc.height = this._height;
    srcLoc.screens = [];
    for (let y = 0; y < this._height; y++) {
      const row: number[] = [];
      srcLoc.screens.push(row);
      for (let x = 0; x < this._width; x++) {
        row.push(this._screens[y << 4 | x].sid);
      }
    }
    srcLoc.tileset = this.tileset.tilesetId;
    srcLoc.tileEffects = this.tileset.effects().id;

    // write flags
    srcLoc.flags = [];
    const freeFlags = [...this.freeFlags];
    for (const screen of this.allPos()) {
      const scr = this._screens[screen];
      let flag: number|undefined;
      if (scr.data.wall != null && !seamlessPartner) {
        flag = freeFlags.pop()?.id ?? this.rom.flags.alloc(0x200);
      } else if (scr.flag === 'always') {
        flag = this.rom.flags.AlwaysTrue.id;
      } else if (scr.flag === 'calm') {
        flag = this.rom.flags.CalmedAngrySea.id;
      } else if (scr.flag === 'custom:false') {
        flag = this.customFlags.get(screen)?.id;
      } else if (scr.flag === 'custom:true') {
        flag = this.customFlags.get(screen)?.id ?? this.rom.flags.AlwaysTrue.id;
      }
      if (flag != null) {
        srcLoc.flags.push(LocationFlag.of({screen, flag}));
      }
    }
  }

  // NOTE: this can only be done AFTER copying to the location!
  replaceMonsters(random: Random) {
    // Move all the monsters to reasonable locations.
    const loc = this.rom.locations[this.id];
    const placer = loc.monsterPlacer(random);
    for (const spawn of loc.spawns) {
      if (!spawn.isMonster()) continue;
      const monster = loc.rom.objects[spawn.monsterId];
      if (!(monster instanceof Monster)) return;
      const pos = placer(monster);
      if (pos == null) {
        console.error(`no valid location for ${hex(monster.id)} in ${loc}`);
        spawn.used = false;
      } else {
        spawn.screen = pos >>> 8;
        spawn.tile = pos & 0xff;
      }
    }
  }
}

interface TraverseOpts {
  // Do not pass certain tiles in traverse
  readonly with?: ReadonlyMap<Pos, Metascreen>;
  // Whether to break walls/form bridges
  readonly noFlagged?: boolean;
  // Whether to assume flight
  readonly flight?: boolean;
}


const unknownExitWhitelist = new Set([
  0x01003a, // top part of cave outside start
  0x01003b,
  0x1540a0, // " " seamless equivalent " "
  0x1a3060, // swamp exit
  0x402000, // bridge to fisherman island
  0x402030,
  0x4180d0, // below exit to lime tree valley
  0x6087bf, // below boat channel
  0xa10326, // crypt 2 arena north edge
  0xa10329,
  0xa90626, // stairs above kelby 2
  0xa90629,
]);

//const DPOS = [-16, -1, 16, 1];
const DIR_NAME = ['above', 'left of', 'below', 'right of'];
