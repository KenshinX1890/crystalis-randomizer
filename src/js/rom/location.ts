import {Entity, Rom} from './entity.js';
import {Data, DataTuple, Mutable,
        concatIterables, group, hex, readLittleEndian,
        seq, tuple, varSlice, writeLittleEndian} from './util.js';
import {Writer} from './writer.js';

// Location entities
export class Location extends Entity {

  used: boolean;
  name: string;

  private readonly mapDataPointer: number;
  private readonly mapDataBase: number;

  private readonly layoutBase: number;
  private readonly graphicsBase: number;
  private readonly entrancesBase: number;
  private readonly exitsBase: number;
  private readonly flagsBase: number;
  private readonly pitsBase: number;

  bgm: number;
  layoutWidth: number;
  layoutHeight: number;
  animation: number;
  extended: number;
  screens: number[][];

  tilePatterns: [number, number];
  tilePalettes: [number, number, number];
  tileset: number;
  tileEffects: number;

  entrances: Entrance[];
  exits: Exit[];
  flags: Flag[];
  pits: Pit[];

  hasSpawns: boolean;
  npcDataPointer: number;
  npcDataBase: number;
  spritePalettes: [number, number];
  spritePatterns: [number, number];
  spawns: Spawn[];

  constructor(rom: Rom, id: number) {
    // will include both MapData *and* NpcData, since they share a key.
    super(rom, id);

    const locationData: LocationData = LOCATIONS[id] || {name: ''};

    this.mapDataPointer = 0x14300 + (id << 1);
    this.mapDataBase = readLittleEndian(rom.prg, this.mapDataPointer) + 0xc000;
    this.name = locationData.name || '';
    this.used = this.mapDataBase > 0xc000 && !!this.name;

    this.layoutBase = readLittleEndian(rom.prg, this.mapDataBase) + 0xc000;
    this.graphicsBase = readLittleEndian(rom.prg, this.mapDataBase + 2) + 0xc000;
    this.entrancesBase = readLittleEndian(rom.prg, this.mapDataBase + 4) + 0xc000;
    this.exitsBase = readLittleEndian(rom.prg, this.mapDataBase + 6) + 0xc000;
    this.flagsBase = readLittleEndian(rom.prg, this.mapDataBase + 8) + 0xc000;

    // Read the exits first so that we can determine if there's entrance/pits
    // metadata encoded at the end.
    let hasPits = this.layoutBase !== this.mapDataBase + 10;
    let entranceLen = this.exitsBase - this.entrancesBase;
    this.exits = (() => {
      const exits = [];
      let i = this.exitsBase;
      while (!(rom.prg[i] & 0x80)) {
        exits.push(new Exit(rom.prg.slice(i, i + 4)));
        i += 4;
      }
      if (rom.prg[i] !== 0xff) {
        hasPits = !!(rom.prg[i] & 0x40);
        entranceLen = (rom.prg[i] & 0x1f) << 2;
      }
      return exits;
    })();

    // TODO - these heuristics will not work to re-read the locations.
    //      - we can look at the order: if the data is BEFORE the pointers
    //        then we're in a rewritten state; in that case, we need to simply
    //        find all refs and max...?
    //      - can we read these parts lazily?
    this.pitsBase = !hasPits ? 0 :
        readLittleEndian(rom.prg, this.mapDataBase + 10) + 0xc000;

    this.bgm = rom.prg[this.layoutBase];
    this.layoutWidth = rom.prg[this.layoutBase + 1];
    this.layoutHeight = rom.prg[this.layoutBase + 2];
    this.animation = rom.prg[this.layoutBase + 3];
    this.extended = rom.prg[this.layoutBase + 4];
    this.screens = seq(
        this.height,
        y => tuple(rom.prg, this.layoutBase + 5 + y * this.width, this.width));
    // TODO - make bad screen replacement conditional?
    for (const [x, y, replacement] of locationData.replace || []) {
      this.screens[y][x] = replacement;
    }
    this.tilePalettes = tuple<number>(rom.prg, this.graphicsBase, 3);
    this.tileset = rom.prg[this.graphicsBase + 3];
    this.tileEffects = rom.prg[this.graphicsBase + 4];
    this.tilePatterns = tuple(rom.prg, this.graphicsBase + 5, 2);

    this.entrances =
      group(4, rom.prg.slice(this.entrancesBase, this.entrancesBase + entranceLen),
            x => new Entrance(x));
    this.flags = varSlice(rom.prg, this.flagsBase, 2, 0xff, Infinity,
                          x => new Flag(x));
    this.pits = this.pitsBase ? varSlice(rom.prg, this.pitsBase, 4, 0xff, Infinity,
                                         x => new Pit(x)) : [];

    this.npcDataPointer = 0x19201 + (id << 1);
    this.npcDataBase = readLittleEndian(rom.prg, this.npcDataPointer) + 0x10000;
    this.hasSpawns = this.npcDataBase !== 0x10000;
    this.spritePalettes =
        this.hasSpawns ? tuple(rom.prg, this.npcDataBase + 1, 2) : [0, 0];
    this.spritePatterns =
        this.hasSpawns ? tuple(rom.prg, this.npcDataBase + 3, 2) : [0, 0];
    this.spawns =
        this.hasSpawns ? varSlice(rom.prg, this.npcDataBase + 5, 4, 0xff, Infinity,
                                  x => new Spawn(x)) : [];
  }

