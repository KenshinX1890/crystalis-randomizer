import {Rom} from '../rom.js';

// Simple tileset-only fixes that unlock some screen-tileset combinations
export enum ScreenFix {
  Unknown,
  // Support "long grass" river screens on the grass tileset by copying
  // some tiles from 51..59 into 40..47.
  GrassLongGrass,
  // In addition to just making the new long grass tiles, we need to
  // also remap the existing ones in some situations to point to the
  // new ones, e.g. for screens 1d,29 to work on river, we need to use
  // the 4x tiles instead of the 5x ones to fix the surrounding.
  GrassLongGrassRemapping,
  // River tilesets don't define 10,12,14,16,17,1a,1b,1c,22,23,24,25,26,
  // which are used for the "short grass" in the grass tileset.  These
  // would be easy to copy from somewhere else to open up a few screens.
  RiverShortGrass,
  // Angry sea uses 0a oddly for a simple diagonal beach/mountain tile,
  // preventing parity with grass/river cave entrance bottoms.  Move this
  // tile elsewhere (ad) and fix the graphics/effects.  Note that the
  // actual fix is not entirely satisfying.
  SeaCaveEntrance,
  // Angry sea does not handle rocks correctly.  Fix 5a..5e for parity
  // with grass/river tilesets.  TODO - implement the fix (we could move
  // the existing tiles, used by mountain gates, elsewhere pretty easily,
  // or alternatively move all the 5a..5e in all other tilesets into
  // 89,8a,90,99,9d,d1,d2 which are free in 80,90,94,9c).
  SeaRocks,
  // Allow the sea to support 34,38,3c..3f, used as marsh in river tileset.
  // These woud need to map to simple ocean tiles.  TODO - implement.
  SeaMarsh,
  // Support 6x,7x tiles (trees) on angry sea.  Probably not worth it.
  // Would need to move (e.g.) Lime Tree Lake to a totally different tileset
  // to free up the metatiles.
  SeaTrees,
  // Fixing RiverShortGrass for desert is a lot harder because it touches a
  // bunch of tiles used by the mountainRiver tileset (10,14,2x).
  DesertShortGrass,
  // Fixing GrassLongGrass for desert is difficult because the 4x tiles
  // are used by mountainRiver.
  DesertLongGrass,
  // Desert doesn't support the 3x marsh tiles (clash with mountainRiver).
  // It's probably not feasible to add support - it would allow screen 33,
  // but there's a similar south-edge-exit screen with DesertTownEntrance.
  DesertMarsh,
  // Fix 5a..5e to be compatible with grass/river.  5b is already in use
  // on the two oasis screens, so that tile is moved to 5f to make space.
  DesertRocks,
  // Add some missing tree tiles in 63,68,69,6a,6c,6e,6f, required for
  // parity with some river screens.
  DesertTrees,
  // South-facing town entrances use 07 for the top of the town wall.
  // This could be replaced with (e.g. 8c) or maybe something better.
  DesertTownEntrance,
  // Labyrinth parapets can be blocked/unblocked with a flag.
  LabyrinthParapets,
  // Adds flaggable doors to various screens.
  SwampDoors,
  // Adds some extra spike screens.
  ExtraSpikes,
}

type Reqs = Record<any, {requires?: ScreenFix[]}>
export function withRequire<T extends Reqs>(requirement: ScreenFix, props: T) {
  for (const key in props) {
    props[key].requires = [requirement];
  }
  return props;
}


  // // Adds ability to close caves.
  // CloseCaves,


// /** Adds a 'CloseCaves' requirement on all the properties. */
// function closeCaves<T extends Record<any, {requires: ScreenFix[]}>>(props: T) {
//   for (const key in props) {
//     props[key].requires = [ScreenFix.CloseCaves];
//   }
//   return props;
// }


// NOTE: Listing explicit flags doesn't quite work.
// enum Flag {
//   Always = 0x2f0,
//   Windmill = 0x2ee,
//   Prison = 0x2d8,
//   Calm = 0x283,
//   Styx = 0x2b0,
//   Draygon1 = 0x28f,
//   Draygon2 = 0x28d,
// }

// const GRASS = 0x80;
// const TOWN = 0x84;
// const CAVE = 0x88;
// const PYRAMID = 0x8c;
// const RIVER = 0x90;
// const MOUNTAIN = 0x94;
// const SEA = 0x94;
// const SHRINE = 0x98;
// const DESERT = 0x9c;
// const MOUNTAIN_RIVER = 0x9c;
// const SWAMP = 0xa0;
// const HOUSE = 0xa0;
// const FORTRESS = 0xa4;
// const ICE_CAVE = 0xa8;
// const TOWER = 0xac;

