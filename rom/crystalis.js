import {DataTable, Vector, readWord} from './rom/js';

class MapTiles extends Vector {
  constructor(rom) { super(rom, 0, 256, 256); }
}

class MapDataTable extends DataTable {
  constructor(rom) {
    super(rom, 0x14300, 256, 0xc000, this.readLocation.bind(this));
  }

  readLocation(data, address, rom) {
    
  }

}

const MapData {
  constructor(data, address) {
    const table0 = data.subarray(readWord(data, 0) - address);
    const table1 = data.subarray(readWord(data, 2) - address);
    const table2 = data.subarray(readWord(data, 4) - address);
    const table3 = data.subarray(readWord(data, 6) - address);
    const table4 = data.subarray(readWord(data, 8) - address);
    const table5 = data.subarray(readWord(data, 10) - address);
    // TABLE 0: General information and map tiles
    this.bgm = table0[0];
    this.width = table0[1];
    this.height = table0[2];
    this.anim = table0[3];
    this.tileSet = table0[4];
    this.tiles = table0.subarray(5, 5 + this.width * this.height);
    // TABLE 1: ???
    // TABLE 2: ???
    // TABLE 3: Exits
    
  }
}

// how to build up a map
//  - look at mapdata tables
//    - width and height
//    - palettes (first 3 in graphics) and patterns (#4)
//    - for each screen
//      look up screen in 0000-ffff
//      - for each tile
//        <20 means flag can swap it out - if so read alternative in 13e00
//        look up patterns in $12000,
//        look up attributes in $13....?