  get width(): number { return this.layoutWidth + 1; }
  set width(width: number) { this.layoutWidth = width - 1; }

  get height(): number { return this.layoutHeight + 1; }
  set height(height: number) { this.layoutHeight = height - 1; }

  // monsters() {
  //   if (!this.spawns) return [];
  //   return this.spawns.flatMap(
  //     ([,, type, id], slot) =>
  //       type & 7 || !this.rom.spawns[id + 0x50] ? [] : [
  //         [this.id,
  //          slot + 0x0d,
  //          type & 0x80 ? 1 : 0,
  //          id + 0x50,
  //          this.spritePatterns[type & 0x80 ? 1 : 0],
  //          this.rom.spawns[id + 0x50].palettes()[0],
  //          this.spritePalettes[this.rom.spawns[id + 0x50].palettes()[0] - 2],
  //         ]]);
  // }

  async write(writer: Writer): Promise<void> {
    if (!this.used) return;
    const promises = [];
    if (this.hasSpawns) {
      // write NPC data first, if present...
      const data = [0, ...this.spritePalettes, ...this.spritePatterns,
                    ...concatIterables(this.spawns), 0xff];
      promises.push(
          writer.write(data, 0x18000, 0x1bfff, `NpcData ${hex(this.id)}`)
              .then(address => writeLittleEndian(
                  writer.rom, this.npcDataPointer, address - 0x10000)));
    }

    const write = (data: Data<number>, name: string) =>
        writer.write(data, 0x14000, 0x17fff, `${name} ${hex(this.id)}`);
    const layout = [
      this.bgm,
      this.layoutWidth, this.layoutHeight, this.animation, this.extended,
      ...concatIterables(this.screens)];
    const graphics =
        [...this.tilePalettes,
         this.tileset, this.tileEffects,
         ...this.tilePatterns];
    const entrances = concatIterables(this.entrances);
    const exits = [...concatIterables(this.exits),
                   0x80 | (this.pits.length ? 0x40 : 0) | this.entrances.length,
                  ];
    const flags = [...concatIterables(this.flags), 0xff];
    const pits = concatIterables(this.pits);
    const [layoutAddr, graphicsAddr, entrancesAddr, exitsAddr, flagsAddr, pitsAddr] =
        await Promise.all([
          write(layout, 'Layout'),
          write(graphics, 'Graphics'),
          write(entrances, 'Entrances'),
          write(exits, 'Exits'),
          write(flags, 'Flags'),
          ...(pits.length ? [write(pits, 'Pits')] : []),
        ]);
    const addresses = [
      layoutAddr & 0xff, (layoutAddr >>> 8) - 0xc0,
      graphicsAddr & 0xff, (graphicsAddr >>> 8) - 0xc0,
      entrancesAddr & 0xff, (entrancesAddr >>> 8) - 0xc0,
      exitsAddr & 0xff, (exitsAddr >>> 8) - 0xc0,
      flagsAddr & 0xff, (flagsAddr >>> 8) - 0xc0,
      ...(pitsAddr ? [pitsAddr & 0xff, (pitsAddr >> 8) - 0xc0] : []),
    ];
    const base = await write(addresses, 'MapData');
    writeLittleEndian(writer.rom, this.mapDataPointer, base - 0xc000);
    await Promise.all(promises);
  }