export function fixTilesets(rom: Rom) {
  const {desert, grass, sea} = rom.metatilesets;
  const $ = rom.metascreens;

  // Several of the grass/river screens with forest tiles don't work on
  // desert.  Fix them by making 5a..6f work correctly.
  $.registerFix(ScreenFix.DesertRocks);
  desert.getTile(0x5f).copyFrom(0x5b).replaceIn($.oasisCave, $.oasisLake);

  desert.getTile(0x5a).copyFrom(0x98).setTiles([, , 0x1a, 0x18]);
  desert.getTile(0x5b).copyFrom(0x80).setTiles([0x34, 0x32, , ]);
  desert.getTile(0x5c).copyFrom(0x80).setTiles([, , 0x37, 0x35]);
  desert.getTile(0x5d).copyFrom(0x80).setTiles([, 0x37, , 0x34]);
  desert.getTile(0x5e).copyFrom(0x80).setTiles([0x35, , 0x32, ]);

  $.registerFix(ScreenFix.DesertTrees);
  desert.getTile(0x63).copyFrom(0x71);
  desert.getTile(0x68).copyFrom(0x70);
  desert.getTile(0x69).copyFrom(0x60);
  desert.getTile(0x6a).copyFrom(0x65);
  desert.getTile(0x6c).copyFrom(0x70);
  desert.getTile(0x6e).copyFrom(0x76);
  desert.getTile(0x6f).copyFrom(0x78);

  // Long grass screens don't work on grass tilesets because of a few
  // different tiles - copy them where they need to go.
  $.registerFix(ScreenFix.GrassLongGrass);
  grass.getTile(0x40).copyFrom(0x51);
  grass.getTile(0x41).copyFrom(0x52);
  grass.getTile(0x42).copyFrom(0x53);
  grass.getTile(0x43).copyFrom(0x54);
  grass.getTile(0x44).copyFrom(0x55);
  grass.getTile(0x45).copyFrom(0x56);
  grass.getTile(0x46).copyFrom(0x58);
  grass.getTile(0x47).copyFrom(0x59);

  // Angry sea tileset doesn't support tile 0a (used elsewhere for the
  // bottom tile in cave entrances) because it's already in use (but
  // not as an alternative).  Move it to ad and get 0a back.
  $.registerFix(ScreenFix.SeaCaveEntrance);
  sea.getTile(0xad).copyFrom(0x0a)
      .replaceIn($.beachExitN, $.lighthouseEntrance, $.oceanShrine);
  sea.getTile(0x0a).copyFrom(0xa2); // don't bother setting an alternative.
  $.boundaryN_cave.screen.set2d(0x39, [[0x00, 0x00], [0x0a, 0x0a]]);
  $.boundarySE_cave.screen.set2d(0x4a, [[0x00, 0x00], [0x0a, 0x0a]]);
     // , [0xf8, 0xf8], [null, 0xfd]]);
  // sea.screens.add($.boundaryW_cave);
  // sea.screens.add($.desertCaveEntrance);

  // sea.getTile(0x0a).copyFrom(0xa2).setTiles([,,0x91,0x91]).setAttrs(0);
  // This does open up screen $ce (desert cave entrance) for use in the sea,
  // which is interesting because whirlpools can't be flown past - we'd need
  // to add flags to clear the whirlpools, but it would be a cave that's
  // blocked on calming the sea...

  // We could add a number of screens to the sea if we could move 5a..5e
  // (which collides with mountain gates).  89,8a,90,99,9d,d1,d2 are free
  // in 80 (grass), 90 (river), and 9c (desert).  The main problem is that
  // at least the cave entrances don't quite work for these - they end up
  // in shallow water, are a little too short, and it seems to be impossible
  // to pick a palette that is light blue on bottom and black on top.
  //
  // Other options for the sea are 34,38,3c..3f which are marsh tiles in
  // river - would open up some narrow passages (33, 


  //  rom.metascreens;

  // for (const x of Object.values(TILESET_FIXES)) {
  //   const id = x.id;
  //   const ts = rom.tilesets[id];
  //   const te = ts.effects();
  //   for (const tstr in x) {
  //     const t = Number(tstr);
  //     if (isNaN(t)) continue;
  //     const y: number|{base: number} = (x as any)[t];
  //     const base = typeof y === 'number' ? y : (y as any).base;
  //     const rest: any = typeof y === 'number' ? {} : y;
  //     ts.attrs[t] = ts.attrs[base];
  //     te.effects[t] = te.effects[base];
  //     [rest.tl, rest.tr, rest.bl, rest.br].forEach((m, i) => {
  //       ts.tiles[i][t] = ts.tiles[i][m != null ? m : base];
  //     });
  //     if (rest.move) {}
  //     // if (rest.tiles) {
  //     //   rest.tiles.forEach((s: number, i: number) => void (ts.tiles[i][t] = s));
  //     // }
  //   }
  // }
}


// const TILESET_FIXES = {
//   grass: {
//     id: 0x80,
//     0x40: 0x51,
//     0x41: 0x52,
//     0x42: 0x53,
//     0x43: 0x54,
//     0x44: 0x55,
//     0x45: 0x56,
//     0x46: 0x58,
//     0x47: 0x59,
//   },
//   desert: {
//     id: 0x9c,
//     0x5a: {base: 0x98, bl: 0x94, br: 0x94},
//     0x5b: {base: 0x80, tl: 0xfd, tr: 0xfc},
//     0x5c: {base: 0x80, bl: 0xff, br: 0xfe},
//     0x5d: {base: 0x80, tr: 0xff, br: 0xfd},
//     0x5e: {base: 0x80, tl: 0xfe, bl: 0xfc},
//     0x63: 0x71,
//     0x68: 0x70,
//     0x69: 0x60,
//     0x6a: 0x65,
//     0x6c: 0x70,
//     0x6e: 0x76,
//     0x6f: 0x78,
//   },
// } as const;

// const SCREEN_REMAPS = [
//   {tilesets: [0x9c], src: 0x5b, dest: 0x5f, screens: [0xcf]},
// ];
// const [] = SCREEN_REMAPS;

// TODO - copy 5f <- 5b in 9c, then remap in screen cf
//      - better notation?
// Consider doing this programmatically, though we'd want to use
// the _actual_ screen-tileset usages rather than declared options

// class X {
//   readonly m: Metascreens;
//   constructor(r: Rom) {
//     this.m = new Metascreens(r);
//   }
// }