  /** @return {!Set<!Screen>} */
  allScreens() {
    const screens = new Set();
    const ext = this.extended ? 0x100 : 0;
    for (const row of this.screens) {
      for (const screen of row) {
        screens.add(this.rom.screens[screen + ext]);
      }
    }
    return screens;
  }

  /** @return {!Set<number>} */
  // allTiles() {
  //   const tiles = new Set();
  //   for (const screen of this.screens) {
  //     for (const tile of screen.allTiles()) {
  //       tiles.add(tile);
  //     }
  //   }
  //   return tiles;
  // }
}

export const Entrance = DataTuple.make(4, {
  x: DataTuple.prop([0], [1, 0xff, -8]),
  y: DataTuple.prop([2], [3, 0xff, -8]),

  toString(this: any): string {
    return `Entrance ${this.hex()}: (${hex(this.x)}, ${hex(this.y)})`;
  },
});
export type Entrance = InstanceType<typeof Entrance>;

export const Exit = DataTuple.make(4, {
  x:        DataTuple.prop([0, 0xff, -4]),
  xt:       DataTuple.prop([0]),

  y:        DataTuple.prop([1, 0xff, -4]),
  yt:       DataTuple.prop([1]),

  dest:     DataTuple.prop([2]),

  entrance: DataTuple.prop([3]),

  toString(this: any): string {
    return `Exit ${this.hex()}: (${hex(this.x)}, ${hex(this.y)}) => ${
            this.dest}:${this.entrance}`;
  },
});
export type Exit = InstanceType<typeof Exit>;

export const Flag = DataTuple.make(2, {
  flag:  {
    get(this: any): number { return this.data[0] | 0x200; },
    set(this: any, f: number) {
      if ((f & ~0xff) !== 0x200) throw new Error(`bad flag: ${hex(f)}`);
      this.data[0] = f & 0xff;
    },
  },

  x:     DataTuple.prop([1, 0x07, -8]),
  xs:    DataTuple.prop([1, 0x07]),

  y:     DataTuple.prop([1, 0xf0, -4]),
  ys:    DataTuple.prop([1, 0xf0, 4]),

  yx:    DataTuple.prop([1]), // y in hi nibble, x in lo.

  toString(this: any): string {
    return `Flag ${this.hex()}: (${hex(this.xs)}, ${hex(this.ys)}) @ ${
            hex(this.flag)}`;
  },
});
export type Flag = InstanceType<typeof Flag>;

export const Pit = DataTuple.make(4, {
  fromXs:  DataTuple.prop([1, 0x70, 4]),
  toXs:    DataTuple.prop([1, 0x07]),

  fromYs:  DataTuple.prop([3, 0xf0, 4]),
  toYs:    DataTuple.prop([3, 0x0f]),

  dest:    DataTuple.prop([0]),

  toString(this: any): string {
    return `Pit ${this.hex()}: (${hex(this.fromXs)}, ${hex(this.fromYs)}) => ${
            hex(this.dest)}:(${hex(this.toXs)}, ${hex(this.toYs)})`;
  },
});
export type Pit = InstanceType<typeof Pit>;

export const Spawn = DataTuple.make(4, {
  y:     DataTuple.prop([0, 0xff, -4]),
  yt:    DataTuple.prop([0]),

  timed: DataTuple.booleanProp([1, 0x80, 7]),
  x:     DataTuple.prop([1, 0x7f, -4], [2, 0x40, 3]),
  xt:    DataTuple.prop([1, 0x7f]),

  patternBank: DataTuple.prop([2, 0x80, 7]),
  type:  DataTuple.prop([2, 0x07]),

  id:    DataTuple.prop([3]),

  monsterId: {get(this: any): number { return (this.id + 0x50) & 0xff; },
              set(this: any, id: number) { this.id = (id - 0x50) & 0xff; }},
  isChest(this: any): boolean { return this.type === 2 && this.id < 0x80; },
  isTrigger(this: any): boolean { return this.type === 2 && this.id >= 0x80; },
  isMonster(this: any): boolean { return this.type === 0; },
  toString(this: any): string {
    return `Spawn ${this.hex()}: (${hex(this.x)}, ${hex(this.y)}) ${
            this.timed ? 'timed' : 'fixed'} ${this.type}:${hex(this.id)}`;
  },
});
export type Spawn = InstanceType<typeof Spawn>;

export const LOCATIONS: ReadonlyArray<LocationData> = (() => {
  const locs: LocationData[] = [];
  interface LocParam {
    replace?: ScreenReplacement;
  }
  function loc(index: number, name: string, {replace}: LocParam = {}) {
    const data: Mutable<LocationData> = {name};
    if (replace) data.replace = replace;
    locs[index] = data;
  }

  loc(0x00, 'Mezame Shrine');
  loc(0x01, 'Leaf - Outside Start');
  loc(0x02, 'Leaf');
  loc(0x03, 'Valley of Wind');
  loc(0x04, 'Sealed Cave 1');
  loc(0x05, 'Sealed Cave 2');
  loc(0x06, 'Sealed Cave 6');
  loc(0x07, 'Sealed Cave 4');
  loc(0x08, 'Sealed Cave 5');
  loc(0x09, 'Sealed Cave 3');
  loc(0x0a, 'Sealed Cave 7');
  // INVALID: 0x0b
  loc(0x0c, 'Sealed Cave 8');
  // INVALID: 0x0d
  loc(0x0e, 'Windmill Cave');
  loc(0x0f, 'Windmill');
  loc(0x10, 'Zebu Cave');
  loc(0x11, 'Mt Sabre West - Cave 1');
  // INVALID: 0x12
  // INVALID: 0x13
  loc(0x14, 'Cordel Plains West');
  loc(0x15, 'Cordel Plains East'); // "Maze of Forest"?
  // INVALID: 0x16 -- unused copy of 18
  // INVALID: 0x17
  loc(0x18, 'Brynmaer');
  loc(0x19, 'Outside Stom House');
  loc(0x1a, 'Swamp');
  loc(0x1b, 'Amazones');
  loc(0x1c, 'Oak');
  // INVALID: 0x1d
  loc(0x1e, 'Stom House');
  // INVALID: 0x1f
  loc(0x20, 'Mt Sabre West - Lower');
  loc(0x21, 'Mt Sabre West - Upper');
  loc(0x22, 'Mt Sabre West - Cave 2');
  loc(0x23, 'Mt Sabre West - Cave 3');
  loc(0x24, 'Mt Sabre West - Cave 4',
      {replace: [[3, 4, 0x80]]});
  loc(0x25, 'Mt Sabre West - Cave 5');
  loc(0x26, 'Mt Sabre West - Cave 6');
  loc(0x27, 'Mt Sabre West - Cave 7');
  loc(0x28, 'Mt Sabre North - Main');
  loc(0x29, 'Mt Sabre North - Middle');
  loc(0x2a, 'Mt Sabre North - Cave 2');
  loc(0x2b, 'Mt Sabre North - Cave 3');
  loc(0x2c, 'Mt Sabre North - Cave 4');
  loc(0x2d, 'Mt Sabre North - Cave 5');
  loc(0x2e, 'Mt Sabre North - Cave 6');
  loc(0x2f, 'Mt Sabre North - Prison Hall');
  loc(0x30, 'Mt Sabre North - Left Cell');
  loc(0x31, 'Mt Sabre North - Left Cell 2');
  loc(0x32, 'Mt Sabre North - Right Cell');
  loc(0x33, 'Mt Sabre North - Cave 8');
  loc(0x34, 'Mt Sabre North - Cave 9');
  loc(0x35, 'Mt Sabre North - Summit Cave');
  // INVALID: 0x36
  // INVALID: 0x37
  loc(0x38, 'Mt Sabre North - Cave 1');
  loc(0x39, 'Mt Sabre North - Cave 7');
  // INVALID: 0x3a
  // INVALID: 0x3b
  loc(0x3c, 'Nadare - Inn');
  loc(0x3d, 'Nadare - Tool Shop');
  loc(0x3e, 'Nadare - Back Room');
  // INVALID: 0x3f
  loc(0x40, 'Waterfall Valley North');
  loc(0x41, 'Waterfall Valley South');
  loc(0x42, 'Lime Tree Valley',
      {replace: [[0, 2, 0x00]]});
  loc(0x43, 'Lime Tree Lake');
  loc(0x44, 'Kirisa Plant Cave 1');
  loc(0x45, 'Kirisa Plant Cave 2');
  loc(0x46, 'Kirisa Plant Cave 3');
  loc(0x47, 'Kirisa Meadow');
  loc(0x48, 'Fog Lamp Cave 1');
  loc(0x49, 'Fog Lamp Cave 2');
  loc(0x4a, 'Fog Lamp Cave 3');
  loc(0x4b, 'Fog Lamp Cave Dead End');
  loc(0x4c, 'Fog Lamp Cave 4');
  loc(0x4d, 'Fog Lamp Cave 5');
  loc(0x4e, 'Fog Lamp Cave 6');
  loc(0x4f, 'Fog Lamp Cave 7');
  loc(0x50, 'Portoa');
  loc(0x51, 'Portoa - Fisherman Island');
  loc(0x52, 'Mesia Shrine');
  // INVALID: 0x53
  loc(0x54, 'Waterfall Cave 1');
  loc(0x55, 'Waterfall Cave 2');
  loc(0x56, 'Waterfall Cave 3');
  loc(0x57, 'Waterfall Cave 4');
  loc(0x58, 'Tower - Entrance');
  loc(0x59, 'Tower 1');
  loc(0x5a, 'Tower 2');
  loc(0x5b, 'Tower 3');
  loc(0x5c, 'Tower - Outside Mesia');
  loc(0x5d, 'Tower - Outside Dyna');
  loc(0x5e, 'Tower - Mesia');
  loc(0x5f, 'Tower - Dyna');
  loc(0x60, 'Angry Sea');
  loc(0x61, 'Boat House');
  loc(0x62, 'Joel - Lighthouse');
  // INVALID: 0x63
  loc(0x64, 'Underground Channel');
  loc(0x65, 'Zombie Town');
  // INVALID: 0x66
  // INVALID: 0x67
  loc(0x68, 'Evil Spirit Island 1');
  loc(0x69, 'Evil Spirit Island 2');
  loc(0x6a, 'Evil Spirit Island 3');
  loc(0x6b, 'Evil Spirit Island 4');
  loc(0x6c, 'Sabera Palace 1');
  loc(0x6d, 'Sabera Palace 2');
  loc(0x6e, 'Sabera Palace 3');
  // INVALID: 0x6f -- Sabera Palace 3 unused copy
  loc(0x70, 'Joel - Secret Passage');
  loc(0x71, 'Joel');
  loc(0x72, 'Swan');
  loc(0x73, 'Swan - Gate');
  // INVALID: 0x74
  // INVALID: 0x75
  // INVALID: 0x76
  // INVALID: 0x77
  loc(0x78, 'Goa Valley');
  // INVALID: 0x79
  // INVALID: 0x7a
  // INVALID: 0x7b
  loc(0x7c, 'Mt Hydra');
  loc(0x7d, 'Mt Hydra - Cave 1');
  loc(0x7e, 'Mt Hydra - Outside Shyron');
  loc(0x7f, 'Mt Hydra - Cave 2');
  loc(0x80, 'Mt Hydra - Cave 3');
  loc(0x81, 'Mt Hydra - Cave 4');
  loc(0x82, 'Mt Hydra - Cave 5');
  loc(0x83, 'Mt Hydra - Cave 6');
  loc(0x84, 'Mt Hydra - Cave 7');
  loc(0x85, 'Mt Hydra - Cave 8');
  loc(0x86, 'Mt Hydra - Cave 9');
  loc(0x87, 'Mt Hydra - Cave 10');
  loc(0x88, 'Styx 1');
  loc(0x89, 'Styx 2');
  loc(0x8a, 'Styx 3');
  // INVALID: 0x8b
  loc(0x8c, 'Shyron');
  // INVALID: 0x8d
  loc(0x8e, 'Goa');
  loc(0x8f, 'Goa Fortress - Oasis Entrance');
  loc(0x90, 'Desert 1');
  loc(0x91, 'Oasis Cave - Main',
      {replace: [
        [0, 11, 0x80], [1, 11, 0x80], [2, 11, 0x80], [3, 11, 0x80],
        [4, 11, 0x80], [5, 11, 0x80], [6, 11, 0x80], [7, 11, 0x80]]});
  loc(0x92, 'Desert Cave 1');
  loc(0x93, 'Sahara');
  loc(0x94, 'Sahara - Outside Cave');
  loc(0x95, 'Desert Cave 2');
  loc(0x96, 'Sahara Meadow');
  // INVALID: 0x97
  loc(0x98, 'Desert 2');
  // INVALID: 0x99
  // INVALID: 0x9a
  // INVALID: 0x9b
  loc(0x9c, 'Pyramid Front - Entrance');
  loc(0x9d, 'Pyramid Front - Branch');
  loc(0x9e, 'Pyramid Front - Main');
  loc(0x9f, 'Pyramid Front - Draygon');
  loc(0xa0, 'Pyramid Back - Entrance');
  loc(0xa1, 'Pyramid Back - Hall 1');
  loc(0xa2, 'Pyramid Back - Branch');
  loc(0xa3, 'Pyramid Back - Dead End Left');
  loc(0xa4, 'Pyramid Back - Dead End Right');
  loc(0xa5, 'Pyramid Back - Hall 2');
  loc(0xa6, 'Pyramid Back - Draygon Revisited');
  loc(0xa7, 'Pyramid Back - Teleporter');
  loc(0xa8, 'Goa Fortress - Entrance');
  loc(0xa9, 'Goa Fortress - Kelbesque');
  loc(0xaa, 'Goa Fortress - Zebu');
  loc(0xab, 'Goa Fortress - Sabera');
  loc(0xac, 'Goa Fortress - Tornel');
  loc(0xad, 'Goa Fortress - Mado 1');
  loc(0xae, 'Goa Fortress - Mado 2');
  loc(0xaf, 'Goa Fortress - Mado 3');
  loc(0xb0, 'Goa Fortress - Karmine 1');
  loc(0xb1, 'Goa Fortress - Karmine 2');
  loc(0xb2, 'Goa Fortress - Karmine 3');
  loc(0xb3, 'Goa Fortress - Karmine 4');
  loc(0xb4, 'Goa Fortress - Karmine 5');
  loc(0xb5, 'Goa Fortress - Karmine 6');
  loc(0xb6, 'Goa Fortress - Karmine 7');
  loc(0xb7, 'Goa Fortress - Exit');
  loc(0xb8, 'Oasis Cave - Entrance');
  loc(0xb9, 'Goa Fortress - Asina');
  loc(0xba, 'Goa Fortress - Kensu'); // seamless from B4
  loc(0xbb, 'Goa - House');
  loc(0xbc, 'Goa - Inn');
  // INVALID: 0xbd
  loc(0xbe, 'Goa - Tool Shop');
  loc(0xbf, 'Goa - Tavern');
  loc(0xc0, 'Leaf - Elder House');
  loc(0xc1, 'Leaf - Rabbit Hut');
  loc(0xc2, 'Leaf - Inn');
  loc(0xc3, 'Leaf - Tool Shop');
  loc(0xc4, 'Leaf - Armor Shop');
  loc(0xc5, 'Leaf - Student House');
  loc(0xc6, 'Brynmaer - Tavern');
  loc(0xc7, 'Brynmaer - Pawn Shop');
  loc(0xc8, 'Brynmaer - Inn');
  loc(0xc9, 'Brynmaer - Armor Shop');
  // INVALID: 0xca
  loc(0xcb, 'Brynmaer - Item Shop');
  // INVALID: 0xcc
  loc(0xcd, 'Oak - Elder House');
  loc(0xce, 'Oak - Mother House');
  loc(0xcf, 'Oak - Tool Shop');
  loc(0xd0, 'Oak - Inn');
  loc(0xd1, 'Amazones - Inn');
  loc(0xd2, 'Amazones - Item Shop');
  loc(0xd3, 'Amazones - Armor Shop');
  loc(0xd4, 'Amazones - Elder');
  loc(0xd5, 'Nadare');
  loc(0xd6, 'Portoa - Fisherman House');
  loc(0xd7, 'Portoa - Palace Entrance');
  loc(0xd8, 'Portoa - Fortune Teller');
  loc(0xd9, 'Portoa - Pawn Shop');
  loc(0xda, 'Portoa - Armor Shop');
  // INVALID: 0xdb
  loc(0xdc, 'Portoa - Inn');
  loc(0xdd, 'Portoa - Tool Shop');
  loc(0xde, 'Portoa - Palace Left');
  loc(0xdf, 'Portoa - Palace Throne Room');
  loc(0xe0, 'Portoa - Palace Right');
  loc(0xe1, 'Portoa - Asina Room');
  loc(0xe2, 'Amazones - Elder Downstairs');
  loc(0xe3, 'Joel - Elder House');
  loc(0xe4, 'Joel - Shed');
  loc(0xe5, 'Joel - Tool Shop');
  // INVALID: 0xe6
  loc(0xe7, 'Joel - Inn');
  loc(0xe8, 'Zombie Town - House');
  loc(0xe9, 'Zombie Town - House Basement');
  // INVALID: 0xea
  loc(0xeb, 'Swan - Tool Shop');
  loc(0xec, 'Swan - Stom Hut');
  loc(0xed, 'Swan - Inn');
  loc(0xee, 'Swan - Armor Shop');
  loc(0xef, 'Swan - Tavern');
  loc(0xf0, 'Swan - Pawn Shop');
  loc(0xf1, 'Swan - Dance Hall');
  loc(0xf2, 'Shyron - Fortress');
  loc(0xf3, 'Shyron - Training Hall');
  loc(0xf4, 'Shyron - Hospital');
  loc(0xf5, 'Shyron - Armor Shop');
  loc(0xf6, 'Shyron - Tool Shop');
  loc(0xf7, 'Shyron - Inn');
  loc(0xf8, 'Sahara - Inn');
  loc(0xf9, 'Sahara - Tool Shop');
  loc(0xfa, 'Sahara - Elder House');
  loc(0xfb, 'Sahara - Pawn Shop');
  // INVALID: 0xfc
  // INVALID: 0xfd
  // INVALID: 0xfe
  // INVALID: 0xff

  return locs;
})();

/** Each entry is [x, y, replacement]. */
type ScreenReplacement = ReadonlyArray<ReadonlyArray<number>>;

/** Stores manually-entered metadata about locations. */
interface LocationData {
  /** Human-readable name for the location. */
  readonly name: string;
  /** Bad screens that need to be replaced. */
  readonly replace?: ScreenReplacement;
}

// building the CSV for the location table.
//const h=(x)=>x==null?'null':'$'+x.toString(16).padStart(2,0);
//'id,name,bgm,width,height,animation,extended,tilepat0,tilepat1,tilepal0,tilepal1,tileset,tile effects,exits,sprpat0,sprpat1,sprpal0,sprpal1,obj0d,obj0e,obj0f,obj10,obj11,obj12,obj13,obj14,obj15,obj16,obj17,obj18,obj19,obj1a,obj1b,obj1c,obj1d,obj1e,obj1f\n'+rom.locations.map(l=>!l||!l.used?'':[h(l.id),l.name,h(l.bgm),l.layoutWidth,l.layoutHeight,l.animation,l.extended,h((l.tilePatterns||[])[0]),h((l.tilePatterns||[])[1]),h((l.tilePalettes||[])[0]),h((l.tilePalettes||[])[1]),h(l.tileset),h(l.tileEffects),[...new Set(l.exits.map(x=>h(x[2])))].join(':'),h((l.spritePatterns||[])[0]),h((l.spritePatterns||[])[1]),h((l.spritePalettes||[])[0]),h((l.spritePalettes||[])[1]),...new Array(19).fill(0).map((v,i)=>((l.objects||[])[i]||[]).slice(2).map(x=>x.toString(16)).join(':'))]).filter(x=>x).join('\n')

// building csv for loc-obj cross-reference table
// seq=(s,e,f)=>new Array(e-s).fill(0).map((x,i)=>f(i+s));
// uniq=(arr)=>{
//   const m={};
//   for (let o of arr) {
//     o[6]=o[5]?1:0;
//     if(!o[5])m[o[2]]=(m[o[2]]||0)+1;
//   }
//   for (let o of arr) {
//     if(o[2] in m)o[6]=m[o[2]];
//     delete m[o[2]];
//   }
//   return arr;
// }
// 'loc,locname,mon,monname,spawn,type,uniq,patslot,pat,palslot,pal2,pal3\n'+
// rom.locations.flatMap(l=>!l||!l.used?[]:uniq(seq(0xd,0x20,s=>{
//   const o=(l.objects||[])[s-0xd]||null;
//   if (!o) return null;
//   const type=o[2]&7;
//   const m=type?null:0x50+o[3];
//   const patSlot=o[2]&0x80?1:0;
//   const mon=m?rom.objects[m]:null;
//   const palSlot=(mon?mon.palettes(false):[])[0];
//   const allPal=new Set(mon?mon.palettes(true):[]);
//   return [h(l.id),l.name,h(m),'',h(s),type,0,patSlot,m?h((l.spritePatterns||[])[patSlot]):'',palSlot,allPal.has(2)?h((l.spritePalettes||[])[0]):'',allPal.has(3)?h((l.spritePalettes||[])[1]):''];
// }).filter(x=>x))).map(a=>a.join(',')).filter(x=>x).join('\n');

