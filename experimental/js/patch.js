import { Assembler } from './6502.js';
import { crc32 } from './crc32.js';
import { generate as generateDepgraph } from './depgraph.js';
import { FetchReader } from './fetchreader.js';
import { FlagSet } from './flagset.js';
import { AssumedFill } from './graph/shuffle.js';
import { World } from './graph/world.js';
import { fixDialog } from './pass/fixdialog.js';
import { fixReverseWalls } from './pass/fixreversewalls.js';
import { shuffleMazes } from './pass/shufflemazes.js';
import { shufflePalettes } from './pass/shufflepalettes.js';
import { shuffleTrades } from './pass/shuffletrades.js';
import { unidentifiedItems } from './pass/unidentifieditems.js';
import { Random } from './random.js';
import { Rom } from './rom.js';
import { Entrance, Exit, Flag, Spawn } from './rom/location.js';
import { GlobalDialog, LocalDialog } from './rom/npc.js';
import { ShopType } from './rom/shop.js';
import * as slots from './rom/slots.js';
import { Spoiler } from './rom/spoiler.js';
import { hex, seq, watchArray, writeLittleEndian } from './rom/util.js';
import * as version from './version.js';
import { Graphics } from './rom/graphics.js';
import { Constraint } from './rom/constraint.js';
import { Monster } from './rom/monster.js';
export default ({
    async apply(rom, hash, path) {
        let flags;
        if (!hash.seed) {
            hash.seed = parseSeed('').toString(16);
            window.location.hash += '&seed=' + hash.seed;
        }
        if (hash.flags) {
            flags = new FlagSet(String(hash.flags));
        }
        else {
            flags = new FlagSet('Em Gt Mr Rlpt Sbk Sct Sm Tasd');
        }
        for (const key in hash) {
            if (hash[key] === 'false')
                hash[key] = false;
        }
        await shuffle(rom, parseSeed(String(hash.seed)), flags, new FetchReader(path));
    },
});
export function parseSeed(seed) {
    if (!seed)
        return Random.newSeed();
    if (/^[0-9a-f]{1,8}$/i.test(seed))
        return Number.parseInt(seed, 16);
    return crc32(seed);
}
const {} = { watchArray };
export async function shuffle(rom, seed, flags, reader, log, progress) {
    if (typeof seed !== 'number')
        throw new Error('Bad seed');
    const newSeed = crc32(seed.toString(16).padStart(8, '0') + String(flags)) >>> 0;
    const touchShops = true;
    const defines = {
        _ALLOW_TELEPORT_OUT_OF_BOSS: flags.hardcoreMode() &&
            flags.shuffleBossElements(),
        _ALLOW_TELEPORT_OUT_OF_TOWER: true,
        _AUTO_EQUIP_BRACELET: flags.autoEquipBracelet(),
        _BARRIER_REQUIRES_CALM_SEA: flags.barrierRequiresCalmSea(),
        _BUFF_DEOS_PENDANT: flags.buffDeosPendant(),
        _BUFF_DYNA: flags.buffDyna(),
        _CHECK_FLAG0: true,
        _CUSTOM_SHOOTING_WALLS: true,
        _DEBUG_DIALOG: seed === 0x17bc,
        _DISABLE_SHOP_GLITCH: flags.disableShopGlitch(),
        _DISABLE_STATUE_GLITCH: flags.disableStatueGlitch(),
        _DISABLE_SWORD_CHARGE_GLITCH: flags.disableSwordChargeGlitch(),
        _DISABLE_WILD_WARP: false,
        _DISPLAY_DIFFICULTY: true,
        _EXTRA_PITY_MP: true,
        _FIX_COIN_SPRITES: true,
        _FIX_OPEL_STATUE: true,
        _FIX_SHAKING: true,
        _FIX_VAMPIRE: true,
        _HARDCORE_MODE: flags.hardcoreMode(),
        _LEATHER_BOOTS_GIVE_SPEED: flags.leatherBootsGiveSpeed(),
        _NERF_FLIGHT: true,
        _NERF_WILD_WARP: flags.nerfWildWarp(),
        _NEVER_DIE: flags.neverDie(),
        _NORMALIZE_SHOP_PRICES: touchShops,
        _PITY_HP_AND_MP: true,
        _PROGRESSIVE_BRACELET: true,
        _RABBIT_BOOTS_CHARGE_WHILE_WALKING: flags.rabbitBootsChargeWhileWalking(),
        _REQUIRE_HEALED_DOLPHIN_TO_RIDE: flags.requireHealedDolphinToRide(),
        _REVERSIBLE_SWAN_GATE: true,
        _SAHARA_RABBITS_REQUIRE_TELEPATHY: flags.saharaRabbitsRequireTelepathy(),
        _SIMPLIFY_INVISIBLE_CHESTS: true,
        _TELEPORT_ON_THUNDER_SWORD: flags.teleportOnThunderSword(),
        _UNIDENTIFIED_ITEMS: flags.unidentifiedItems(),
    };
    const asm = new Assembler();
    async function assemble(path) {
        asm.assemble(await reader.read(path), path);
        asm.patchRom(rom);
    }
    const flagFile = Object.keys(defines)
        .filter(d => defines[d]).map(d => `define ${d} 1\n`).join('');
    asm.assemble(flagFile, 'flags.s');
    await assemble('preshuffle.s');
    const random = new Random(newSeed);
    const parsed = new Rom(rom);
    fixCoinSprites(parsed);
    if (typeof window == 'object')
        window.rom = parsed;
    parsed.spoiler = new Spoiler(parsed);
    if (log)
        log.spoiler = parsed.spoiler;
    fixMimics(parsed);
    makeBraceletsProgressive(parsed);
    if (flags.blackoutMode())
        blackoutMode(parsed);
    closeCaveEntrances(parsed, flags);
    reversibleSwanGate(parsed);
    adjustGoaFortressTriggers(parsed);
    preventNpcDespawns(parsed, flags);
    if (flags.requireHealedDolphinToRide())
        requireHealedDolphin(parsed);
    if (flags.saharaRabbitsRequireTelepathy())
        requireTelepathyForDeo(parsed);
    adjustItemNames(parsed, flags);
    await assemble('postparse.s');
    alarmFluteIsKeyItem(parsed);
    if (flags.teleportOnThunderSword()) {
        teleportOnThunderSword(parsed);
    }
    else {
        noTeleportOnThunderSword(parsed);
    }
    parsed.scalingLevels = 48;
    parsed.uniqueItemTableAddress = asm.expand('KeyItemData');
    undergroundChannelLandBridge(parsed);
    if (flags.connectLimeTreeToLeaf())
        connectLimeTreeToLeaf(parsed);
    simplifyInvisibleChests(parsed);
    addCordelWestTriggers(parsed, flags);
    if (flags.disableRabbitSkip())
        fixRabbitSkip(parsed);
    if (flags.shuffleShops())
        shuffleShops(parsed, flags, random);
    randomizeWalls(parsed, flags, random);
    if (flags.randomizeWildWarp())
        shuffleWildWarp(parsed, flags, random);
    rescaleMonsters(parsed, flags, random);
    unidentifiedItems(parsed, flags, random);
    shuffleTrades(parsed, flags, random);
    if (flags.randomizeMaps())
        shuffleMazes(parsed, random);
    const w = World.build(parsed, flags);
    const fill = await new AssumedFill(parsed, flags).shuffle(w.graph, random, progress);
    if (fill) {
        w.traverse(w.graph, fill);
        slots.update(parsed, fill.slots);
    }
    else {
        return -1;
    }
    if (touchShops) {
        rescaleShops(parsed, asm, flags.bargainHunting() ? random : undefined);
    }
    normalizeSwords(parsed, flags, random);
    if (flags.shuffleMonsters())
        shuffleMonsters(parsed, flags, random);
    identifyKeyItemsForDifficultyBuffs(parsed);
    if (flags.doubleBuffMedicalHerb()) {
        rom[0x1c50c + 0x10] *= 2;
        rom[0x1c4ea + 0x10] *= 3;
    }
    else if (flags.buffMedicalHerb()) {
        rom[0x1c50c + 0x10] += 16;
        rom[0x1c4ea + 0x10] *= 2;
    }
    if (flags.storyMode())
        storyMode(parsed);
    if (flags.chargeShotsOnly())
        disableStabs(parsed);
    if (flags.orbsOptional())
        orbsOptional(parsed);
    shuffleMusic(parsed, flags, random);
    shufflePalettes(parsed, flags, random);
    misc(parsed, flags, random);
    fixDialog(parsed);
    fixReverseWalls(parsed);
    if (flags.buffDyna())
        buffDyna(parsed, flags);
    await parsed.writeData();
    buffDyna(parsed, flags);
    const crc = await postParsedShuffle(rom, random, seed, flags, asm, assemble);
    return crc;
}
async function postParsedShuffle(rom, random, seed, flags, asm, assemble) {
    await assemble('postshuffle.s');
    updateDifficultyScalingTables(rom, flags, asm);
    updateCoinDrops(rom, flags);
    shuffleRandomNumbers(rom, random);
    return stampVersionSeedAndHash(rom, seed, flags);
}
;
function fixCoinSprites(rom) {
    for (const page of [0x60, 0x64, 0x65, 0x66, 0x67, 0x68,
        0x69, 0x6a, 0x6b, 0x6c, 0x6d, 0x6f]) {
        for (const pat of [0, 1, 2]) {
            rom.patterns[page << 6 | pat].pixels = rom.patterns[0x5e << 6 | pat].pixels;
        }
    }
}
function undergroundChannelLandBridge(rom) {
    const { tiles } = rom.screens[0xa1];
    tiles[0x28] = 0x9f;
    tiles[0x37] = 0x23;
    tiles[0x38] = 0x23;
    tiles[0x39] = 0x21;
    tiles[0x47] = 0x8d;
    tiles[0x48] = 0x8f;
    tiles[0x56] = 0x99;
    tiles[0x57] = 0x9a;
    tiles[0x58] = 0x8c;
}
function misc(rom, flags, random) {
    const {} = { rom, flags, random };
    rom.messages.parts[2][2].text = `
{01:Akahana} is handed a statue.#
Thanks for finding that.
I was totally gonna sell
it for tons of cash.#
Here, have this lame
[29:Gas Mask] or something.`;
    rom.messages.parts[0][0xe].text = `It's dangerous to go alone! Take this.`;
    rom.messages.parts[0][0xe].fixText();
}
;
function shuffleShops(rom, _flags, random) {
    const shops = {
        [ShopType.ARMOR]: { contents: [], shops: [] },
        [ShopType.TOOL]: { contents: [], shops: [] },
    };
    for (const shop of rom.shops) {
        if (!shop.used || shop.location === 0xff)
            continue;
        const data = shops[shop.type];
        if (data) {
            data.contents.push(...shop.contents.filter(x => x !== 0xff));
            data.shops.push(shop);
            shop.contents = [];
        }
    }
    for (const data of Object.values(shops)) {
        let slots = null;
        const items = [...data.contents];
        random.shuffle(items);
        while (items.length) {
            if (!slots || !slots.length) {
                if (slots)
                    items.shift();
                slots = [...data.shops, ...data.shops, ...data.shops, ...data.shops];
                random.shuffle(slots);
            }
            const item = items[0];
            const shop = slots[0];
            if (shop.contents.length < 4 && !shop.contents.includes(item)) {
                shop.contents.push(item);
                items.shift();
            }
            slots.shift();
        }
    }
    for (const data of Object.values(shops)) {
        for (const shop of data.shops) {
            while (shop.contents.length < 4)
                shop.contents.push(0xff);
            shop.contents.sort((a, b) => a - b);
        }
    }
}
function randomizeWalls(rom, flags, random) {
    if (!flags.randomizeWalls())
        return;
    const pals = [
        [0x05, 0x38],
        [0x11],
        [0x6a],
        [0x14],
    ];
    function wallType(spawn) {
        if (spawn.data[2] & 0x20) {
            return (spawn.id >>> 4) & 3;
        }
        return spawn.id & 3;
    }
    const partition = rom.locations.partition(l => l.tilePalettes.join(' '), undefined, true);
    for (const [locations] of partition) {
        const elt = random.nextInt(4);
        const pal = random.pick(pals[elt]);
        let found = false;
        for (const location of locations) {
            for (const spawn of location.spawns) {
                if (spawn.isWall()) {
                    const type = wallType(spawn);
                    if (type === 2)
                        continue;
                    if (type === 3) {
                        const newElt = random.nextInt(4);
                        if (rom.spoiler)
                            rom.spoiler.addWall(location.name, type, newElt);
                        spawn.data[2] |= 0x20;
                        spawn.id = 0x30 | newElt;
                    }
                    else {
                        if (!found && rom.spoiler) {
                            rom.spoiler.addWall(location.name, type, elt);
                            found = true;
                        }
                        spawn.data[2] |= 0x20;
                        spawn.id = type << 4 | elt;
                        location.tilePalettes[2] = pal;
                    }
                }
            }
        }
    }
}
function shuffleMusic(rom, flags, random) {
    if (!flags.randomizeMusic())
        return;
    class BossMusic {
        constructor(addr) {
            this.addr = addr;
        }
        get bgm() { return rom.prg[this.addr]; }
        set bgm(x) { rom.prg[this.addr] = x; }
        partition() { return [[this], this.bgm]; }
    }
    const bossAddr = [
        0x1e4b8,
        0x1e690,
        0x1e99b,
        0x1ecb1,
        0x1ee0f,
        0x1ef83,
        0x1f187,
        0x1f311,
        0x37c30,
    ];
    const partitions = rom.locations.partition((loc) => loc.id !== 0x5f ? loc.bgm : 0)
        .filter((l) => l[1]);
    const peaceful = [];
    const hostile = [];
    const bosses = bossAddr.map(a => new BossMusic(a).partition());
    for (const part of partitions) {
        let monsters = 0;
        for (const loc of part[0]) {
            for (const spawn of loc.spawns) {
                if (spawn.isMonster())
                    monsters++;
            }
        }
        (monsters >= part[0].length ? hostile : peaceful).push(part);
    }
    const evenWeight = true;
    const extraMusic = false;
    function shuffle(parts) {
        const values = parts.map((x) => x[1]);
        if (evenWeight) {
            const used = [...new Set(values)];
            if (extraMusic)
                used.push(0x9, 0xa, 0xb, 0x1a, 0x1c, 0x1d);
            for (const [locs] of parts) {
                const value = used[random.nextInt(used.length)];
                for (const loc of locs) {
                    loc.bgm = value;
                }
            }
            return;
        }
        random.shuffle(values);
        for (const [locs] of parts) {
            const value = values.pop();
            for (const loc of locs) {
                loc.bgm = value;
            }
        }
    }
    shuffle([...peaceful, ...hostile, ...bosses]);
}
function shuffleWildWarp(rom, _flags, random) {
    const locations = [];
    for (const l of rom.locations) {
        if (l && l.used && l.id && !l.extended && (l.id & 0xf8) !== 0x58) {
            locations.push(l);
        }
    }
    random.shuffle(locations);
    rom.wildWarp.locations = [];
    for (const loc of [...locations.slice(0, 15).sort((a, b) => a.id - b.id)]) {
        rom.wildWarp.locations.push(loc.id);
        if (rom.spoiler)
            rom.spoiler.addWildWarp(loc.id, loc.name);
    }
    rom.wildWarp.locations.push(0);
}
function buffDyna(rom, _flags) {
    rom.objects[0xb8].collisionPlane = 1;
    rom.objects[0xb8].immobile = true;
    rom.objects[0xb9].collisionPlane = 1;
    rom.objects[0xb9].immobile = true;
    rom.objects[0x33].collisionPlane = 2;
    rom.adHocSpawns[0x28].slotRangeLower = 0x1c;
    rom.adHocSpawns[0x29].slotRangeUpper = 0x1c;
    rom.adHocSpawns[0x2a].slotRangeUpper = 0x1c;
}
function makeBraceletsProgressive(rom) {
    const tornel = rom.npcs[0x5f];
    const vanilla = tornel.localDialogs.get(0x21);
    const patched = [
        vanilla[0],
        vanilla[2],
        vanilla[2].clone(),
        vanilla[1],
    ];
    patched[1].condition = ~0x206;
    patched[2].condition = ~0x205;
    patched[3].condition = ~0;
    tornel.localDialogs.set(0x21, patched);
}
function blackoutMode(rom) {
    const dg = generateDepgraph();
    for (const node of dg.nodes) {
        const type = node.type;
        if (node.nodeType === 'Location' && (type === 'cave' || type === 'fortress')) {
            rom.locations[node.id].tilePalettes.fill(0x9a);
        }
    }
}
function closeCaveEntrances(rom, flags) {
    rom.locations.valleyOfWind.entrances[1].y += 16;
    rom.swapMetatiles([0x90], [0x07, [0x01, 0x00], ~0xc1], [0x0e, [0x02, 0x00], ~0xc1], [0x20, [0x03, 0x0a], ~0xd7], [0x21, [0x04, 0x0a], ~0xd7]);
    rom.swapMetatiles([0x94, 0x9c], [0x68, [0x01, 0x00], ~0xc1], [0x83, [0x02, 0x00], ~0xc1], [0x88, [0x03, 0x0a], ~0xd7], [0x89, [0x04, 0x0a], ~0xd7]);
    rom.screens[0x0a].tiles[0x38] = 0x01;
    rom.screens[0x0a].tiles[0x39] = 0x02;
    rom.screens[0x0a].tiles[0x48] = 0x03;
    rom.screens[0x0a].tiles[0x49] = 0x04;
    rom.screens[0x15].tiles[0x79] = 0x01;
    rom.screens[0x15].tiles[0x7a] = 0x02;
    rom.screens[0x15].tiles[0x89] = 0x03;
    rom.screens[0x15].tiles[0x8a] = 0x04;
    rom.screens[0x19].tiles[0x48] = 0x01;
    rom.screens[0x19].tiles[0x49] = 0x02;
    rom.screens[0x19].tiles[0x58] = 0x03;
    rom.screens[0x19].tiles[0x59] = 0x04;
    rom.screens[0x3e].tiles[0x56] = 0x01;
    rom.screens[0x3e].tiles[0x57] = 0x02;
    rom.screens[0x3e].tiles[0x66] = 0x03;
    rom.screens[0x3e].tiles[0x67] = 0x04;
    const { valleyOfWind, cordelPlainsWest, cordelPlainsEast, waterfallValleyNorth, waterfallValleySouth, kirisaMeadow, saharaOutsideCave, desert2, } = rom.locations;
    const flagsToClear = [
        [valleyOfWind, 0x30],
        [cordelPlainsWest, 0x30],
        [cordelPlainsEast, 0x30],
        [waterfallValleyNorth, 0x00],
        [waterfallValleyNorth, 0x14],
        [waterfallValleySouth, 0x74],
        [kirisaMeadow, 0x10],
        [saharaOutsideCave, 0x00],
        [desert2, 0x41],
    ];
    for (const [loc, yx] of flagsToClear) {
        loc.flags.push(Flag.of({ yx, flag: 0x2ef }));
    }
    function replaceFlag(loc, yx, flag) {
        for (const f of loc.flags) {
            if (f.yx === yx) {
                f.flag = flag;
                return;
            }
        }
        throw new Error(`Could not find flag to replace at ${loc}:${yx}`);
    }
    ;
    if (flags.paralysisRequiresPrisonKey()) {
        const windmillFlag = 0x2ee;
        replaceFlag(cordelPlainsWest, 0x30, windmillFlag);
        replaceFlag(cordelPlainsEast, 0x30, windmillFlag);
        replaceFlag(waterfallValleyNorth, 0x00, 0x2d8);
        const explosion = Spawn.of({ y: 0x060, x: 0x060, type: 4, id: 0x2c });
        const keyTrigger = Spawn.of({ y: 0x070, x: 0x070, type: 2, id: 0xad });
        waterfallValleyNorth.spawns.splice(1, 0, explosion);
        waterfallValleyNorth.spawns.push(keyTrigger);
    }
}
;
const eastCave = (rom) => {
    const screens1 = [[0x9c, 0x84, 0x80, 0x83, 0x9c],
        [0x80, 0x81, 0x83, 0x86, 0x80],
        [0x83, 0x88, 0x89, 0x80, 0x80],
        [0x81, 0x8c, 0x85, 0x82, 0x84],
        [0x9a, 0x85, 0x9c, 0x98, 0x86]];
    const screens2 = [[0x9c, 0x84, 0x9b, 0x80, 0x9b],
        [0x80, 0x81, 0x81, 0x80, 0x81],
        [0x80, 0x87, 0x8b, 0x8a, 0x86],
        [0x80, 0x8c, 0x80, 0x85, 0x84],
        [0x9c, 0x86, 0x80, 0x80, 0x9a]];
    console.log(rom, screens1, screens2);
};
const adjustGoaFortressTriggers = (rom) => {
    const l = rom.locations;
    l.goaFortressKelbesque.spawns[0].x -= 8;
    l.goaFortressZebu.spawns.splice(1, 1);
    l.goaFortressTornel.spawns.splice(2, 1);
    l.goaFortressAsina.spawns.splice(2, 1);
};
const alarmFluteIsKeyItem = (rom) => {
    const { waterfallCave4 } = rom.locations;
    rom.npcs[0x14].data[1] = 0x31;
    rom.itemGets[0x31].inventoryRowStart = 0x20;
    rom.items[0x31].unique = true;
    rom.items[0x31].basePrice = 0;
    const replacements = [
        [0x21, 0.72],
        [0x1f, 0.9],
    ];
    let j = 0;
    for (const shop of rom.shops) {
        if (shop.type !== ShopType.TOOL)
            continue;
        for (let i = 0, len = shop.contents.length; i < len; i++) {
            if (shop.contents[i] !== 0x31)
                continue;
            const [item, priceRatio] = replacements[(j++) % replacements.length];
            shop.contents[i] = item;
            if (rom.shopDataTablesAddress) {
                shop.prices[i] = Math.round(shop.prices[i] * priceRatio);
            }
        }
    }
    rom.itemGets[0x5b].itemId = 0x1d;
    waterfallCave4.spawn(0x19).id = 0x10;
};
const reversibleSwanGate = (rom) => {
    rom.locations[0x73].spawns.push(Spawn.of({ xt: 0x0a, yt: 0x02, type: 1, id: 0x2d }), Spawn.of({ xt: 0x0b, yt: 0x02, type: 1, id: 0x2d }), Spawn.of({ xt: 0x0e, yt: 0x0a, type: 2, id: 0xb3 }));
    rom.npcs[0x2d].localDialogs.get(0x73)[0].flags.push(0x10d);
    rom.trigger(0xb3).conditions.push(0x10d);
};
function preventNpcDespawns(rom, flags) {
    function remove(arr, elem) {
        const index = arr.indexOf(elem);
        if (index < 0)
            throw new Error(`Could not find element ${elem} in ${arr}`);
        arr.splice(index, 1);
    }
    function dialog(id, loc = -1) {
        const result = rom.npcs[id].localDialogs.get(loc);
        if (!result)
            throw new Error(`Missing dialog $${hex(id)} at $${hex(loc)}`);
        return result;
    }
    function spawns(id, loc) {
        const result = rom.npcs[id].spawnConditions.get(loc);
        if (!result)
            throw new Error(`Missing spawn condition $${hex(id)} at $${hex(loc)}`);
        return result;
    }
    rom.npcs[0x74].link(0x7e);
    rom.npcs[0x74].used = true;
    rom.npcs[0x74].data = [...rom.npcs[0x7e].data];
    rom.locations.swanDanceHall.spawns.find(s => s.isNpc() && s.id === 0x7e).id = 0x74;
    rom.items[0x3b].tradeIn[0] = 0x74;
    rom.npcs[0x88].linkDialog(0x16);
    rom.npcs[0x82].used = true;
    rom.npcs[0x82].link(0x16);
    rom.npcs[0x82].data = [...rom.npcs[0x16].data];
    rom.locations.brynmaer.spawns.find(s => s.isNpc() && s.id === 0x16).id = 0x82;
    rom.items[0x25].tradeIn[0] = 0x82;
    dialog(0x13)[2].condition = 0x047;
    dialog(0x13)[2].flags = [0x0a9];
    dialog(0x13)[3].flags = [0x0a9];
    spawns(0x14, 0x0e)[1] = ~0x088;
    remove(spawns(0x16, 0x57), ~0x051);
    remove(spawns(0x88, 0x57), ~0x051);
    function reverseDialog(ds) {
        ds.reverse();
        for (let i = 0; i < ds.length; i++) {
            const next = ds[i + 1];
            ds[i].condition = next ? ~next.condition : ~0;
        }
    }
    ;
    const oakElderDialog = dialog(0x1d);
    oakElderDialog[0].message.action = 0x03;
    oakElderDialog[1].message.action = 0x03;
    oakElderDialog[2].message.action = 0x03;
    oakElderDialog[3].message.action = 0x03;
    const oakMotherDialog = dialog(0x1e);
    (() => {
        const [killedInsect, gotItem, getItem, findChild] = oakMotherDialog;
        findChild.condition = ~0x045;
        gotItem.condition = ~0;
        rom.npcs[0x1e].localDialogs.set(-1, [findChild, getItem, killedInsect, gotItem]);
    })();
    for (const i of [0x20, 0x21, 0x22, 0x7c, 0x7d]) {
        reverseDialog(dialog(i));
    }
    const oakChildDialog = dialog(0x1f);
    oakChildDialog.unshift(...oakChildDialog.splice(1, 1));
    rom.npcs[0x33].spawnConditions.set(0xdf, [~0x020, ~0x01b]);
    dialog(0x34)[1].condition = 0x01b;
    dialog(0x38)[3].message.action = 0x03;
    dialog(0x38)[4].flags.push(0x09c);
    spawns(0x38, 0xdf)[1] = ~0x01b;
    spawns(0x38, 0xe1)[0] = 0x01b;
    dialog(0x38)[1].condition = 0x01b;
    spawns(0x39, 0xd8)[1] = ~0x01b;
    rom.npcs[0x44].spawnConditions.set(0xe9, [~0x08d]);
    rom.npcs[0x44].spawnConditions.set(0xe4, [0x08d]);
    rom.npcs[0x5e].localDialogs.set(0x10, [
        LocalDialog.of(~0x03a, [0x00, 0x1a], [0x03a]),
        LocalDialog.of(0x00d, [0x00, 0x1d]),
        LocalDialog.of(0x038, [0x00, 0x1c]),
        LocalDialog.of(0x039, [0x00, 0x1d]),
        LocalDialog.of(0x00a, [0x00, 0x1b, 0x03]),
        LocalDialog.of(~0x000, [0x00, 0x1d]),
    ]);
    remove(spawns(0x5e, 0x10), ~0x051);
    rom.npcs[0x5f].spawnConditions.delete(0x21);
    rom.npcs[0x60].spawnConditions.delete(0x1e);
    const asina = rom.npcs[0x62];
    asina.data[1] = 0x28;
    dialog(asina.id, 0xe1)[0].message.action = 0x11;
    dialog(asina.id, 0xe1)[2].message.action = 0x11;
    remove(spawns(asina.id, 0xe1), ~0x08f);
    rom.npcs[0x68].spawnConditions.set(0x61, [~0x09b, 0x021]);
    dialog(0x68)[0].message.action = 0x02;
    dialog(0xc3)[0].condition = 0x202;
    rom.npcs[0xc4].spawnConditions.delete(0xf2);
    rom.npcs[0xcb].spawnConditions.set(0xa6, [~0x28d]);
    const zebuShyron = rom.npcs[0x5e].localDialogs.get(0xf2);
    zebuShyron.unshift(...zebuShyron.splice(1, 1));
    rom.trigger(0x80).conditions = [
        ~0x027,
        0x03b,
        0x203,
    ];
    rom.trigger(0x81).conditions = [];
    if (flags.barrierRequiresCalmSea()) {
        rom.trigger(0x84).conditions.push(0x283);
    }
    rom.trigger(0x8c).conditions.push(0x03a);
    rom.trigger(0xba).conditions[0] = ~0x244;
    rom.trigger(0xbb).conditions[1] = ~0x01b;
    const { zombieTown } = rom.locations;
    zombieTown.spawns = zombieTown.spawns.filter(x => !x.isTrigger() || x.id != 0x8a);
    for (const npc of rom.npcs) {
        for (const d of npc.allDialogs()) {
            if (d.condition === 0x00e)
                d.condition = 0x243;
            if (d.condition === ~0x00e)
                d.condition = ~0x243;
        }
    }
}
;
function fixMimics(rom) {
    let mimic = 0x70;
    for (const loc of rom.locations) {
        for (const s of loc.spawns) {
            if (!s.isChest())
                continue;
            s.timed = false;
            if (s.id >= 0x70)
                s.id = mimic++;
        }
    }
}
const requireHealedDolphin = (rom) => {
    rom.npcs[0x64].spawnConditions.set(0xd6, [0x236, 0x025]);
    const daughterDialog = rom.npcs[0x7b].localDialogs.get(-1);
    daughterDialog.unshift(daughterDialog[0].clone());
    daughterDialog[0].condition = ~0x025;
    daughterDialog[1].condition = ~0x236;
};
const requireTelepathyForDeo = (rom) => {
    rom.npcs[0x59].globalDialogs.push(GlobalDialog.of(~0x243, [0x1a, 0x12]));
    rom.npcs[0x5a].globalDialogs.push(GlobalDialog.of(~0x243, [0x1a, 0x13]));
};
const teleportOnThunderSword = (rom) => {
    rom.itemGets[0x03].flags.push(0x2fd);
    for (const i of [0, 1, 3]) {
        for (const loc of [0xf2, 0xf4]) {
            rom.npcs[0x62].localDialogs.get(loc)[i].message.action = 0x1f;
        }
    }
};
const noTeleportOnThunderSword = (rom) => {
    rom.itemGets[0x03].acquisitionAction.action = 0x16;
};
const adjustItemNames = (rom, flags) => {
    if (flags.leatherBootsGiveSpeed()) {
        const leatherBoots = rom.items[0x2f];
        leatherBoots.menuName = 'Speed Boots';
        leatherBoots.messageName = 'Speed Boots';
    }
    for (let i = 0x05; i < 0x0c; i += 2) {
        rom.items[i].menuName = rom.items[i].menuName.replace('Ball', 'Orb');
        rom.items[i].messageName = rom.items[i].messageName.replace('Ball', 'Orb');
    }
};
function simplifyInvisibleChests(rom) {
    for (const location of [rom.locations.cordelPlainsEast,
        rom.locations.undergroundChannel,
        rom.locations.kirisaMeadow]) {
        for (const spawn of location.spawns) {
            if (spawn.isChest())
                spawn.data[2] |= 0x20;
        }
    }
}
const addCordelWestTriggers = (rom, flags) => {
    const { cordelPlainsEast, cordelPlainsWest } = rom.locations;
    for (const spawn of cordelPlainsEast.spawns) {
        if (spawn.isChest() || (flags.disableTeleportSkip() && spawn.isTrigger())) {
            cordelPlainsWest.spawns.push(spawn.clone());
        }
    }
};
const fixRabbitSkip = (rom) => {
    for (const spawn of rom.locations.mtSabreNorthMain.spawns) {
        if (spawn.isTrigger() && spawn.id === 0x86) {
            if (spawn.x === 0x740) {
                spawn.x += 16;
                spawn.y += 16;
            }
        }
    }
};
const storyMode = (rom) => {
    rom.npcs[0xcb].spawnConditions.set(0xa6, [
        ~rom.npcs[0xc2].spawnConditions.get(0x28)[0],
        ~rom.npcs[0x84].spawnConditions.get(0x6e)[0],
        ~rom.trigger(0x9a).conditions[1],
        ~rom.npcs[0xc5].spawnConditions.get(0xa9)[0],
        ~rom.npcs[0xc6].spawnConditions.get(0xac)[0],
        ~rom.npcs[0xc7].spawnConditions.get(0xb9)[0],
        ~rom.npcs[0xc8].spawnConditions.get(0xb6)[0],
        ~rom.npcs[0xcb].spawnConditions.get(0x9f)[0],
        0x200,
        0x201,
        0x202,
        0x203,
    ]);
};
const disableStabs = (rom) => {
    for (const o of [0x08, 0x09, 0x27]) {
        rom.objects[o].collisionPlane = 0;
    }
};
const orbsOptional = (rom) => {
    for (const obj of [0x10, 0x14, 0x18, 0x1d]) {
        rom.objects[obj].terrainSusceptibility &= ~0x04;
        rom.objects[obj].level = 2;
    }
};
const connectLimeTreeToLeaf = (rom) => {
    const { valleyOfWind, limeTreeValley } = rom.locations;
    valleyOfWind.screens[5][4] = 0x10;
    limeTreeValley.screens[1][0] = 0x1a;
    limeTreeValley.screens[2][0] = 0x0c;
    const windEntrance = valleyOfWind.entrances.push(Entrance.of({ x: 0x4ef, y: 0x578 })) - 1;
    const limeEntrance = limeTreeValley.entrances.push(Entrance.of({ x: 0x010, y: 0x1c0 })) - 1;
    valleyOfWind.exits.push(Exit.of({ x: 0x4f0, y: 0x560, dest: 0x42, entrance: limeEntrance }), Exit.of({ x: 0x4f0, y: 0x570, dest: 0x42, entrance: limeEntrance }));
    limeTreeValley.exits.push(Exit.of({ x: 0x000, y: 0x1b0, dest: 0x03, entrance: windEntrance }), Exit.of({ x: 0x000, y: 0x1c0, dest: 0x03, entrance: windEntrance }));
};
export function stampVersionSeedAndHash(rom, seed, flags) {
    const crc = crc32(rom);
    const crcString = crc.toString(16).padStart(8, '0').toUpperCase();
    const hash = version.STATUS === 'unstable' ?
        version.HASH.substring(0, 7).padStart(7, '0').toUpperCase() + '     ' :
        version.VERSION.substring(0, 12).padEnd(12, ' ');
    const seedStr = seed.toString(16).padStart(8, '0').toUpperCase();
    const embed = (addr, text) => {
        for (let i = 0; i < text.length; i++) {
            rom[addr + 0x10 + i] = text.charCodeAt(i);
        }
    };
    const intercalate = (s1, s2) => {
        const out = [];
        for (let i = 0; i < s1.length || i < s2.length; i++) {
            out.push(s1[i] || ' ');
            out.push(s2[i] || ' ');
        }
        return out.join('');
    };
    embed(0x277cf, intercalate('  VERSION     SEED      ', `  ${hash}${seedStr}`));
    let flagString = String(flags);
    let extraFlags;
    if (flagString.length > 46) {
        if (flagString.length > 92)
            throw new Error('Flag string way too long!');
        extraFlags = flagString.substring(46, 92).padEnd(46, ' ');
        flagString = flagString.substring(0, 46);
    }
    flagString = flagString.padEnd(46, ' ');
    embed(0x277ff, intercalate(flagString.substring(0, 23), flagString.substring(23)));
    if (extraFlags) {
        embed(0x2782f, intercalate(extraFlags.substring(0, 23), extraFlags.substring(23)));
    }
    embed(0x27885, intercalate(crcString.substring(0, 4), crcString.substring(4)));
    embed(0x25716, 'RANDOMIZER');
    if (version.STATUS === 'unstable')
        embed(0x2573c, 'BETA');
    return crc;
}
;
const patchBytes = (rom, address, bytes) => {
    for (let i = 0; i < bytes.length; i++) {
        rom[address + i] = bytes[i];
    }
};
const patchWords = (rom, address, words) => {
    for (let i = 0; i < 2 * words.length; i += 2) {
        rom[address + i] = words[i >>> 1] & 0xff;
        rom[address + i + 1] = words[i >>> 1] >>> 8;
    }
};
const updateCoinDrops = (rom, flags) => {
    rom = rom.subarray(0x10);
    if (flags.disableShopGlitch()) {
        patchWords(rom, 0x34bde, [
            0, 5, 10, 15, 25, 40, 65, 105,
            170, 275, 445, 600, 700, 800, 900, 1000,
        ]);
    }
    else {
        patchWords(rom, 0x34bde, [
            0, 1, 2, 4, 8, 16, 30, 50,
            100, 200, 300, 400, 500, 600, 700, 800,
        ]);
    }
};
const updateDifficultyScalingTables = (rom, flags, asm) => {
    rom = rom.subarray(0x10);
    const diff = seq(48, x => x);
    patchBytes(rom, asm.expand('DiffAtk'), diff.map(d => Math.round(40 + d * 15 / 4)));
    patchBytes(rom, asm.expand('DiffDef'), diff.map(d => d * 4));
    const phpStart = flags.decreaseEnemyDamage() ? 16 : 48;
    const phpIncr = flags.decreaseEnemyDamage() ? 6 : 5.5;
    patchBytes(rom, asm.expand('DiffHP'), diff.map(d => Math.min(255, phpStart + Math.round(d * phpIncr))));
    const expFactor = flags.expScalingFactor();
    patchBytes(rom, asm.expand('DiffExp'), diff.map(d => {
        const exp = Math.floor(4 * (2 ** ((16 + 9 * d) / 32)) * expFactor);
        return exp < 0x80 ? exp : Math.min(0xff, 0x80 + (exp >> 4));
    }));
    patchBytes(rom, 0x34bc0, [
        0, 2, 6, 10, 14, 18, 32, 24, 20,
        0, 2, 6, 10, 14, 18, 16, 32, 20,
    ]);
};
const rescaleShops = (rom, asm, random) => {
    rom.shopCount = 11;
    rom.shopDataTablesAddress = asm.expand('ShopData');
    writeLittleEndian(rom.prg, asm.expand('InnBasePrice'), 20);
    for (const shop of rom.shops) {
        if (shop.type === ShopType.PAWN)
            continue;
        for (let i = 0, len = shop.prices.length; i < len; i++) {
            if (shop.contents[i] < 0x80) {
                shop.prices[i] = random ? random.nextNormal(1, 0.3, 0.5, 1.5) : 1;
            }
            else if (shop.type !== ShopType.INN) {
                shop.prices[i] = 0;
            }
            else {
                shop.prices[i] = random ? random.nextNormal(1, 0.5, 0.375, 1.625) : 1;
            }
        }
    }
    const diff = seq(48, x => x);
    patchBytes(rom.prg, asm.expand('ToolShopScaling'), diff.map(d => Math.round(8 * (2 ** (d / 10)))));
    patchBytes(rom.prg, asm.expand('ArmorShopScaling'), diff.map(d => Math.round(8 * (2 ** ((47 - d) / 12)))));
    for (let i = 0x0d; i < 0x27; i++) {
        rom.items[i].basePrice = BASE_PRICES[i];
    }
};
const BASE_PRICES = {
    0x0d: 4,
    0x0e: 16,
    0x0f: 50,
    0x10: 325,
    0x11: 1000,
    0x12: 2000,
    0x13: 4000,
    0x15: 6,
    0x16: 20,
    0x17: 75,
    0x18: 250,
    0x19: 1000,
    0x1a: 4800,
    0x1d: 25,
    0x1e: 30,
    0x1f: 45,
    0x20: 40,
    0x21: 36,
    0x22: 200,
    0x23: 150,
    0x24: 80,
    0x26: 300,
};
function normalizeSwords(rom, flags, random) {
    const {} = { flags, random };
    rom.objects[0x10].atk = 3;
    rom.objects[0x11].atk = 6;
    rom.objects[0x12].atk = 8;
    rom.objects[0x18].atk = 3;
    rom.objects[0x13].atk = 5;
    rom.objects[0x19].atk = 5;
    rom.objects[0x17].atk = 7;
    rom.objects[0x1a].atk = 7;
    rom.objects[0x14].atk = 3;
    rom.objects[0x15].atk = 6;
    rom.objects[0x16].atk = 8;
    rom.objects[0x1c].atk = 3;
    rom.objects[0x1e].atk = 5;
    rom.objects[0x1b].atk = 7;
    rom.objects[0x1f].atk = 7;
}
function rescaleMonsters(rom, flags, random) {
    const unscaledMonsters = new Set(seq(0x100, x => x).filter(s => s in rom.objects));
    for (const [id] of SCALED_MONSTERS) {
        unscaledMonsters.delete(id);
    }
    for (const [id, monster] of SCALED_MONSTERS) {
        for (const other of unscaledMonsters) {
            if (rom.objects[id].base === rom.objects[other].base) {
                SCALED_MONSTERS.set(other, monster);
                unscaledMonsters.delete(id);
            }
        }
    }
    rom.objects[0x7d].elements |= 0x08;
    rom.objects[0xc8].attackType = 0xff;
    rom.objects[0xc8].statusEffect = 0;
    const BOSSES = new Set([0x57, 0x5e, 0x68, 0x7d, 0x88, 0x97, 0x9b, 0x9e]);
    const SLIMES = new Set([0x50, 0x53, 0x5f, 0x69]);
    for (const [id, { sdef, swrd, hits, satk, dgld, sexp }] of SCALED_MONSTERS) {
        const o = rom.objects[id].data;
        const boss = BOSSES.has(id) ? 1 : 0;
        o[2] |= 0x80;
        o[6] = hits;
        o[7] = satk;
        o[8] = sdef | swrd << 4;
        o[16] = o[16] & 0x0f | dgld << 4;
        o[17] = sexp;
        if (boss ? flags.shuffleBossElements() : flags.shuffleMonsterElements()) {
            if (!SLIMES.has(id)) {
                const bits = [...rom.objects[id].elements.toString(2).padStart(4, '0')];
                random.shuffle(bits);
                rom.objects[id].elements = Number.parseInt(bits.join(''), 2);
            }
        }
    }
    if (flags.shuffleMonsterElements()) {
        const e = random.nextInt(4);
        rom.prg[0x3522d] = e + 1;
        for (const id of SLIMES) {
            rom.objects[id].elements = 1 << e;
        }
    }
}
;
const shuffleMonsters = (rom, flags, random) => {
    const graphics = new Graphics(rom);
    if (flags.shuffleSpritePalettes())
        graphics.shufflePalettes(random);
    const pool = new MonsterPool(flags, {});
    for (const loc of rom.locations) {
        if (loc.used)
            pool.populate(loc);
    }
    pool.shuffle(random, graphics);
};
const identifyKeyItemsForDifficultyBuffs = (rom) => {
    for (let i = 0; i < 0x49; i++) {
        const unique = (rom.prg[0x20ff0 + i] & 0x40) || i === 0x31;
        const bit = 1 << (i & 7);
        const addr = 0x1e110 + (i >>> 3);
        rom.prg[addr] = rom.prg[addr] & ~bit | (unique ? bit : 0);
    }
};
const SCALED_MONSTERS = new Map([
    [0x3f, 'p', 'Sorceror shot', , , , 19, , ,],
    [0x4b, 'm', 'wraith??', 2, , 2, 22, 4, 61],
    [0x4f, 'm', 'wraith', 1, , 2, 20, 4, 61],
    [0x50, 'm', 'Blue Slime', , , 1, 16, 2, 32],
    [0x51, 'm', 'Weretiger', , , 1, 21, 4, 40],
    [0x52, 'm', 'Green Jelly', 4, , 3, 16, 4, 36],
    [0x53, 'm', 'Red Slime', 6, , 4, 16, 4, 48],
    [0x54, 'm', 'Rock Golem', 6, , 11, 24, 6, 85],
    [0x55, 'm', 'Blue Bat', , , , 4, , 32],
    [0x56, 'm', 'Green Wyvern', 4, , 4, 24, 6, 52],
    [0x57, 'b', 'Vampire', 3, , 12, 18, , ,],
    [0x58, 'm', 'Orc', 3, , 4, 21, 4, 57],
    [0x59, 'm', 'Red Flying Swamp Insect', 3, , 1, 21, 4, 57],
    [0x5a, 'm', 'Blue Mushroom', 2, , 1, 21, 4, 44],
    [0x5b, 'm', 'Swamp Tomato', 3, , 2, 35, 4, 52],
    [0x5c, 'm', 'Flying Meadow Insect', 3, , 3, 23, 4, 81],
    [0x5d, 'm', 'Swamp Plant', , , , , , 36],
    [0x5e, 'b', 'Insect', , 1, 8, 6, , ,],
    [0x5f, 'm', 'Large Blue Slime', 5, , 3, 20, 4, 52],
    [0x60, 'm', 'Ice Zombie', 5, , 7, 14, 4, 57],
    [0x61, 'm', 'Green Living Rock', , , 1, 9, 4, 28],
    [0x62, 'm', 'Green Spider', 4, , 4, 22, 4, 44],
    [0x63, 'm', 'Red/Purple Wyvern', 3, , 4, 30, 4, 65],
    [0x64, 'm', 'Draygonia Soldier', 6, , 11, 36, 4, 89],
    [0x65, 'm', 'Ice Entity', 3, , 2, 24, 4, 52],
    [0x66, 'm', 'Red Living Rock', , , 1, 13, 4, 40],
    [0x67, 'm', 'Ice Golem', 7, 2, 11, 28, 4, 81],
    [0x68, 'b', 'Kelbesque', 4, 6, 12, 29, , ,],
    [0x69, 'm', 'Giant Red Slime', 7, , 40, 90, 4, 102],
    [0x6a, 'm', 'Troll', 2, , 3, 24, 4, 65],
    [0x6b, 'm', 'Red Jelly', 2, , 2, 14, 4, 44],
    [0x6c, 'm', 'Medusa', 3, , 4, 36, 8, 77],
    [0x6d, 'm', 'Red Crab', 2, , 1, 21, 4, 44],
    [0x6e, 'm', 'Medusa Head', , , 1, 29, 4, 36],
    [0x6f, 'm', 'Evil Bird', , , 2, 30, 6, 65],
    [0x71, 'm', 'Red/Purple Mushroom', 3, , 5, 19, 6, 69],
    [0x72, 'm', 'Violet Earth Entity', 3, , 3, 18, 6, 61],
    [0x73, 'm', 'Mimic', , , 3, 26, 15, 73],
    [0x74, 'm', 'Red Spider', 3, , 4, 22, 6, 48],
    [0x75, 'm', 'Fishman', 4, , 6, 19, 5, 61],
    [0x76, 'm', 'Jellyfish', , , 3, 14, 3, 48],
    [0x77, 'm', 'Kraken', 5, , 11, 25, 7, 73],
    [0x78, 'm', 'Dark Green Wyvern', 4, , 5, 21, 5, 61],
    [0x79, 'm', 'Sand Monster', 5, , 8, 6, 4, 57],
    [0x7b, 'm', 'Wraith Shadow 1', , , , 9, 7, 44],
    [0x7c, 'm', 'Killer Moth', , , 2, 35, , 77],
    [0x7d, 'b', 'Sabera', 3, 7, 13, 24, , ,],
    [0x80, 'm', 'Draygonia Archer', 1, , 3, 20, 6, 61],
    [0x81, 'm', 'Evil Bomber Bird', , , 1, 19, 4, 65],
    [0x82, 'm', 'Lavaman/blob', 3, , 3, 24, 6, 85],
    [0x84, 'm', 'Lizardman (w/ flail(', 2, , 3, 30, 6, 81],
    [0x85, 'm', 'Giant Eye', 3, , 5, 33, 4, 81],
    [0x86, 'm', 'Salamander', 2, , 4, 29, 8, 77],
    [0x87, 'm', 'Sorceror', 2, , 5, 31, 6, 65],
    [0x88, 'b', 'Mado', 4, 8, 10, 30, , ,],
    [0x89, 'm', 'Draygonia Knight', 2, , 3, 24, 4, 77],
    [0x8a, 'm', 'Devil', , , 1, 18, 4, 52],
    [0x8b, 'b', 'Kelbesque 2', 4, 6, 11, 27, , ,],
    [0x8c, 'm', 'Wraith Shadow 2', , , , 17, 4, 48],
    [0x90, 'b', 'Sabera 2', 5, 7, 21, 27, , ,],
    [0x91, 'm', 'Tarantula', 3, , 3, 21, 6, 73],
    [0x92, 'm', 'Skeleton', , , 4, 30, 6, 69],
    [0x93, 'b', 'Mado 2', 4, 8, 11, 25, , ,],
    [0x94, 'm', 'Purple Giant Eye', 4, , 10, 23, 6, 102],
    [0x95, 'm', 'Black Knight (w/ flail)', 3, , 7, 26, 6, 89],
    [0x96, 'm', 'Scorpion', 3, , 5, 29, 2, 73],
    [0x97, 'b', 'Karmine', 4, , 14, 26, , ,],
    [0x98, 'm', 'Sandman/blob', 3, , 5, 36, 6, 98],
    [0x99, 'm', 'Mummy', 5, , 19, 36, 6, 110],
    [0x9a, 'm', 'Tomb Guardian', 7, , 60, 37, 6, 106],
    [0x9b, 'b', 'Draygon', 5, 6, 16, 41, , ,],
    [0x9e, 'b', 'Draygon 2', 7, 6, 28, 40, , ,],
    [0xa0, 'm', 'Ground Sentry (1)', 4, , 6, 26, , 73],
    [0xa1, 'm', 'Tower Defense Mech (2)', 5, , 8, 36, , 85],
    [0xa2, 'm', 'Tower Sentinel', , , 1, , , 32],
    [0xa3, 'm', 'Air Sentry', 3, , 2, 26, , 65],
    [0xa5, 'b', 'Vampire 2', 3, , 12, 27, , ,],
    [0xa4, 'b', 'Dyna', 6, 5, 32, , , ,],
    [0xb4, 'b', 'dyna pod', 6, 5, 48, 26, , ,],
    [0xb8, 'p', 'dyna counter', 15, , , 42, , ,],
    [0xb9, 'p', 'dyna laser', 15, , , 42, , ,],
    [0xba, 'p', 'dyna bubble', , , , 36, , ,],
    [0xbc, 'm', 'vamp2 bat', , , , 16, , 15],
    [0xbf, 'p', 'draygon2 fireball', , , , 26, , ,],
    [0xc1, 'm', 'vamp1 bat', , , , 16, , 15],
    [0xc3, 'p', 'giant insect spit', , , , 35, , ,],
    [0xc4, 'm', 'summoned insect', 4, , 2, 42, , 98],
    [0xc5, 'p', 'kelby1 rock', , , , 22, , ,],
    [0xc6, 'p', 'sabera1 balls', , , , 19, , ,],
    [0xc7, 'p', 'kelby2 fireballs', , , , 11, , ,],
    [0xc8, 'p', 'sabera2 fire', , , 1, 6, , ,],
    [0xc9, 'p', 'sabera2 balls', , , , 17, , ,],
    [0xca, 'p', 'karmine balls', , , , 25, , ,],
    [0xcb, 'p', 'sun/moon statue fireballs', , , , 39, , ,],
    [0xcc, 'p', 'draygon1 lightning', , , , 37, , ,],
    [0xcd, 'p', 'draygon2 laser', , , , 36, , ,],
    [0xce, 'p', 'draygon2 breath', , , , 36, , ,],
    [0xe0, 'p', 'evil bomber bird bomb', , , , 2, , ,],
    [0xe2, 'p', 'summoned insect bomb', , , , 47, , ,],
    [0xe3, 'p', 'paralysis beam', , , , 23, , ,],
    [0xe4, 'p', 'stone gaze', , , , 33, , ,],
    [0xe5, 'p', 'rock golem rock', , , , 24, , ,],
    [0xe6, 'p', 'curse beam', , , , 10, , ,],
    [0xe7, 'p', 'mp drain web', , , , 11, , ,],
    [0xe8, 'p', 'fishman trident', , , , 15, , ,],
    [0xe9, 'p', 'orc axe', , , , 24, , ,],
    [0xea, 'p', 'Swamp Pollen', , , , 37, , ,],
    [0xeb, 'p', 'paralysis powder', , , , 17, , ,],
    [0xec, 'p', 'draygonia solider sword', , , , 28, , ,],
    [0xed, 'p', 'ice golem rock', , , , 20, , ,],
    [0xee, 'p', 'troll axe', , , , 27, , ,],
    [0xef, 'p', 'kraken ink', , , , 24, , ,],
    [0xf0, 'p', 'draygonia archer arrow', , , , 12, , ,],
    [0xf1, 'p', '??? unused', , , , 16, , ,],
    [0xf2, 'p', 'draygonia knight sword', , , , 9, , ,],
    [0xf3, 'p', 'moth residue', , , , 19, , ,],
    [0xf4, 'p', 'ground sentry laser', , , , 13, , ,],
    [0xf5, 'p', 'tower defense mech laser', , , , 23, , ,],
    [0xf6, 'p', 'tower sentinel laser', , , , 8, , ,],
    [0xf7, 'p', 'skeleton shot', , , , 11, , ,],
    [0xf8, 'p', 'lavaman shot', , , , 14, , ,],
    [0xf9, 'p', 'black knight flail', , , , 18, , ,],
    [0xfa, 'p', 'lizardman flail', , , , 21, , ,],
    [0xfc, 'p', 'mado shuriken', , , , 36, , ,],
    [0xfd, 'p', 'guardian statue missile', , , , 23, , ,],
    [0xfe, 'p', 'demon wall fire', , , , 23, , ,],
].map(([id, type, name, sdef = 0, swrd = 0, hits = 0, satk = 0, dgld = 0, sexp = 0]) => [id, { id, type, name, sdef, swrd, hits, satk, dgld, sexp }]));
class MonsterPool {
    constructor(flags, report) {
        this.flags = flags;
        this.report = report;
        this.monsters = [];
        this.used = [];
        this.locations = [];
    }
    populate(location) {
        const { maxFlyers = 0, nonFlyers = {}, skip = false, tower = false, fixedSlots = {}, ...unexpected } = MONSTER_ADJUSTMENTS[location.id] || {};
        for (const u of Object.keys(unexpected)) {
            throw new Error(`Unexpected property '${u}' in MONSTER_ADJUSTMENTS[${location.id}]`);
        }
        const skipMonsters = (skip === true ||
            (!this.flags.shuffleTowerMonsters() && tower) ||
            !location.spritePatterns ||
            !location.spritePalettes);
        const monsters = [];
        let slots = [];
        let slot = 0x0c;
        for (const spawn of skipMonsters ? [] : location.spawns) {
            ++slot;
            if (!spawn.used || !spawn.isMonster())
                continue;
            const id = spawn.monsterId;
            if (id in UNTOUCHED_MONSTERS || !SCALED_MONSTERS.has(id) ||
                SCALED_MONSTERS.get(id).type !== 'm')
                continue;
            const object = location.rom.objects[id];
            if (!object)
                continue;
            const patBank = spawn.patternBank;
            const pat = location.spritePatterns[patBank];
            const pal = object.palettes(true);
            const pal2 = pal.includes(2) ? location.spritePalettes[0] : undefined;
            const pal3 = pal.includes(3) ? location.spritePalettes[1] : undefined;
            monsters.push({ id, pat, pal2, pal3, patBank });
            (this.report[`start-${id.toString(16)}`] = this.report[`start-${id.toString(16)}`] || [])
                .push('$' + location.id.toString(16));
            slots.push(slot);
        }
        if (!monsters.length || skip)
            slots = [];
        this.locations.push({ location, slots });
        this.monsters.push(...monsters);
    }
    shuffle(random, graphics) {
        this.report['pre-shuffle locations'] = this.locations.map(l => l.location.id);
        this.report['pre-shuffle monsters'] = this.monsters.map(m => m.id);
        random.shuffle(this.locations);
        random.shuffle(this.monsters);
        this.report['post-shuffle locations'] = this.locations.map(l => l.location.id);
        this.report['post-shuffle monsters'] = this.monsters.map(m => m.id);
        while (this.locations.length) {
            const { location, slots } = this.locations.pop();
            const report = this.report['$' + location.id.toString(16).padStart(2, '0')] = [];
            const { maxFlyers = 0, nonFlyers = {}, tower = false } = MONSTER_ADJUSTMENTS[location.id] || {};
            if (tower)
                continue;
            let flyers = maxFlyers;
            let constraint = Constraint.forLocation(location.id);
            if (location.bossId() != null) {
            }
            for (const spawn of location.spawns) {
                if (spawn.isChest() && !spawn.isInvisible()) {
                    if (spawn.id < 0x70) {
                        constraint = constraint.meet(Constraint.TREASURE_CHEST, true);
                    }
                    else {
                        constraint = constraint.meet(Constraint.MIMIC, true);
                    }
                }
                else if (spawn.isNpc() || spawn.isBoss()) {
                    const c = graphics.getNpcConstraint(location.id, spawn.id);
                    constraint = constraint.meet(c, true);
                }
                else if (spawn.isMonster() && UNTOUCHED_MONSTERS[spawn.monsterId]) {
                    const c = graphics.getMonsterConstraint(location.id, spawn.monsterId);
                    constraint = constraint.meet(c, true);
                }
            }
            report.push(`Initial pass: ${constraint.fixed.map(s => s.size < Infinity ? '[' + [...s].join(', ') + ']' : 'all')}`);
            const classes = new Map();
            const tryAddMonster = (m) => {
                const monster = location.rom.objects[m.id];
                if (monster.monsterClass) {
                    const representative = classes.get(monster.monsterClass);
                    if (representative != null && representative !== m.id)
                        return false;
                }
                const flyer = FLYERS.has(m.id);
                const moth = MOTHS_AND_BATS.has(m.id);
                if (flyer) {
                    if (!flyers)
                        return false;
                    --flyers;
                }
                const c = graphics.getMonsterConstraint(location.id, m.id);
                let meet = constraint.tryMeet(c);
                if (!meet && constraint.pal2.size < Infinity && constraint.pal3.size < Infinity) {
                    if (this.flags.shuffleSpritePalettes()) {
                        meet = constraint.tryMeet(c, true);
                    }
                }
                if (!meet)
                    return false;
                let pos;
                if (monsterPlacer) {
                    const monster = location.rom.objects[m.id];
                    if (!(monster instanceof Monster)) {
                        throw new Error(`non-monster: ${monster}`);
                    }
                    pos = monsterPlacer(monster);
                    if (pos == null)
                        return false;
                }
                report.push(`  Adding ${m.id.toString(16)}: ${meet}`);
                constraint = meet;
                if (monster.monsterClass)
                    classes.set(monster.monsterClass, m.id);
                let eligible = 0;
                if (flyer || moth) {
                    for (let i = 0; i < slots.length; i++) {
                        if (slots[i] in nonFlyers) {
                            eligible = i;
                            break;
                        }
                    }
                }
                else {
                    for (let i = 0; i < slots.length; i++) {
                        if (slots[i] in nonFlyers)
                            continue;
                        eligible = i;
                        break;
                    }
                }
                (this.report[`mon-${m.id.toString(16)}`] = this.report[`mon-${m.id.toString(16)}`] || [])
                    .push('$' + location.id.toString(16));
                const slot = slots[eligible];
                const spawn = location.spawns[slot - 0x0d];
                if (monsterPlacer) {
                    spawn.screen = pos >>> 8;
                    spawn.tile = pos & 0xff;
                }
                else if (slot in nonFlyers) {
                    spawn.y += nonFlyers[slot][0] * 16;
                    spawn.x += nonFlyers[slot][1] * 16;
                }
                spawn.monsterId = m.id;
                report.push(`    slot ${slot.toString(16)}: ${spawn}`);
                slots.splice(eligible, 1);
                return true;
            };
            const monsterPlacer = slots.length && this.flags.randomizeMaps() ?
                location.monsterPlacer(random) : null;
            if (flyers && slots.length) {
                for (let i = 0; i < Math.min(40, this.monsters.length); i++) {
                    if (FLYERS.has(this.monsters[i].id)) {
                        if (tryAddMonster(this.monsters[i])) {
                            this.monsters.splice(i, 1);
                        }
                    }
                }
            }
            for (let i = 0; i < this.monsters.length; i++) {
                if (!slots.length)
                    break;
                if (tryAddMonster(this.monsters[i])) {
                    const [used] = this.monsters.splice(i, 1);
                    if (!FLYERS.has(used.id))
                        this.used.push(used);
                    i--;
                }
            }
            for (let i = 0; i < this.used.length; i++) {
                if (!slots.length)
                    break;
                if (tryAddMonster(this.used[i])) {
                    this.used.push(...this.used.splice(i, 1));
                    i--;
                }
            }
            constraint.fix(location, random);
            if (slots.length) {
                console.error(`Failed to fill location ${location.id.toString(16)}: ${slots.length} remaining`);
                for (const slot of slots) {
                    const spawn = location.spawns[slot - 0x0d];
                    spawn.x = spawn.y = 0;
                    spawn.id = 0xb0;
                    spawn.data[0] = 0xfe;
                }
            }
            for (const spawn of location.spawns) {
                graphics.configure(location, spawn);
            }
        }
    }
}
const FLYERS = new Set([0x59, 0x5c, 0x6e, 0x6f, 0x81, 0x8a, 0xa3, 0xc4]);
const MOTHS_AND_BATS = new Set([0x55, 0x5d, 0x7c, 0xbc, 0xc1]);
const MONSTER_ADJUSTMENTS = {
    [0x03]: {
        fixedSlots: {
            pat1: 0x60,
        },
        maxFlyers: 2,
    },
    [0x07]: {
        nonFlyers: {
            [0x0f]: [0, -3],
            [0x10]: [-10, 0],
            [0x11]: [0, 4],
        },
    },
    [0x14]: {
        maxFlyers: 2,
    },
    [0x15]: {
        maxFlyers: 2,
    },
    [0x1a]: {
        fixedSlots: {
            pal3: 0x23,
            pat1: 0x4f,
        },
        maxFlyers: 2,
        nonFlyers: {
            [0x10]: [4, 0],
            [0x11]: [5, 0],
            [0x12]: [4, 0],
            [0x13]: [5, 0],
            [0x14]: [4, 0],
            [0x15]: [4, 0],
        },
    },
    [0x1b]: {
        skip: true,
    },
    [0x20]: {
        maxFlyers: 1,
    },
    [0x21]: {
        fixedSlots: {
            pat1: 0x50,
        },
        maxFlyers: 1,
    },
    [0x27]: {
        nonFlyers: {
            [0x0d]: [0, 0x10],
        },
    },
    [0x28]: {
        maxFlyers: 1,
    },
    [0x29]: {
        maxFlyers: 1,
    },
    [0x2b]: {
        nonFlyers: {
            [0x14]: [0x20, -8],
        },
    },
    [0x40]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x13]: [12, -0x10],
        },
    },
    [0x41]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x15]: [0, -6],
        },
    },
    [0x42]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x0d]: [0, 8],
            [0x0e]: [-8, 8],
        },
    },
    [0x47]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x0d]: [-8, -8],
        },
    },
    [0x4a]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x0e]: [4, 0],
            [0x0f]: [0, -3],
            [0x10]: [0, 4],
        },
    },
    [0x4c]: {},
    [0x4d]: {
        maxFlyers: 1,
    },
    [0x4e]: {
        maxFlyers: 1,
    },
    [0x4f]: {},
    [0x57]: {
        fixedSlots: {
            pat1: 0x4d,
        },
    },
    [0x59]: {
        tower: true,
    },
    [0x5a]: {
        tower: true,
    },
    [0x5b]: {
        tower: true,
    },
    [0x60]: {
        fixedSlots: {
            pal3: 0x08,
            pat1: 0x52,
        },
        maxFlyers: 2,
        skip: true,
    },
    [0x64]: {
        fixedSlots: {
            pal3: 0x08,
            pat1: 0x52,
        },
        skip: true,
    },
    [0x68]: {
        fixedSlots: {
            pal3: 0x08,
            pat1: 0x52,
        },
        skip: true,
    },
    [0x69]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x17]: [4, 6],
        },
    },
    [0x6a]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x15]: [0, 0x18],
        },
    },
    [0x6c]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x17]: [0, 0x18],
        },
    },
    [0x6d]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x11]: [0x10, 0],
            [0x1b]: [0, 0],
            [0x1c]: [6, 0],
        },
    },
    [0x78]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x16]: [-8, -8],
        },
    },
    [0x7c]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x15]: [-0x27, 0x54],
        },
    },
    [0x84]: {
        nonFlyers: {
            [0x12]: [0, -4],
            [0x13]: [0, 4],
            [0x14]: [-6, 0],
            [0x15]: [14, 12],
        },
    },
    [0x88]: {
        maxFlyers: 1,
    },
    [0x89]: {
        maxFlyers: 1,
    },
    [0x8a]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x0d]: [7, 0],
            [0x0e]: [0, 0],
            [0x0f]: [7, 3],
            [0x10]: [0, 6],
            [0x11]: [11, -0x10],
        },
    },
    [0x8f]: {
        skip: true,
    },
    [0x90]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x14]: [-0xb, -3],
            [0x15]: [0, 0x10],
        },
    },
    [0x91]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x18]: [0, 14],
            [0x19]: [4, -0x10],
        },
    },
    [0x98]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x14]: [-6, 6],
            [0x15]: [0, -0x10],
        },
    },
    [0x9e]: {
        maxFlyers: 2,
    },
    [0xa2]: {
        maxFlyers: 1,
        nonFlyers: {
            [0x12]: [0, 11],
            [0x13]: [6, 0],
        },
    },
    [0xa5]: {
        nonFlyers: {
            [0x17]: [6, 6],
            [0x18]: [-6, 0],
            [0x19]: [-1, -7],
        },
    },
    [0xa6]: {
        skip: true,
    },
    [0xa8]: {
        skip: true,
    },
    [0xa9]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x16]: [0x1a, -0x10],
            [0x17]: [0, 0x20],
        },
    },
    [0xab]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x0d]: [1, 0],
            [0x0e]: [2, -2],
        },
    },
    [0xad]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x18]: [0, 8],
            [0x19]: [0, -8],
        },
    },
    [0xaf]: {
        nonFlyers: {
            [0x0d]: [0, 0],
            [0x0e]: [0, 0],
            [0x13]: [0x3b, -0x26],
        },
    },
    [0xb4]: {
        maxFlyers: 2,
        nonFlyers: {
            [0x11]: [6, 0],
            [0x12]: [0, 6],
        },
    },
    [0xd7]: {
        skip: true,
    },
};
const UNTOUCHED_MONSTERS = {
    [0x7e]: true,
    [0x7f]: true,
    [0x83]: true,
    [0x8d]: true,
    [0x8e]: true,
    [0x8f]: true,
    [0x9f]: true,
    [0xa6]: true,
};
const shuffleRandomNumbers = (rom, random) => {
    const table = rom.subarray(0x357e4 + 0x10, 0x35824 + 0x10);
    random.shuffle(table);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvanMvcGF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFDLFNBQVMsRUFBQyxNQUFNLFdBQVcsQ0FBQztBQUNwQyxPQUFPLEVBQUMsS0FBSyxFQUFDLE1BQU0sWUFBWSxDQUFDO0FBQ2pDLE9BQU8sRUFDQyxRQUFRLElBQUksZ0JBQWdCLEVBQ0MsTUFBTSxlQUFlLENBQUM7QUFDM0QsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLGtCQUFrQixDQUFDO0FBQzdDLE9BQU8sRUFBQyxPQUFPLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFDckMsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBQyxLQUFLLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUN2QyxPQUFPLEVBQUMsU0FBUyxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDOUMsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLDJCQUEyQixDQUFDO0FBQzFELE9BQU8sRUFBQyxZQUFZLEVBQUMsTUFBTSx3QkFBd0IsQ0FBQztBQUNwRCxPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sMkJBQTJCLENBQUM7QUFDMUQsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBQyxpQkFBaUIsRUFBQyxNQUFNLDZCQUE2QixDQUFDO0FBQzlELE9BQU8sRUFBQyxNQUFNLEVBQUMsTUFBTSxhQUFhLENBQUM7QUFDbkMsT0FBTyxFQUFDLEdBQUcsRUFBQyxNQUFNLFVBQVUsQ0FBQztBQUM3QixPQUFPLEVBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQVksS0FBSyxFQUFDLE1BQU0sbUJBQW1CLENBQUM7QUFDeEUsT0FBTyxFQUFDLFlBQVksRUFBRSxXQUFXLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFDdkQsT0FBTyxFQUFDLFFBQVEsRUFBTyxNQUFNLGVBQWUsQ0FBQztBQUM3QyxPQUFPLEtBQUssS0FBSyxNQUFNLGdCQUFnQixDQUFDO0FBQ3hDLE9BQU8sRUFBQyxPQUFPLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFDdEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxjQUFjLENBQUM7QUFDeEMsT0FBTyxFQUFDLFFBQVEsRUFBQyxNQUFNLG1CQUFtQixDQUFDO0FBQzNDLE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUMvQyxPQUFPLEVBQUMsT0FBTyxFQUFDLE1BQU0sa0JBQWtCLENBQUM7QUFVekMsZUFBZSxDQUFDO0lBQ2QsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFlLEVBQUUsSUFBOEIsRUFBRSxJQUFZO1FBRXZFLElBQUksS0FBSyxDQUFDO1FBQ1YsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFFZCxJQUFJLENBQUMsSUFBSSxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDOUM7UUFDRCxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDZCxLQUFLLEdBQUcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1NBQ3pDO2FBQU07WUFDTCxLQUFLLEdBQUcsSUFBSSxPQUFPLENBQUMsK0JBQStCLENBQUMsQ0FBQztTQUN0RDtRQUNELEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFO1lBQ3RCLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLE9BQU87Z0JBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztTQUM5QztRQUNELE1BQU0sT0FBTyxDQUFDLEdBQUcsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7Q0FDRixDQUFDLENBQUM7QUFFSCxNQUFNLFVBQVUsU0FBUyxDQUFDLElBQVk7SUFDcEMsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQyxJQUFJLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFBRSxPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BFLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JCLENBQUM7QUFXRCxNQUFNLEVBQUUsR0FBRyxFQUFDLFVBQVUsRUFBUSxDQUFDO0FBRS9CLE1BQU0sQ0FBQyxLQUFLLFVBQVUsT0FBTyxDQUFDLEdBQWUsRUFDZixJQUFZLEVBQ1osS0FBYyxFQUNkLE1BQWMsRUFDZCxHQUF5QixFQUN6QixRQUEwQjtJQUl0RCxJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVE7UUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBRWhGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQztJQUV4QixNQUFNLE9BQU8sR0FBOEI7UUFDekMsMkJBQTJCLEVBQUUsS0FBSyxDQUFDLFlBQVksRUFBRTtZQUNwQixLQUFLLENBQUMsbUJBQW1CLEVBQUU7UUFDeEQsNEJBQTRCLEVBQUUsSUFBSTtRQUNsQyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsaUJBQWlCLEVBQUU7UUFDL0MsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLHNCQUFzQixFQUFFO1FBQzFELGtCQUFrQixFQUFFLEtBQUssQ0FBQyxlQUFlLEVBQUU7UUFDM0MsVUFBVSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUU7UUFDNUIsWUFBWSxFQUFFLElBQUk7UUFDbEIsc0JBQXNCLEVBQUUsSUFBSTtRQUM1QixhQUFhLEVBQUUsSUFBSSxLQUFLLE1BQU07UUFDOUIsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLGlCQUFpQixFQUFFO1FBQy9DLHNCQUFzQixFQUFFLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtRQUNuRCw0QkFBNEIsRUFBRSxLQUFLLENBQUMsd0JBQXdCLEVBQUU7UUFDOUQsa0JBQWtCLEVBQUUsS0FBSztRQUN6QixtQkFBbUIsRUFBRSxJQUFJO1FBQ3pCLGNBQWMsRUFBRSxJQUFJO1FBQ3BCLGlCQUFpQixFQUFFLElBQUk7UUFDdkIsZ0JBQWdCLEVBQUUsSUFBSTtRQUN0QixZQUFZLEVBQUUsSUFBSTtRQUNsQixZQUFZLEVBQUUsSUFBSTtRQUNsQixjQUFjLEVBQUUsS0FBSyxDQUFDLFlBQVksRUFBRTtRQUNwQyx5QkFBeUIsRUFBRSxLQUFLLENBQUMscUJBQXFCLEVBQUU7UUFDeEQsWUFBWSxFQUFFLElBQUk7UUFDbEIsZUFBZSxFQUFFLEtBQUssQ0FBQyxZQUFZLEVBQUU7UUFDckMsVUFBVSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUU7UUFDNUIsc0JBQXNCLEVBQUUsVUFBVTtRQUNsQyxlQUFlLEVBQUUsSUFBSTtRQUNyQixxQkFBcUIsRUFBRSxJQUFJO1FBQzNCLGtDQUFrQyxFQUFFLEtBQUssQ0FBQyw2QkFBNkIsRUFBRTtRQUN6RSwrQkFBK0IsRUFBRSxLQUFLLENBQUMsMEJBQTBCLEVBQUU7UUFDbkUscUJBQXFCLEVBQUUsSUFBSTtRQUMzQixpQ0FBaUMsRUFBRSxLQUFLLENBQUMsNkJBQTZCLEVBQUU7UUFDeEUsMEJBQTBCLEVBQUUsSUFBSTtRQUNoQywwQkFBMEIsRUFBRSxLQUFLLENBQUMsc0JBQXNCLEVBQUU7UUFDMUQsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLGlCQUFpQixFQUFFO0tBQy9DLENBQUM7SUFFRixNQUFNLEdBQUcsR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBQzVCLEtBQUssVUFBVSxRQUFRLENBQUMsSUFBWTtRQUNsQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1QyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FDVixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQztTQUNmLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdEUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDbEMsTUFBTSxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUM7SUFFL0IsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFJbkMsTUFBTSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDNUIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3ZCLElBQUksT0FBTyxNQUFNLElBQUksUUFBUTtRQUFHLE1BQWMsQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDO0lBQzVELE1BQU0sQ0FBQyxPQUFPLEdBQUcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDckMsSUFBSSxHQUFHO1FBQUUsR0FBRyxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO0lBQ3RDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUVsQix3QkFBd0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNqQyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUU7UUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFL0Msa0JBQWtCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2xDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzNCLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xDLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsQyxJQUFJLEtBQUssQ0FBQywwQkFBMEIsRUFBRTtRQUFFLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3JFLElBQUksS0FBSyxDQUFDLDZCQUE2QixFQUFFO1FBQUUsc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFMUUsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUUvQixNQUFNLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUc5QixtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM1QixJQUFJLEtBQUssQ0FBQyxzQkFBc0IsRUFBRSxFQUFFO1FBQ2xDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ2hDO1NBQU07UUFDTCx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUNsQztJQUVELE1BQU0sQ0FBQyxhQUFhLEdBQUcsRUFBRSxDQUFDO0lBQzFCLE1BQU0sQ0FBQyxzQkFBc0IsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBRTFELDRCQUE0QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRXJDLElBQUksS0FBSyxDQUFDLHFCQUFxQixFQUFFO1FBQUUscUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDakUsdUJBQXVCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEMscUJBQXFCLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JDLElBQUksS0FBSyxDQUFDLGlCQUFpQixFQUFFO1FBQUUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRXJELElBQUksS0FBSyxDQUFDLFlBQVksRUFBRTtRQUFFLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBRTlELGNBQWMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBRXRDLElBQUksS0FBSyxDQUFDLGlCQUFpQixFQUFFO1FBQUUsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDdEUsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDdkMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUN6QyxhQUFhLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNyQyxJQUFJLEtBQUssQ0FBQyxhQUFhLEVBQUU7UUFBRSxZQUFZLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBSXhELE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JDLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNyRixJQUFJLElBQUksRUFBRTtRQVlSLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxQixLQUFLLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7S0FDbEM7U0FBTTtRQUNMLE9BQU8sQ0FBQyxDQUFDLENBQUM7S0FFWDtJQU9ELElBQUksVUFBVSxFQUFFO1FBR2QsWUFBWSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0tBQ3hFO0lBRUQsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFJdkMsSUFBSSxLQUFLLENBQUMsZUFBZSxFQUFFO1FBQUUsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDcEUsa0NBQWtDLENBQUMsTUFBTSxDQUFDLENBQUM7SUFHM0MsSUFBSSxLQUFLLENBQUMscUJBQXFCLEVBQUUsRUFBRTtRQUNqQyxHQUFHLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixHQUFHLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUMxQjtTQUFNLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRSxFQUFFO1FBQ2xDLEdBQUcsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzFCO0lBRUQsSUFBSSxLQUFLLENBQUMsU0FBUyxFQUFFO1FBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRXpDLElBQUksS0FBSyxDQUFDLGVBQWUsRUFBRTtRQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUVsRCxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUU7UUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQUM7SUFFL0MsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDcEMsZUFBZSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFdkMsSUFBSSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDNUIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2xCLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUd4QixJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUU7UUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlDLE1BQU0sTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ3pCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEIsTUFBTSxHQUFHLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBSTdFLE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQztBQUdELEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxHQUFlLEVBQ2YsTUFBYyxFQUNkLElBQVksRUFDWixLQUFjLEVBQ2QsR0FBYyxFQUNkLFFBQXlDO0lBQ3hFLE1BQU0sUUFBUSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2hDLDZCQUE2QixDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDL0MsZUFBZSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUU1QixvQkFBb0IsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFFbEMsT0FBTyx1QkFBdUIsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBT25ELENBQUM7QUFBQSxDQUFDO0FBRUYsU0FBUyxjQUFjLENBQUMsR0FBUTtJQUM5QixLQUFLLE1BQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO1FBQ2xDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUU7UUFDdkQsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7WUFDM0IsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDO1NBQzdFO0tBQ0Y7QUFDSCxDQUFDO0FBR0QsU0FBUyw0QkFBNEIsQ0FBQyxHQUFRO0lBQzVDLE1BQU0sRUFBQyxLQUFLLEVBQUMsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ25CLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ25CLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDbkIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNuQixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQ3JCLENBQUM7QUFFRCxTQUFTLElBQUksQ0FBQyxHQUFRLEVBQUUsS0FBYyxFQUFFLE1BQWM7SUFDcEQsTUFBTSxFQUFFLEdBQUcsRUFBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBUSxDQUFDO0lBS3ZDLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRzs7Ozs7OzRCQU1OLENBQUM7SUFRM0IsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLHdDQUF3QyxDQUFDO0lBQzNFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3ZDLENBQUM7QUFBQSxDQUFDO0FBRUYsU0FBUyxZQUFZLENBQUMsR0FBUSxFQUFFLE1BQWUsRUFBRSxNQUFjO0lBQzdELE1BQU0sS0FBSyxHQUEwRDtRQUNuRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBQztRQUMzQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBQztLQUMzQyxDQUFDO0lBRUYsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSTtZQUFFLFNBQVM7UUFDbkQsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5QixJQUFJLElBQUksRUFBRTtZQUNSLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QixJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQztTQUNwQjtLQUNGO0lBRUQsS0FBSyxNQUFNLElBQUksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQ3ZDLElBQUksS0FBSyxHQUFrQixJQUFJLENBQUM7UUFDaEMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RCLE9BQU8sS0FBSyxDQUFDLE1BQU0sRUFBRTtZQUNuQixJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRTtnQkFDM0IsSUFBSSxLQUFLO29CQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDekIsS0FBSyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3JFLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDdkI7WUFDRCxNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEIsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzdELElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN6QixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUM7YUFDZjtZQUNELEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUNmO0tBQ0Y7SUFFRCxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDdkMsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQzdCLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztTQUNyQztLQUNGO0FBQ0gsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLEdBQVEsRUFBRSxLQUFjLEVBQUUsTUFBYztJQVc5RCxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRTtRQUFFLE9BQU87SUFFcEMsTUFBTSxJQUFJLEdBQUc7UUFDWCxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLElBQUksQ0FBQztRQUNOLENBQUMsSUFBSSxDQUFDO1FBQ04sQ0FBQyxJQUFJLENBQUM7S0FDUCxDQUFDO0lBRUYsU0FBUyxRQUFRLENBQUMsS0FBWTtRQUM1QixJQUFJLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxFQUFFO1lBQ3hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUM3QjtRQUNELE9BQU8sS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDdEIsQ0FBQztJQUVELE1BQU0sU0FBUyxHQUNYLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVFLEtBQUssTUFBTSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsRUFBRTtRQUVuQyxNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLEtBQUssTUFBTSxRQUFRLElBQUksU0FBUyxFQUFFO1lBQ2hDLEtBQUssTUFBTSxLQUFLLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRTtnQkFDbkMsSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUU7b0JBQ2xCLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDN0IsSUFBSSxJQUFJLEtBQUssQ0FBQzt3QkFBRSxTQUFTO29CQUN6QixJQUFJLElBQUksS0FBSyxDQUFDLEVBQUU7d0JBQ2QsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDakMsSUFBSSxHQUFHLENBQUMsT0FBTzs0QkFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQzt3QkFDbEUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUM7d0JBQ3RCLEtBQUssQ0FBQyxFQUFFLEdBQUcsSUFBSSxHQUFHLE1BQU0sQ0FBQztxQkFDMUI7eUJBQU07d0JBRUwsSUFBSSxDQUFDLEtBQUssSUFBSSxHQUFHLENBQUMsT0FBTyxFQUFFOzRCQUN6QixHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQzs0QkFDOUMsS0FBSyxHQUFHLElBQUksQ0FBQzt5QkFDZDt3QkFDRCxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQzt3QkFDdEIsS0FBSyxDQUFDLEVBQUUsR0FBRyxJQUFJLElBQUksQ0FBQyxHQUFHLEdBQUcsQ0FBQzt3QkFDM0IsUUFBUSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7cUJBQ2hDO2lCQUNGO2FBQ0Y7U0FDRjtLQUNGO0FBQ0gsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLEdBQVEsRUFBRSxLQUFjLEVBQUUsTUFBYztJQUM1RCxJQUFJLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRTtRQUFFLE9BQU87SUFFcEMsTUFBTSxTQUFTO1FBQ2IsWUFBcUIsSUFBWTtZQUFaLFNBQUksR0FBSixJQUFJLENBQVE7UUFBRyxDQUFDO1FBQ3JDLElBQUksR0FBRyxLQUFLLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLFNBQVMsS0FBZ0IsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN0RDtJQUVELE1BQU0sUUFBUSxHQUFHO1FBQ2YsT0FBTztRQUNQLE9BQU87UUFDUCxPQUFPO1FBQ1AsT0FBTztRQUNQLE9BQU87UUFDUCxPQUFPO1FBQ1AsT0FBTztRQUNQLE9BQU87UUFDUCxPQUFPO0tBQ1IsQ0FBQztJQUNGLE1BQU0sVUFBVSxHQUNaLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBYSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQ3BFLE1BQU0sQ0FBQyxDQUFDLENBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFeEMsTUFBTSxRQUFRLEdBQWdCLEVBQUUsQ0FBQztJQUNqQyxNQUFNLE9BQU8sR0FBZ0IsRUFBRSxDQUFDO0lBQ2hDLE1BQU0sTUFBTSxHQUFnQixRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUU1RSxLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsRUFBRTtRQUM3QixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDakIsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDekIsS0FBSyxNQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsTUFBTSxFQUFFO2dCQUM5QixJQUFJLEtBQUssQ0FBQyxTQUFTLEVBQUU7b0JBQUUsUUFBUSxFQUFFLENBQUM7YUFDbkM7U0FDRjtRQUNELENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQzlEO0lBQ0QsTUFBTSxVQUFVLEdBQVksSUFBSSxDQUFDO0lBQ2pDLE1BQU0sVUFBVSxHQUFZLEtBQUssQ0FBQztJQUNsQyxTQUFTLE9BQU8sQ0FBQyxLQUFrQjtRQUNqQyxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqRCxJQUFJLFVBQVUsRUFBRTtZQUNkLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLElBQUksVUFBVTtnQkFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDM0QsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxFQUFFO2dCQUMxQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDaEQsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7b0JBQ3RCLEdBQUcsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDO2lCQUNqQjthQUNGO1lBQ0QsT0FBTztTQUNSO1FBRUQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QixLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUU7WUFDMUIsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsRUFBRyxDQUFDO1lBQzVCLEtBQUssTUFBTSxHQUFHLElBQUksSUFBSSxFQUFFO2dCQUN0QixHQUFHLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQzthQUNqQjtTQUNGO0lBQ0gsQ0FBQztJQUtELE9BQU8sQ0FBQyxDQUFDLEdBQUcsUUFBUSxFQUFFLEdBQUcsT0FBTyxFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUloRCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsR0FBUSxFQUFFLE1BQWUsRUFBRSxNQUFjO0lBQ2hFLE1BQU0sU0FBUyxHQUFlLEVBQUUsQ0FBQztJQUNqQyxLQUFLLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLEVBQUU7UUFDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ2hFLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDbkI7S0FDRjtJQUNELE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDMUIsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQzVCLEtBQUssTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUU7UUFDekUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwQyxJQUFJLEdBQUcsQ0FBQyxPQUFPO1lBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDNUQ7SUFDRCxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLEdBQVEsRUFBRSxNQUFlO0lBQ3pDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxHQUFHLENBQUMsQ0FBQztJQUNyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDbEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLEdBQUcsQ0FBQyxDQUFDO0lBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztJQUNsQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUM7SUFDckMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDO0lBQzVDLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztJQUM1QyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUM7QUFDOUMsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQUMsR0FBUTtJQUV4QyxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzlCLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBRSxDQUFDO0lBQy9DLE1BQU0sT0FBTyxHQUFHO1FBQ2QsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUNWLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDVixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFO1FBQ2xCLE9BQU8sQ0FBQyxDQUFDLENBQUM7S0FDWCxDQUFDO0lBQ0YsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsR0FBRyxDQUFDLEtBQUssQ0FBQztJQUM5QixPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxHQUFHLENBQUMsS0FBSyxDQUFDO0lBQzlCLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDMUIsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxHQUFRO0lBQzVCLE1BQU0sRUFBRSxHQUFHLGdCQUFnQixFQUFFLENBQUM7SUFDOUIsS0FBSyxNQUFNLElBQUksSUFBSSxFQUFFLENBQUMsS0FBSyxFQUFFO1FBQzNCLE1BQU0sSUFBSSxHQUFJLElBQVksQ0FBQyxJQUFJLENBQUM7UUFDaEMsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFVBQVUsSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLFVBQVUsQ0FBQyxFQUFFO1lBQzVFLEdBQUcsQ0FBQyxTQUFTLENBQUUsSUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDekQ7S0FDRjtBQUNILENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLEdBQVEsRUFBRSxLQUFjO0lBRWxELEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBR2hELEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFDTixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDL0MsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFDWixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUMzQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFHL0MsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDckMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBRXJDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDckMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUVyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDckMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFFckMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNyQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDckMsR0FBRyxDQUFDLE9B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QUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUU7UUFDcEMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdDLFdBQVcsQ0FBQyxFQUFFLENBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BDLFdBQVcsQ0FBQyxFQUFFLENBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BDLFdBQVcsQ0FBQyxFQUFFLENBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BDLFdBQVcsQ0FBQyxFQUFFLENBQUUsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUMxQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0tBQ3JDLENBQUMsQ0FBQztJQUVILE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7SUFLbkMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRzVDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUc1QyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdCLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMs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ZCxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZCxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNmO0tBQ0Y7SUFDRCxDQUFDLElBQUksQ0FBQyxFQUFFO1FBRU4sSUFBSSxFQUFFLElBQUk7S0FDWDtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztLQUNiO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFVBQVUsRUFBRTtZQUNWLElBQUksRUFBRSxJQUFJO1NBRVg7UUFDRCxTQUFTLEVBQUUsQ0FBQztLQUNiO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDO1NBQ2xCO0tBQ0Y7SUFDRCxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ04sU0FBUyxFQUFFLENBQUM7S0FDYjtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztLQUNiO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDbkI7S0FDRjtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztRQUNaLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUM7U0FDcEI7S0FDRjtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztRQUNaLFNBQVMsRUFBRTtZQUNULENBQUMs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LElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQ2Y7S0FDRjtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztRQUNaLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUNqQjtLQUNGO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFNBQVMsRUFBRSxDQUFDO1FBQ1osU0FBUyxFQUFFO1lBQ1QsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztTQUN0QjtLQUNGO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDZixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUNqQjtLQUNGO0lBQ0QsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNOLFNBQVMsRUFBRSxDQUFDO0tBQ2I7SUFDRCxDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ04sU0FBUyxFQUFFLENBQUM7S0FDYjtJQUNELENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDTixTQUFTLEVBQUUsQ0FBQztRQUNaLFNBQVMsRUFBRTtZQUNULENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDZCxDQUFDLElBQUksQ0FBQyxF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QUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtBc3NlbWJsZXJ9IGZyb20gJy4vNjUwMi5qcyc7XG5pbXBvcnQge2NyYzMyfSBmcm9tICcuL2NyYzMyLmpzJztcbmltcG9ydCB7UHJvZ3Jlc3NUcmFja2VyLFxuICAgICAgICBnZW5lcmF0ZSBhcyBnZW5lcmF0ZURlcGdyYXBoLFxuICAgICAgICBzaHVmZmxlMiBhcyBfc2h1ZmZsZURlcGdyYXBofSBmcm9tICcuL2RlcGdyYXBoLmpzJztcbmltcG9ydCB7RmV0Y2hSZWFkZXJ9IGZyb20gJy4vZmV0Y2hyZWFkZXIuanMnO1xuaW1wb3J0IHtGbGFnU2V0fSBmcm9tICcuL2ZsYWdzZXQuanMnO1xuaW1wb3J0IHtBc3N1bWVkRmlsbH0gZnJvbSAnLi9ncmFwaC9zaHVmZmxlLmpzJztcbmltcG9ydCB7V29ybGR9IGZyb20gJy4vZ3JhcGgvd29ybGQuanMnO1xuaW1wb3J0IHtmaXhEaWFsb2d9IGZyb20gJy4vcGFzcy9maXhkaWFsb2cuanMnO1xuaW1wb3J0IHtmaXhSZXZlcnNlV2FsbHN9IGZyb20gJy4vcGFzcy9maXhyZXZlcnNld2FsbHMuanMnO1xuaW1wb3J0IHtzaHVmZmxlTWF6ZXN9IGZyb20gJy4vcGFzcy9zaHVmZmxlbWF6ZXMuanMnO1xuaW1wb3J0IHtzaHVmZmxlUGFsZXR0ZXN9IGZyb20gJy4vcGFzcy9zaHVmZmxlcGFsZXR0ZXMuanMnO1xuaW1wb3J0IHtzaHVmZmxlVHJhZGVzfSBmcm9tICcuL3Bhc3Mvc2h1ZmZsZXRyYWRlcy5qcyc7XG5pbXBvcnQge3VuaWRlbnRpZmllZEl0ZW1zfSBmcm9tICcuL3Bhc3MvdW5pZGVudGlmaWVkaXRlbXMuanMnO1xuaW1wb3J0IHtSYW5kb219IGZyb20gJy4vcmFuZG9tLmpzJztcbmltcG9ydCB7Um9tfSBmcm9tICcuL3JvbS5qcyc7XG5pbXBvcnQge0VudHJhbmNlLCBFeGl0LCBGbGFnLCBMb2NhdGlvbiwgU3Bhd259IGZyb20gJy4vcm9tL2xvY2F0aW9uLmpzJztcbmltcG9ydCB7R2xvYmFsRGlhbG9nLCBMb2NhbERpYWxvZ30gZnJvbSAnLi9yb20vbnBjLmpzJztcbmltcG9ydCB7U2hvcFR5cGUsIFNob3B9IGZyb20gJy4vcm9tL3Nob3AuanMnO1xuaW1wb3J0ICogYXMgc2xvdHMgZnJvbSAnLi9yb20vc2xvdHMuanMnO1xuaW1wb3J0IHtTcG9pbGVyfSBmcm9tICcuL3JvbS9zcG9pbGVyLmpzJztcbmltcG9ydCB7aGV4LCBzZXEsIHdhdGNoQXJyYXksIHdyaXRlTGl0dGxlRW5kaWFufSBmcm9tICcuL3JvbS91dGlsLmpzJztcbmltcG9ydCAqIGFzIHZlcnNpb24gZnJvbSAnLi92ZXJzaW9uLmpzJztcbmltcG9ydCB7R3JhcGhpY3N9IGZyb20gJy4vcm9tL2dyYXBoaWNzLmpzJztcbmltcG9ydCB7Q29uc3RyYWludH0gZnJvbSAnLi9yb20vY29uc3RyYWludC5qcyc7XG5pbXBvcnQge01vbnN0ZXJ9IGZyb20gJy4vcm9tL21vbnN0ZXIuanMnO1xuXG4vLyBUT0RPIC0gdG8gc2h1ZmZsZSB0aGUgbW9uc3RlcnMsIHdlIG5lZWQgdG8gZmluZCB0aGUgc3ByaXRlIHBhbHR0ZXMgYW5kXG4vLyBwYXR0ZXJucyBmb3IgZWFjaCBtb25zdGVyLiAgRWFjaCBsb2NhdGlvbiBzdXBwb3J0cyB1cCB0byB0d28gbWF0Y2h1cHMsXG4vLyBzbyBjYW4gb25seSBzdXBwb3J0IG1vbnN0ZXJzIHRoYXQgbWF0Y2guICBNb3Jlb3ZlciwgZGlmZmVyZW50IG1vbnN0ZXJzXG4vLyBzZWVtIHRvIG5lZWQgdG8gYmUgaW4gZWl0aGVyIHNsb3QgMCBvciAxLlxuXG4vLyBQdWxsIGluIGFsbCB0aGUgcGF0Y2hlcyB3ZSB3YW50IHRvIGFwcGx5IGF1dG9tYXRpY2FsbHkuXG4vLyBUT0RPIC0gbWFrZSBhIGRlYnVnZ2VyIHdpbmRvdyBmb3IgcGF0Y2hlcy5cbi8vIFRPRE8gLSB0aGlzIG5lZWRzIHRvIGJlIGEgc2VwYXJhdGUgbm9uLWNvbXBpbGVkIGZpbGUuXG5leHBvcnQgZGVmYXVsdCAoe1xuICBhc3luYyBhcHBseShyb206IFVpbnQ4QXJyYXksIGhhc2g6IHtba2V5OiBzdHJpbmddOiB1bmtub3dufSwgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gTG9vayBmb3IgZmxhZyBzdHJpbmcgYW5kIGhhc2hcbiAgICBsZXQgZmxhZ3M7XG4gICAgaWYgKCFoYXNoLnNlZWQpIHtcbiAgICAgIC8vIFRPRE8gLSBzZW5kIGluIGEgaGFzaCBvYmplY3Qgd2l0aCBnZXQvc2V0IG1ldGhvZHNcbiAgICAgIGhhc2guc2VlZCA9IHBhcnNlU2VlZCgnJykudG9TdHJpbmcoMTYpO1xuICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggKz0gJyZzZWVkPScgKyBoYXNoLnNlZWQ7XG4gICAgfVxuICAgIGlmIChoYXNoLmZsYWdzKSB7XG4gICAgICBmbGFncyA9IG5ldyBGbGFnU2V0KFN0cmluZyhoYXNoLmZsYWdzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZsYWdzID0gbmV3IEZsYWdTZXQoJ0VtIEd0IE1yIFJscHQgU2JrIFNjdCBTbSBUYXNkJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IGluIGhhc2gpIHtcbiAgICAgIGlmIChoYXNoW2tleV0gPT09ICdmYWxzZScpIGhhc2hba2V5XSA9IGZhbHNlO1xuICAgIH1cbiAgICBhd2FpdCBzaHVmZmxlKHJvbSwgcGFyc2VTZWVkKFN0cmluZyhoYXNoLnNlZWQpKSwgZmxhZ3MsIG5ldyBGZXRjaFJlYWRlcihwYXRoKSk7XG4gIH0sXG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU2VlZChzZWVkOiBzdHJpbmcpOiBudW1iZXIge1xuICBpZiAoIXNlZWQpIHJldHVybiBSYW5kb20ubmV3U2VlZCgpO1xuICBpZiAoL15bMC05YS1mXXsxLDh9JC9pLnRlc3Qoc2VlZCkpIHJldHVybiBOdW1iZXIucGFyc2VJbnQoc2VlZCwgMTYpO1xuICByZXR1cm4gY3JjMzIoc2VlZCk7XG59XG5cbi8qKlxuICogQWJzdHJhY3Qgb3V0IEZpbGUgSS9PLiAgTm9kZSBhbmQgYnJvd3NlciB3aWxsIGhhdmUgY29tcGxldGVseVxuICogZGlmZmVyZW50IGltcGxlbWVudGF0aW9ucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBSZWFkZXIge1xuICByZWFkKGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz47XG59XG5cbi8vIHByZXZlbnQgdW51c2VkIGVycm9ycyBhYm91dCB3YXRjaEFycmF5IC0gaXQncyB1c2VkIGZvciBkZWJ1Z2dpbmcuXG5jb25zdCB7fSA9IHt3YXRjaEFycmF5fSBhcyBhbnk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzaHVmZmxlKHJvbTogVWludDhBcnJheSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlZWQ6IG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZsYWdzOiBGbGFnU2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVhZGVyOiBSZWFkZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2c/OiB7c3BvaWxlcj86IFNwb2lsZXJ9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZ3Jlc3M/OiBQcm9ncmVzc1RyYWNrZXIpOiBQcm9taXNlPG51bWJlcj4ge1xuICAvL3JvbSA9IHdhdGNoQXJyYXkocm9tLCAweDg1ZmEgKyAweDEwKTtcblxuICAvLyBGaXJzdCByZWVuY29kZSB0aGUgc2VlZCwgbWl4aW5nIGluIHRoZSBmbGFncyBmb3Igc2VjdXJpdHkuXG4gIGlmICh0eXBlb2Ygc2VlZCAhPT0gJ251bWJlcicpIHRocm93IG5ldyBFcnJvcignQmFkIHNlZWQnKTtcbiAgY29uc3QgbmV3U2VlZCA9IGNyYzMyKHNlZWQudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJykgKyBTdHJpbmcoZmxhZ3MpKSA+Pj4gMDtcblxuICBjb25zdCB0b3VjaFNob3BzID0gdHJ1ZTtcblxuICBjb25zdCBkZWZpbmVzOiB7W25hbWU6IHN0cmluZ106IGJvb2xlYW59ID0ge1xuICAgIF9BTExPV19URUxFUE9SVF9PVVRfT0ZfQk9TUzogZmxhZ3MuaGFyZGNvcmVNb2RlKCkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZsYWdzLnNodWZmbGVCb3NzRWxlbWVudHMoKSxcbiAgICBfQUxMT1dfVEVMRVBPUlRfT1VUX09GX1RPV0VSOiB0cnVlLFxuICAgIF9BVVRPX0VRVUlQX0JSQUNFTEVUOiBmbGFncy5hdXRvRXF1aXBCcmFjZWxldCgpLFxuICAgIF9CQVJSSUVSX1JFUVVJUkVTX0NBTE1fU0VBOiBmbGFncy5iYXJyaWVyUmVxdWlyZXNDYWxtU2VhKCksXG4gICAgX0JVRkZfREVPU19QRU5EQU5UOiBmbGFncy5idWZmRGVvc1BlbmRhbnQoKSxcbiAgICBfQlVGRl9EWU5BOiBmbGFncy5idWZmRHluYSgpLCAvLyB0cnVlLFxuICAgIF9DSEVDS19GTEFHMDogdHJ1ZSxcbiAgICBfQ1VTVE9NX1NIT09USU5HX1dBTExTOiB0cnVlLFxuICAgIF9ERUJVR19ESUFMT0c6IHNlZWQgPT09IDB4MTdiYyxcbiAgICBfRElTQUJMRV9TSE9QX0dMSVRDSDogZmxhZ3MuZGlzYWJsZVNob3BHbGl0Y2goKSxcbiAgICBfRElTQUJMRV9TVEFUVUVfR0xJVENIOiBmbGFncy5kaXNhYmxlU3RhdHVlR2xpdGNoKCksXG4gICAgX0RJU0FCTEVfU1dPUkRfQ0hBUkdFX0dMSVRDSDogZmxhZ3MuZGlzYWJsZVN3b3JkQ2hhcmdlR2xpdGNoKCksXG4gICAgX0RJU0FCTEVfV0lMRF9XQVJQOiBmYWxzZSxcbiAgICBfRElTUExBWV9ESUZGSUNVTFRZOiB0cnVlLFxuICAgIF9FWFRSQV9QSVRZX01QOiB0cnVlLCAgLy8gVE9ETzogYWxsb3cgZGlzYWJsaW5nIHRoaXNcbiAgICBfRklYX0NPSU5fU1BSSVRFUzogdHJ1ZSxcbiAgICBfRklYX09QRUxfU1RBVFVFOiB0cnVlLFxuICAgIF9GSVhfU0hBS0lORzogdHJ1ZSxcbiAgICBfRklYX1ZBTVBJUkU6IHRydWUsXG4gICAgX0hBUkRDT1JFX01PREU6IGZsYWdzLmhhcmRjb3JlTW9kZSgpLFxuICAgIF9MRUFUSEVSX0JPT1RTX0dJVkVfU1BFRUQ6IGZsYWdzLmxlYXRoZXJCb290c0dpdmVTcGVlZCgpLFxuICAgIF9ORVJGX0ZMSUdIVDogdHJ1ZSxcbiAgICBfTkVSRl9XSUxEX1dBUlA6IGZsYWdzLm5lcmZXaWxkV2FycCgpLFxuICAgIF9ORVZFUl9ESUU6IGZsYWdzLm5ldmVyRGllKCksXG4gICAgX05PUk1BTElaRV9TSE9QX1BSSUNFUzogdG91Y2hTaG9wcyxcbiAgICBfUElUWV9IUF9BTkRfTVA6IHRydWUsXG4gICAgX1BST0dSRVNTSVZFX0JSQUNFTEVUOiB0cnVlLFxuICAgIF9SQUJCSVRfQk9PVFNfQ0hBUkdFX1dISUxFX1dBTEtJTkc6IGZsYWdzLnJhYmJpdEJvb3RzQ2hhcmdlV2hpbGVXYWxraW5nKCksXG4gICAgX1JFUVVJUkVfSEVBTEVEX0RPTFBISU5fVE9fUklERTogZmxhZ3MucmVxdWlyZUhlYWxlZERvbHBoaW5Ub1JpZGUoKSxcbiAgICBfUkVWRVJTSUJMRV9TV0FOX0dBVEU6IHRydWUsXG4gICAgX1NBSEFSQV9SQUJCSVRTX1JFUVVJUkVfVEVMRVBBVEhZOiBmbGFncy5zYWhhcmFSYWJiaXRzUmVxdWlyZVRlbGVwYXRoeSgpLFxuICAgIF9TSU1QTElGWV9JTlZJU0lCTEVfQ0hFU1RTOiB0cnVlLFxuICAgIF9URUxFUE9SVF9PTl9USFVOREVSX1NXT1JEOiBmbGFncy50ZWxlcG9ydE9uVGh1bmRlclN3b3JkKCksXG4gICAgX1VOSURFTlRJRklFRF9JVEVNUzogZmxhZ3MudW5pZGVudGlmaWVkSXRlbXMoKSxcbiAgfTtcblxuICBjb25zdCBhc20gPSBuZXcgQXNzZW1ibGVyKCk7XG4gIGFzeW5jIGZ1bmN0aW9uIGFzc2VtYmxlKHBhdGg6IHN0cmluZykge1xuICAgIGFzbS5hc3NlbWJsZShhd2FpdCByZWFkZXIucmVhZChwYXRoKSwgcGF0aCk7XG4gICAgYXNtLnBhdGNoUm9tKHJvbSk7XG4gIH1cblxuICBjb25zdCBmbGFnRmlsZSA9XG4gICAgICBPYmplY3Qua2V5cyhkZWZpbmVzKVxuICAgICAgICAgIC5maWx0ZXIoZCA9PiBkZWZpbmVzW2RdKS5tYXAoZCA9PiBgZGVmaW5lICR7ZH0gMVxcbmApLmpvaW4oJycpO1xuICBhc20uYXNzZW1ibGUoZmxhZ0ZpbGUsICdmbGFncy5zJyk7XG4gIGF3YWl0IGFzc2VtYmxlKCdwcmVzaHVmZmxlLnMnKTtcblxuICBjb25zdCByYW5kb20gPSBuZXcgUmFuZG9tKG5ld1NlZWQpO1xuXG4gIC8vIFBhcnNlIHRoZSByb20gYW5kIGFwcGx5IG90aGVyIHBhdGNoZXMgLSBub3RlOiBtdXN0IGhhdmUgc2h1ZmZsZWRcbiAgLy8gdGhlIGRlcGdyYXBoIEZJUlNUIVxuICBjb25zdCBwYXJzZWQgPSBuZXcgUm9tKHJvbSk7XG4gIGZpeENvaW5TcHJpdGVzKHBhcnNlZCk7XG4gIGlmICh0eXBlb2Ygd2luZG93ID09ICdvYmplY3QnKSAod2luZG93IGFzIGFueSkucm9tID0gcGFyc2VkO1xuICBwYXJzZWQuc3BvaWxlciA9IG5ldyBTcG9pbGVyKHBhcnNlZCk7XG4gIGlmIChsb2cpIGxvZy5zcG9pbGVyID0gcGFyc2VkLnNwb2lsZXI7XG4gIGZpeE1pbWljcyhwYXJzZWQpO1xuXG4gIG1ha2VCcmFjZWxldHNQcm9ncmVzc2l2ZShwYXJzZWQpO1xuICBpZiAoZmxhZ3MuYmxhY2tvdXRNb2RlKCkpIGJsYWNrb3V0TW9kZShwYXJzZWQpO1xuXG4gIGNsb3NlQ2F2ZUVudHJhbmNlcyhwYXJzZWQsIGZsYWdzKTtcbiAgcmV2ZXJzaWJsZVN3YW5HYXRlKHBhcnNlZCk7XG4gIGFkanVzdEdvYUZvcnRyZXNzVHJpZ2dlcnMocGFyc2VkKTtcbiAgcHJldmVudE5wY0Rlc3Bhd25zKHBhcnNlZCwgZmxhZ3MpO1xuICBpZiAoZmxhZ3MucmVxdWlyZUhlYWxlZERvbHBoaW5Ub1JpZGUoKSkgcmVxdWlyZUhlYWxlZERvbHBoaW4ocGFyc2VkKTtcbiAgaWYgKGZsYWdzLnNhaGFyYVJhYmJpdHNSZXF1aXJlVGVsZXBhdGh5KCkpIHJlcXVpcmVUZWxlcGF0aHlGb3JEZW8ocGFyc2VkKTtcblxuICBhZGp1c3RJdGVtTmFtZXMocGFyc2VkLCBmbGFncyk7XG5cbiAgYXdhaXQgYXNzZW1ibGUoJ3Bvc3RwYXJzZS5zJyk7XG5cbiAgLy8gVE9ETyAtIGNvbnNpZGVyIG1ha2luZyBhIFRyYW5zZm9ybWF0aW9uIGludGVyZmFjZSwgd2l0aCBvcmRlcmluZyBjaGVja3NcbiAgYWxhcm1GbHV0ZUlzS2V5SXRlbShwYXJzZWQpOyAvLyBOT1RFOiBwcmUtc2h1ZmZsZVxuICBpZiAoZmxhZ3MudGVsZXBvcnRPblRodW5kZXJTd29yZCgpKSB7XG4gICAgdGVsZXBvcnRPblRodW5kZXJTd29yZChwYXJzZWQpO1xuICB9IGVsc2Uge1xuICAgIG5vVGVsZXBvcnRPblRodW5kZXJTd29yZChwYXJzZWQpO1xuICB9XG5cbiAgcGFyc2VkLnNjYWxpbmdMZXZlbHMgPSA0ODtcbiAgcGFyc2VkLnVuaXF1ZUl0ZW1UYWJsZUFkZHJlc3MgPSBhc20uZXhwYW5kKCdLZXlJdGVtRGF0YScpO1xuXG4gIHVuZGVyZ3JvdW5kQ2hhbm5lbExhbmRCcmlkZ2UocGFyc2VkKTtcblxuICBpZiAoZmxhZ3MuY29ubmVjdExpbWVUcmVlVG9MZWFmKCkpIGNvbm5lY3RMaW1lVHJlZVRvTGVhZihwYXJzZWQpO1xuICBzaW1wbGlmeUludmlzaWJsZUNoZXN0cyhwYXJzZWQpO1xuICBhZGRDb3JkZWxXZXN0VHJpZ2dlcnMocGFyc2VkLCBmbGFncyk7XG4gIGlmIChmbGFncy5kaXNhYmxlUmFiYml0U2tpcCgpKSBmaXhSYWJiaXRTa2lwKHBhcnNlZCk7XG5cbiAgaWYgKGZsYWdzLnNodWZmbGVTaG9wcygpKSBzaHVmZmxlU2hvcHMocGFyc2VkLCBmbGFncywgcmFuZG9tKTtcblxuICByYW5kb21pemVXYWxscyhwYXJzZWQsIGZsYWdzLCByYW5kb20pO1xuXG4gIGlmIChmbGFncy5yYW5kb21pemVXaWxkV2FycCgpKSBzaHVmZmxlV2lsZFdhcnAocGFyc2VkLCBmbGFncywgcmFuZG9tKTtcbiAgcmVzY2FsZU1vbnN0ZXJzKHBhcnNlZCwgZmxhZ3MsIHJhbmRvbSk7XG4gIHVuaWRlbnRpZmllZEl0ZW1zKHBhcnNlZCwgZmxhZ3MsIHJhbmRvbSk7XG4gIHNodWZmbGVUcmFkZXMocGFyc2VkLCBmbGFncywgcmFuZG9tKTtcbiAgaWYgKGZsYWdzLnJhbmRvbWl6ZU1hcHMoKSkgc2h1ZmZsZU1hemVzKHBhcnNlZCwgcmFuZG9tKTtcblxuICAvLyBUaGlzIHdhbnRzIHRvIGdvIGFzIGxhdGUgYXMgcG9zc2libGUgc2luY2Ugd2UgbmVlZCB0byBwaWNrIHVwXG4gIC8vIGFsbCB0aGUgbm9ybWFsaXphdGlvbiBhbmQgb3RoZXIgaGFuZGxpbmcgdGhhdCBoYXBwZW5lZCBiZWZvcmUuXG4gIGNvbnN0IHcgPSBXb3JsZC5idWlsZChwYXJzZWQsIGZsYWdzKTtcbiAgY29uc3QgZmlsbCA9IGF3YWl0IG5ldyBBc3N1bWVkRmlsbChwYXJzZWQsIGZsYWdzKS5zaHVmZmxlKHcuZ3JhcGgsIHJhbmRvbSwgcHJvZ3Jlc3MpO1xuICBpZiAoZmlsbCkge1xuICAgIC8vIGNvbnN0IG4gPSAoaTogbnVtYmVyKSA9PiB7XG4gICAgLy8gICBpZiAoaSA+PSAweDcwKSByZXR1cm4gJ01pbWljJztcbiAgICAvLyAgIGNvbnN0IGl0ZW0gPSBwYXJzZWQuaXRlbXNbcGFyc2VkLml0ZW1HZXRzW2ldLml0ZW1JZF07XG4gICAgLy8gICByZXR1cm4gaXRlbSA/IGl0ZW0ubWVzc2FnZU5hbWUgOiBgaW52YWxpZCAke2l9YDtcbiAgICAvLyB9O1xuICAgIC8vIGNvbnNvbGUubG9nKCdpdGVtOiBzbG90Jyk7XG4gICAgLy8gZm9yIChsZXQgaSA9IDA7IGkgPCBmaWxsLml0ZW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gICBpZiAoZmlsbC5pdGVtc1tpXSAhPSBudWxsKSB7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKGAkJHtoZXgoaSl9ICR7bihpKX06ICR7bihmaWxsLml0ZW1zW2ldKX0gJCR7aGV4KGZpbGwuaXRlbXNbaV0pfWApO1xuICAgIC8vICAgfVxuICAgIC8vIH1cbiAgICB3LnRyYXZlcnNlKHcuZ3JhcGgsIGZpbGwpOyAvLyBmaWxsIHRoZSBzcG9pbGVyIChtYXkgYWxzbyB3YW50IHRvIGp1c3QgYmUgYSBzYW5pdHkgY2hlY2s/KVxuXG4gICAgc2xvdHMudXBkYXRlKHBhcnNlZCwgZmlsbC5zbG90cyk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIC0xO1xuICAgIC8vY29uc29sZS5lcnJvcignQ09VTEQgTk9UIEZJTEwhJyk7XG4gIH1cbiAgLy9jb25zb2xlLmxvZygnZmlsbCcsIGZpbGwpO1xuXG4gIC8vIFRPRE8gLSBzZXQgb21pdEl0ZW1HZXREYXRhU3VmZml4IGFuZCBvbWl0TG9jYWxEaWFsb2dTdWZmaXhcbiAgLy9hd2FpdCBzaHVmZmxlRGVwZ3JhcGgocGFyc2VkLCByYW5kb20sIGxvZywgZmxhZ3MsIHByb2dyZXNzKTtcblxuICAvLyBUT0RPIC0gcmV3cml0ZSByZXNjYWxlU2hvcHMgdG8gdGFrZSBhIFJvbSBpbnN0ZWFkIG9mIGFuIGFycmF5Li4uXG4gIGlmICh0b3VjaFNob3BzKSB7XG4gICAgLy8gVE9ETyAtIHNlcGFyYXRlIGxvZ2ljIGZvciBoYW5kbGluZyBzaG9wcyB3L28gUG4gc3BlY2lmaWVkIChpLmUuIHZhbmlsbGFcbiAgICAvLyBzaG9wcyB0aGF0IG1heSBoYXZlIGJlZW4gcmFuZG9taXplZClcbiAgICByZXNjYWxlU2hvcHMocGFyc2VkLCBhc20sIGZsYWdzLmJhcmdhaW5IdW50aW5nKCkgPyByYW5kb20gOiB1bmRlZmluZWQpO1xuICB9XG5cbiAgbm9ybWFsaXplU3dvcmRzKHBhcnNlZCwgZmxhZ3MsIHJhbmRvbSk7XG4gIC8vIE5PVEU6IG1vbnN0ZXIgc2h1ZmZsZSBuZWVkcyB0byBnbyBhZnRlciBpdGVtIHNodWZmbGUgYmVjYXVzZSBvZiBtaW1pY1xuICAvLyBwbGFjZW1lbnQgY29uc3RyYWludHMsIGJ1dCBpdCB3b3VsZCBiZSBuaWNlIHRvIGdvIGJlZm9yZSBpbiBvcmRlciB0b1xuICAvLyBndWFyYW50ZWUgbW9uZXkuXG4gIGlmIChmbGFncy5zaHVmZmxlTW9uc3RlcnMoKSkgc2h1ZmZsZU1vbnN0ZXJzKHBhcnNlZCwgZmxhZ3MsIHJhbmRvbSk7XG4gIGlkZW50aWZ5S2V5SXRlbXNGb3JEaWZmaWN1bHR5QnVmZnMocGFyc2VkKTtcblxuICAvLyBCdWZmIG1lZGljYWwgaGVyYiBhbmQgZnJ1aXQgb2YgcG93ZXJcbiAgaWYgKGZsYWdzLmRvdWJsZUJ1ZmZNZWRpY2FsSGVyYigpKSB7XG4gICAgcm9tWzB4MWM1MGMgKyAweDEwXSAqPSAyOyAgLy8gZnJ1aXQgb2YgcG93ZXJcbiAgICByb21bMHgxYzRlYSArIDB4MTBdICo9IDM7ICAvLyBtZWRpY2FsIGhlcmJcbiAgfSBlbHNlIGlmIChmbGFncy5idWZmTWVkaWNhbEhlcmIoKSkge1xuICAgIHJvbVsweDFjNTBjICsgMHgxMF0gKz0gMTY7IC8vIGZydWl0IG9mIHBvd2VyXG4gICAgcm9tWzB4MWM0ZWEgKyAweDEwXSAqPSAyOyAgLy8gbWVkaWNhbCBoZXJiXG4gIH1cblxuICBpZiAoZmxhZ3Muc3RvcnlNb2RlKCkpIHN0b3J5TW9kZShwYXJzZWQpO1xuXG4gIGlmIChmbGFncy5jaGFyZ2VTaG90c09ubHkoKSkgZGlzYWJsZVN0YWJzKHBhcnNlZCk7XG5cbiAgaWYgKGZsYWdzLm9yYnNPcHRpb25hbCgpKSBvcmJzT3B0aW9uYWwocGFyc2VkKTtcblxuICBzaHVmZmxlTXVzaWMocGFyc2VkLCBmbGFncywgcmFuZG9tKTtcbiAgc2h1ZmZsZVBhbGV0dGVzKHBhcnNlZCwgZmxhZ3MsIHJhbmRvbSk7XG5cbiAgbWlzYyhwYXJzZWQsIGZsYWdzLCByYW5kb20pO1xuICBmaXhEaWFsb2cocGFyc2VkKTtcbiAgZml4UmV2ZXJzZVdhbGxzKHBhcnNlZCk7XG5cbiAgLy8gTk9URTogVGhpcyBuZWVkcyB0byBoYXBwZW4gQkVGT1JFIHBvc3RzaHVmZmxlXG4gIGlmIChmbGFncy5idWZmRHluYSgpKSBidWZmRHluYShwYXJzZWQsIGZsYWdzKTsgLy8gVE9ETyAtIGNvbmRpdGlvbmFsXG4gIGF3YWl0IHBhcnNlZC53cml0ZURhdGEoKTtcbiAgYnVmZkR5bmEocGFyc2VkLCBmbGFncyk7IC8vIFRPRE8gLSBjb25kaXRpb25hbFxuICBjb25zdCBjcmMgPSBhd2FpdCBwb3N0UGFyc2VkU2h1ZmZsZShyb20sIHJhbmRvbSwgc2VlZCwgZmxhZ3MsIGFzbSwgYXNzZW1ibGUpO1xuXG4gIC8vIFRPRE8gLSBvcHRpb25hbCBmbGFncyBjYW4gcG9zc2libHkgZ28gaGVyZSwgYnV0IE1VU1QgTk9UIHVzZSBwYXJzZWQucHJnIVxuXG4gIHJldHVybiBjcmM7XG59XG5cbi8vIFNlcGFyYXRlIGZ1bmN0aW9uIHRvIGd1YXJhbnRlZSB3ZSBubyBsb25nZXIgaGF2ZSBhY2Nlc3MgdG8gdGhlIHBhcnNlZCByb20uLi5cbmFzeW5jIGZ1bmN0aW9uIHBvc3RQYXJzZWRTaHVmZmxlKHJvbTogVWludDhBcnJheSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhbmRvbTogUmFuZG9tLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VlZDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmxhZ3M6IEZsYWdTZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhc206IEFzc2VtYmxlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzc2VtYmxlOiAocGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTxudW1iZXI+IHtcbiAgYXdhaXQgYXNzZW1ibGUoJ3Bvc3RzaHVmZmxlLnMnKTtcbiAgdXBkYXRlRGlmZmljdWx0eVNjYWxpbmdUYWJsZXMocm9tLCBmbGFncywgYXNtKTtcbiAgdXBkYXRlQ29pbkRyb3BzKHJvbSwgZmxhZ3MpO1xuXG4gIHNodWZmbGVSYW5kb21OdW1iZXJzKHJvbSwgcmFuZG9tKTtcblxuICByZXR1cm4gc3RhbXBWZXJzaW9uU2VlZEFuZEhhc2gocm9tLCBzZWVkLCBmbGFncyk7XG5cbiAgLy8gQkVMT1cgSEVSRSBGT1IgT1BUSU9OQUwgRkxBR1M6XG5cbiAgLy8gZG8gYW55IFwidmFuaXR5XCIgcGF0Y2hlcyBoZXJlLi4uXG4gIC8vIGNvbnNvbGUubG9nKCdwYXRjaCBhcHBsaWVkJyk7XG4gIC8vIHJldHVybiBsb2cuam9pbignXFxuJyk7XG59O1xuXG5mdW5jdGlvbiBmaXhDb2luU3ByaXRlcyhyb206IFJvbSk6IHZvaWQge1xuICBmb3IgKGNvbnN0IHBhZ2Ugb2YgWzB4NjAsIDB4NjQsIDB4NjUsIDB4NjYsIDB4NjcsIDB4NjgsXG4gICAgICAgICAgICAgICAgICAgICAgMHg2OSwgMHg2YSwgMHg2YiwgMHg2YywgMHg2ZCwgMHg2Zl0pIHtcbiAgICBmb3IgKGNvbnN0IHBhdCBvZiBbMCwgMSwgMl0pIHtcbiAgICAgIHJvbS5wYXR0ZXJuc1twYWdlIDw8IDYgfCBwYXRdLnBpeGVscyA9IHJvbS5wYXR0ZXJuc1sweDVlIDw8IDYgfCBwYXRdLnBpeGVscztcbiAgICB9XG4gIH1cbn1cblxuLyoqIE1ha2UgYSBsYW5kIGJyaWRnZSBpbiB1bmRlcmdyb3VuZCBjaGFubmVsICovXG5mdW5jdGlvbiB1bmRlcmdyb3VuZENoYW5uZWxMYW5kQnJpZGdlKHJvbTogUm9tKSB7XG4gIGNvbnN0IHt0aWxlc30gPSByb20uc2NyZWVuc1sweGExXTtcbiAgdGlsZXNbMHgyOF0gPSAweDlmO1xuICB0aWxlc1sweDM3XSA9IDB4MjM7XG4gIHRpbGVzWzB4MzhdID0gMHgyMzsgLy8gMHg4ZTtcbiAgdGlsZXNbMHgzOV0gPSAweDIxO1xuICB0aWxlc1sweDQ3XSA9IDB4OGQ7XG4gIHRpbGVzWzB4NDhdID0gMHg4ZjtcbiAgdGlsZXNbMHg1Nl0gPSAweDk5O1xuICB0aWxlc1sweDU3XSA9IDB4OWE7XG4gIHRpbGVzWzB4NThdID0gMHg4Yztcbn1cblxuZnVuY3Rpb24gbWlzYyhyb206IFJvbSwgZmxhZ3M6IEZsYWdTZXQsIHJhbmRvbTogUmFuZG9tKSB7XG4gIGNvbnN0IHt9ID0ge3JvbSwgZmxhZ3MsIHJhbmRvbX0gYXMgYW55O1xuICAvLyBOT1RFOiB3ZSBzdGlsbCBuZWVkIHRvIGRvIHNvbWUgd29yayBhY3R1YWxseSBhZGp1c3RpbmdcbiAgLy8gbWVzc2FnZSB0ZXh0cyB0byBwcmV2ZW50IGxpbmUgb3ZlcmZsb3csIGV0Yy4gIFdlIHNob3VsZFxuICAvLyBhbHNvIG1ha2Ugc29tZSBob29rcyB0byBlYXNpbHkgc3dhcCBvdXQgaXRlbXMgd2hlcmUgaXRcbiAgLy8gbWFrZXMgc2Vuc2UuXG4gIHJvbS5tZXNzYWdlcy5wYXJ0c1syXVsyXS50ZXh0ID0gYFxuezAxOkFrYWhhbmF9IGlzIGhhbmRlZCBhIHN0YXR1ZS4jXG5UaGFua3MgZm9yIGZpbmRpbmcgdGhhdC5cbkkgd2FzIHRvdGFsbHkgZ29ubmEgc2VsbFxuaXQgZm9yIHRvbnMgb2YgY2FzaC4jXG5IZXJlLCBoYXZlIHRoaXMgbGFtZVxuWzI5OkdhcyBNYXNrXSBvciBzb21ldGhpbmcuYDtcbiAgLy8gVE9ETyAtIHdvdWxkIGJlIG5pY2UgdG8gYWRkIHNvbWUgbW9yZSAoaGlnaGVyIGxldmVsKSBtYXJrdXAsXG4gIC8vIGUuZy4gYCR7ZGVzY3JpYmVJdGVtKHNsb3ROdW0pfWAuICBXZSBjb3VsZCBhbHNvIGFkZCBtYXJrdXBcbiAgLy8gZm9yIGUuZy4gYCR7c2F5V2FudChzbG90TnVtKX1gIGFuZCBgJHtzYXlUaGFua3Moc2xvdE51bSl9YFxuICAvLyBpZiB3ZSBzaHVmZmxlIHRoZSB3YW50ZWQgaXRlbXMuICBUaGVzZSBjb3VsZCBiZSByYW5kb21pemVkXG4gIC8vIGluIHZhcmlvdXMgd2F5cywgYXMgd2VsbCBhcyBoYXZpbmcgc29tZSBhZGRpdGlvbmFsIGJpdHMgbGlrZVxuICAvLyB3YW50QXV4aWxpYXJ5KC4uLikgZm9yIGUuZy4gXCJ0aGUga2lyaXNhIHBsYW50IGlzIC4uLlwiIC0gdGhlblxuICAvLyBpdCBjb3VsZCBpbnN0ZWFkIHNheSBcInRoZSBzdGF0dWUgb2Ygb255eCBpcyAuLi5cIi5cbiAgcm9tLm1lc3NhZ2VzLnBhcnRzWzBdWzB4ZV0udGV4dCA9IGBJdCdzIGRhbmdlcm91cyB0byBnbyBhbG9uZSEgVGFrZSB0aGlzLmA7XG4gIHJvbS5tZXNzYWdlcy5wYXJ0c1swXVsweGVdLmZpeFRleHQoKTtcbn07XG5cbmZ1bmN0aW9uIHNodWZmbGVTaG9wcyhyb206IFJvbSwgX2ZsYWdzOiBGbGFnU2V0LCByYW5kb206IFJhbmRvbSk6IHZvaWQge1xuICBjb25zdCBzaG9wczoge1t0eXBlOiBudW1iZXJdOiB7Y29udGVudHM6IG51bWJlcltdLCBzaG9wczogU2hvcFtdfX0gPSB7XG4gICAgW1Nob3BUeXBlLkFSTU9SXToge2NvbnRlbnRzOiBbXSwgc2hvcHM6IFtdfSxcbiAgICBbU2hvcFR5cGUuVE9PTF06IHtjb250ZW50czogW10sIHNob3BzOiBbXX0sXG4gIH07XG4gIC8vIFJlYWQgYWxsIHRoZSBjb250ZW50cy5cbiAgZm9yIChjb25zdCBzaG9wIG9mIHJvbS5zaG9wcykge1xuICAgIGlmICghc2hvcC51c2VkIHx8IHNob3AubG9jYXRpb24gPT09IDB4ZmYpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGRhdGEgPSBzaG9wc1tzaG9wLnR5cGVdO1xuICAgIGlmIChkYXRhKSB7XG4gICAgICBkYXRhLmNvbnRlbnRzLnB1c2goLi4uc2hvcC5jb250ZW50cy5maWx0ZXIoeCA9PiB4ICE9PSAweGZmKSk7XG4gICAgICBkYXRhLnNob3BzLnB1c2goc2hvcCk7XG4gICAgICBzaG9wLmNvbnRlbnRzID0gW107XG4gICAgfVxuICB9XG4gIC8vIFNodWZmbGUgdGhlIGNvbnRlbnRzLiAgUGljayBvcmRlciB0byBkcm9wIGl0ZW1zIGluLlxuICBmb3IgKGNvbnN0IGRhdGEgb2YgT2JqZWN0LnZhbHVlcyhzaG9wcykpIHtcbiAgICBsZXQgc2xvdHM6IFNob3BbXSB8IG51bGwgPSBudWxsO1xuICAgIGNvbnN0IGl0ZW1zID0gWy4uLmRhdGEuY29udGVudHNdO1xuICAgIHJhbmRvbS5zaHVmZmxlKGl0ZW1zKTtcbiAgICB3aGlsZSAoaXRlbXMubGVuZ3RoKSB7XG4gICAgICBpZiAoIXNsb3RzIHx8ICFzbG90cy5sZW5ndGgpIHtcbiAgICAgICAgaWYgKHNsb3RzKSBpdGVtcy5zaGlmdCgpO1xuICAgICAgICBzbG90cyA9IFsuLi5kYXRhLnNob3BzLCAuLi5kYXRhLnNob3BzLCAuLi5kYXRhLnNob3BzLCAuLi5kYXRhLnNob3BzXTtcbiAgICAgICAgcmFuZG9tLnNodWZmbGUoc2xvdHMpO1xuICAgICAgfVxuICAgICAgY29uc3QgaXRlbSA9IGl0ZW1zWzBdO1xuICAgICAgY29uc3Qgc2hvcCA9IHNsb3RzWzBdO1xuICAgICAgaWYgKHNob3AuY29udGVudHMubGVuZ3RoIDwgNCAmJiAhc2hvcC5jb250ZW50cy5pbmNsdWRlcyhpdGVtKSkge1xuICAgICAgICBzaG9wLmNvbnRlbnRzLnB1c2goaXRlbSk7XG4gICAgICAgIGl0ZW1zLnNoaWZ0KCk7XG4gICAgICB9XG4gICAgICBzbG90cy5zaGlmdCgpO1xuICAgIH1cbiAgfVxuICAvLyBTb3J0IGFuZCBhZGQgMHhmZidzXG4gIGZvciAoY29uc3QgZGF0YSBvZiBPYmplY3QudmFsdWVzKHNob3BzKSkge1xuICAgIGZvciAoY29uc3Qgc2hvcCBvZiBkYXRhLnNob3BzKSB7XG4gICAgICB3aGlsZSAoc2hvcC5jb250ZW50cy5sZW5ndGggPCA0KSBzaG9wLmNvbnRlbnRzLnB1c2goMHhmZik7XG4gICAgICBzaG9wLmNvbnRlbnRzLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcmFuZG9taXplV2FsbHMocm9tOiBSb20sIGZsYWdzOiBGbGFnU2V0LCByYW5kb206IFJhbmRvbSk6IHZvaWQge1xuICAvLyBOT1RFOiBXZSBjYW4gbWFrZSBhbnkgd2FsbCBzaG9vdCBieSBzZXR0aW5nIGl0cyAkMTAgYml0IG9uIHRoZSB0eXBlIGJ5dGUuXG4gIC8vIEJ1dCB0aGlzIGFsc28gcmVxdWlyZXMgbWF0Y2hpbmcgcGF0dGVybiB0YWJsZXMsIHNvIHdlJ2xsIGxlYXZlIHRoYXQgYWxvbmVcbiAgLy8gZm9yIG5vdyB0byBhdm9pZCBncm9zcyBncmFwaGljcy5cblxuICAvLyBBbGwgb3RoZXIgd2FsbHMgd2lsbCBuZWVkIHRoZWlyIHR5cGUgbW92ZWQgaW50byB0aGUgdXBwZXIgbmliYmxlIGFuZCB0aGVuXG4gIC8vIHRoZSBuZXcgZWxlbWVudCBnb2VzIGluIHRoZSBsb3dlciBuaWJibGUuICBTaW5jZSB0aGVyZSBhcmUgc28gZmV3IGlyb25cbiAgLy8gd2FsbHMsIHdlIHdpbGwgZ2l2ZSB0aGVtIGFyYml0cmFyeSBlbGVtZW50cyBpbmRlcGVuZGVudCBvZiB0aGUgcGFsZXR0ZS5cbiAgLy8gUm9jay9pY2Ugd2FsbHMgY2FuIGFsc28gaGF2ZSBhbnkgZWxlbWVudCwgYnV0IHRoZSB0aGlyZCBwYWxldHRlIHdpbGxcbiAgLy8gaW5kaWNhdGUgd2hhdCB0aGV5IGV4cGVjdC5cblxuICBpZiAoIWZsYWdzLnJhbmRvbWl6ZVdhbGxzKCkpIHJldHVybjtcbiAgLy8gQmFzaWMgcGxhbjogcGFydGl0aW9uIGJhc2VkIG9uIHBhbGV0dGUsIGxvb2sgZm9yIHdhbGxzLlxuICBjb25zdCBwYWxzID0gW1xuICAgIFsweDA1LCAweDM4XSwgLy8gcm9jayB3YWxsIHBhbGV0dGVzXG4gICAgWzB4MTFdLCAvLyBpY2Ugd2FsbCBwYWxldHRlc1xuICAgIFsweDZhXSwgLy8gXCJlbWJlciB3YWxsXCIgcGFsZXR0ZXNcbiAgICBbMHgxNF0sIC8vIFwiaXJvbiB3YWxsXCIgcGFsZXR0ZXNcbiAgXTtcblxuICBmdW5jdGlvbiB3YWxsVHlwZShzcGF3bjogU3Bhd24pOiBudW1iZXIge1xuICAgIGlmIChzcGF3bi5kYXRhWzJdICYgMHgyMCkge1xuICAgICAgcmV0dXJuIChzcGF3bi5pZCA+Pj4gNCkgJiAzO1xuICAgIH1cbiAgICByZXR1cm4gc3Bhd24uaWQgJiAzO1xuICB9XG5cbiAgY29uc3QgcGFydGl0aW9uID1cbiAgICAgIHJvbS5sb2NhdGlvbnMucGFydGl0aW9uKGwgPT4gbC50aWxlUGFsZXR0ZXMuam9pbignICcpLCB1bmRlZmluZWQsIHRydWUpO1xuICBmb3IgKGNvbnN0IFtsb2NhdGlvbnNdIG9mIHBhcnRpdGlvbikge1xuICAgIC8vIHBpY2sgYSByYW5kb20gd2FsbCB0eXBlLlxuICAgIGNvbnN0IGVsdCA9IHJhbmRvbS5uZXh0SW50KDQpO1xuICAgIGNvbnN0IHBhbCA9IHJhbmRvbS5waWNrKHBhbHNbZWx0XSk7XG4gICAgbGV0IGZvdW5kID0gZmFsc2U7XG4gICAgZm9yIChjb25zdCBsb2NhdGlvbiBvZiBsb2NhdGlvbnMpIHtcbiAgICAgIGZvciAoY29uc3Qgc3Bhd24gb2YgbG9jYXRpb24uc3Bhd25zKSB7XG4gICAgICAgIGlmIChzcGF3bi5pc1dhbGwoKSkge1xuICAgICAgICAgIGNvbnN0IHR5cGUgPSB3YWxsVHlwZShzcGF3bik7XG4gICAgICAgICAgaWYgKHR5cGUgPT09IDIpIGNvbnRpbnVlO1xuICAgICAgICAgIGlmICh0eXBlID09PSAzKSB7XG4gICAgICAgICAgICBjb25zdCBuZXdFbHQgPSByYW5kb20ubmV4dEludCg0KTtcbiAgICAgICAgICAgIGlmIChyb20uc3BvaWxlcikgcm9tLnNwb2lsZXIuYWRkV2FsbChsb2NhdGlvbi5uYW1lLCB0eXBlLCBuZXdFbHQpO1xuICAgICAgICAgICAgc3Bhd24uZGF0YVsyXSB8PSAweDIwO1xuICAgICAgICAgICAgc3Bhd24uaWQgPSAweDMwIHwgbmV3RWx0O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhgJHtsb2NhdGlvbi5uYW1lfSAke3R5cGV9ID0+ICR7ZWx0fWApO1xuICAgICAgICAgICAgaWYgKCFmb3VuZCAmJiByb20uc3BvaWxlcikge1xuICAgICAgICAgICAgICByb20uc3BvaWxlci5hZGRXYWxsKGxvY2F0aW9uLm5hbWUsIHR5cGUsIGVsdCk7XG4gICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNwYXduLmRhdGFbMl0gfD0gMHgyMDtcbiAgICAgICAgICAgIHNwYXduLmlkID0gdHlwZSA8PCA0IHwgZWx0O1xuICAgICAgICAgICAgbG9jYXRpb24udGlsZVBhbGV0dGVzWzJdID0gcGFsO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzaHVmZmxlTXVzaWMocm9tOiBSb20sIGZsYWdzOiBGbGFnU2V0LCByYW5kb206IFJhbmRvbSk6IHZvaWQge1xuICBpZiAoIWZsYWdzLnJhbmRvbWl6ZU11c2ljKCkpIHJldHVybjtcbiAgaW50ZXJmYWNlIEhhc011c2ljIHsgYmdtOiBudW1iZXI7IH1cbiAgY2xhc3MgQm9zc011c2ljIGltcGxlbWVudHMgSGFzTXVzaWMge1xuICAgIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGFkZHI6IG51bWJlcikge31cbiAgICBnZXQgYmdtKCkgeyByZXR1cm4gcm9tLnByZ1t0aGlzLmFkZHJdOyB9XG4gICAgc2V0IGJnbSh4KSB7IHJvbS5wcmdbdGhpcy5hZGRyXSA9IHg7IH1cbiAgICBwYXJ0aXRpb24oKTogUGFydGl0aW9uIHsgcmV0dXJuIFtbdGhpc10sIHRoaXMuYmdtXTsgfVxuICB9XG4gIHR5cGUgUGFydGl0aW9uID0gW0hhc011c2ljW10sIG51bWJlcl07XG4gIGNvbnN0IGJvc3NBZGRyID0gW1xuICAgIDB4MWU0YjgsIC8vIHZhbXBpcmUgMVxuICAgIDB4MWU2OTAsIC8vIGluc2VjdFxuICAgIDB4MWU5OWIsIC8vIGtlbGJlc3F1ZVxuICAgIDB4MWVjYjEsIC8vIHNhYmVyYVxuICAgIDB4MWVlMGYsIC8vIG1hZG9cbiAgICAweDFlZjgzLCAvLyBrYXJtaW5lXG4gICAgMHgxZjE4NywgLy8gZHJheWdvbiAxXG4gICAgMHgxZjMxMSwgLy8gZHJheWdvbiAyXG4gICAgMHgzN2MzMCwgLy8gZHluYVxuICBdO1xuICBjb25zdCBwYXJ0aXRpb25zID1cbiAgICAgIHJvbS5sb2NhdGlvbnMucGFydGl0aW9uKChsb2M6IExvY2F0aW9uKSA9PiBsb2MuaWQgIT09IDB4NWYgPyBsb2MuYmdtIDogMClcbiAgICAgICAgICAuZmlsdGVyKChsOiBQYXJ0aXRpb24pID0+IGxbMV0pOyAvLyBmaWx0ZXIgb3V0IHN0YXJ0IGFuZCBkeW5hXG5cbiAgY29uc3QgcGVhY2VmdWw6IFBhcnRpdGlvbltdID0gW107XG4gIGNvbnN0IGhvc3RpbGU6IFBhcnRpdGlvbltdID0gW107XG4gIGNvbnN0IGJvc3NlczogUGFydGl0aW9uW10gPSBib3NzQWRkci5tYXAoYSA9PiBuZXcgQm9zc011c2ljKGEpLnBhcnRpdGlvbigpKTtcblxuICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydGl0aW9ucykge1xuICAgIGxldCBtb25zdGVycyA9IDA7XG4gICAgZm9yIChjb25zdCBsb2Mgb2YgcGFydFswXSkge1xuICAgICAgZm9yIChjb25zdCBzcGF3biBvZiBsb2Muc3Bhd25zKSB7XG4gICAgICAgIGlmIChzcGF3bi5pc01vbnN0ZXIoKSkgbW9uc3RlcnMrKztcbiAgICAgIH1cbiAgICB9XG4gICAgKG1vbnN0ZXJzID49IHBhcnRbMF0ubGVuZ3RoID8gaG9zdGlsZSA6IHBlYWNlZnVsKS5wdXNoKHBhcnQpO1xuICB9XG4gIGNvbnN0IGV2ZW5XZWlnaHQ6IGJvb2xlYW4gPSB0cnVlO1xuICBjb25zdCBleHRyYU11c2ljOiBib29sZWFuID0gZmFsc2U7XG4gIGZ1bmN0aW9uIHNodWZmbGUocGFydHM6IFBhcnRpdGlvbltdKSB7XG4gICAgY29uc3QgdmFsdWVzID0gcGFydHMubWFwKCh4OiBQYXJ0aXRpb24pID0+IHhbMV0pO1xuXG4gICAgaWYgKGV2ZW5XZWlnaHQpIHtcbiAgICAgIGNvbnN0IHVzZWQgPSBbLi4ubmV3IFNldCh2YWx1ZXMpXTtcbiAgICAgIGlmIChleHRyYU11c2ljKSB1c2VkLnB1c2goMHg5LCAweGEsIDB4YiwgMHgxYSwgMHgxYywgMHgxZCk7XG4gICAgICBmb3IgKGNvbnN0IFtsb2NzXSBvZiBwYXJ0cykge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVzZWRbcmFuZG9tLm5leHRJbnQodXNlZC5sZW5ndGgpXTtcbiAgICAgICAgZm9yIChjb25zdCBsb2Mgb2YgbG9jcykge1xuICAgICAgICAgIGxvYy5iZ20gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHJhbmRvbS5zaHVmZmxlKHZhbHVlcyk7XG4gICAgZm9yIChjb25zdCBbbG9jc10gb2YgcGFydHMpIHtcbiAgICAgIGNvbnN0IHZhbHVlID0gdmFsdWVzLnBvcCgpITtcbiAgICAgIGZvciAoY29uc3QgbG9jIG9mIGxvY3MpIHtcbiAgICAgICAgbG9jLmJnbSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBzaHVmZmxlKHBlYWNlZnVsKTtcbiAgLy8gc2h1ZmZsZShob3N0aWxlKTtcbiAgLy8gc2h1ZmZsZShib3NzZXMpO1xuXG4gIHNodWZmbGUoWy4uLnBlYWNlZnVsLCAuLi5ob3N0aWxlLCAuLi5ib3NzZXNdKTtcblxuICAvLyBUT0RPIC0gY29uc2lkZXIgYWxzbyBzaHVmZmxpbmcgU0ZYP1xuICAvLyAgLSBlLmcuIGZsYWlsIGd1eSBjb3VsZCBtYWtlIHRoZSBmbGFtZSBzb3VuZD9cbn1cblxuZnVuY3Rpb24gc2h1ZmZsZVdpbGRXYXJwKHJvbTogUm9tLCBfZmxhZ3M6IEZsYWdTZXQsIHJhbmRvbTogUmFuZG9tKTogdm9pZCB7XG4gIGNvbnN0IGxvY2F0aW9uczogTG9jYXRpb25bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGwgb2Ygcm9tLmxvY2F0aW9ucykge1xuICAgIGlmIChsICYmIGwudXNlZCAmJiBsLmlkICYmICFsLmV4dGVuZGVkICYmIChsLmlkICYgMHhmOCkgIT09IDB4NTgpIHtcbiAgICAgIGxvY2F0aW9ucy5wdXNoKGwpO1xuICAgIH1cbiAgfVxuICByYW5kb20uc2h1ZmZsZShsb2NhdGlvbnMpO1xuICByb20ud2lsZFdhcnAubG9jYXRpb25zID0gW107XG4gIGZvciAoY29uc3QgbG9jIG9mIFsuLi5sb2NhdGlvbnMuc2xpY2UoMCwgMTUpLnNvcnQoKGEsIGIpID0+IGEuaWQgLSBiLmlkKV0pIHtcbiAgICByb20ud2lsZFdhcnAubG9jYXRpb25zLnB1c2gobG9jLmlkKTtcbiAgICBpZiAocm9tLnNwb2lsZXIpIHJvbS5zcG9pbGVyLmFkZFdpbGRXYXJwKGxvYy5pZCwgbG9jLm5hbWUpO1xuICB9XG4gIHJvbS53aWxkV2FycC5sb2NhdGlvbnMucHVzaCgwKTtcbn1cblxuZnVuY3Rpb24gYnVmZkR5bmEocm9tOiBSb20sIF9mbGFnczogRmxhZ1NldCk6IHZvaWQge1xuICByb20ub2JqZWN0c1sweGI4XS5jb2xsaXNpb25QbGFuZSA9IDE7XG4gIHJvbS5vYmplY3RzWzB4YjhdLmltbW9iaWxlID0gdHJ1ZTtcbiAgcm9tLm9iamVjdHNbMHhiOV0uY29sbGlzaW9uUGxhbmUgPSAxO1xuICByb20ub2JqZWN0c1sweGI5XS5pbW1vYmlsZSA9IHRydWU7XG4gIHJvbS5vYmplY3RzWzB4MzNdLmNvbGxpc2lvblBsYW5lID0gMjtcbiAgcm9tLmFkSG9jU3Bhd25zWzB4MjhdLnNsb3RSYW5nZUxvd2VyID0gMHgxYzsgLy8gY291bnRlclxuICByb20uYWRIb2NTcGF3bnNbMHgyOV0uc2xvdFJhbmdlVXBwZXIgPSAweDFjOyAvLyBsYXNlclxuICByb20uYWRIb2NTcGF3bnNbMHgyYV0uc2xvdFJhbmdlVXBwZXIgPSAweDFjOyAvLyBidWJibGVcbn1cblxuZnVuY3Rpb24gbWFrZUJyYWNlbGV0c1Byb2dyZXNzaXZlKHJvbTogUm9tKTogdm9pZCB7XG4gIC8vIHRvcm5lbCdzIHRyaWdnZXIgbmVlZHMgYm90aCBpdGVtc1xuICBjb25zdCB0b3JuZWwgPSByb20ubnBjc1sweDVmXTtcbiAgY29uc3QgdmFuaWxsYSA9IHRvcm5lbC5sb2NhbERpYWxvZ3MuZ2V0KDB4MjEpITtcbiAgY29uc3QgcGF0Y2hlZCA9IFtcbiAgICB2YW5pbGxhWzBdLCAvLyBhbHJlYWR5IGxlYXJuZWQgdGVsZXBvcnRcbiAgICB2YW5pbGxhWzJdLCAvLyBkb24ndCBoYXZlIHRvcm5hZG8gYnJhY2VsZXRcbiAgICB2YW5pbGxhWzJdLmNsb25lKCksIC8vIHdpbGwgY2hhbmdlIHRvIGRvbid0IGhhdmUgb3JiXG4gICAgdmFuaWxsYVsxXSwgLy8gaGF2ZSBicmFjZWxldCwgbGVhcm4gdGVsZXBvcnRcbiAgXTtcbiAgcGF0Y2hlZFsxXS5jb25kaXRpb24gPSB+MHgyMDY7IC8vIGRvbid0IGhhdmUgYnJhY2VsZXRcbiAgcGF0Y2hlZFsyXS5jb25kaXRpb24gPSB+MHgyMDU7IC8vIGRvbid0IGhhdmUgb3JiXG4gIHBhdGNoZWRbM10uY29uZGl0aW9uID0gfjA7ICAgICAvLyBkZWZhdWx0XG4gIHRvcm5lbC5sb2NhbERpYWxvZ3Muc2V0KDB4MjEsIHBhdGNoZWQpO1xufVxuXG5mdW5jdGlvbiBibGFja291dE1vZGUocm9tOiBSb20pIHtcbiAgY29uc3QgZGcgPSBnZW5lcmF0ZURlcGdyYXBoKCk7XG4gIGZvciAoY29uc3Qgbm9kZSBvZiBkZy5ub2Rlcykge1xuICAgIGNvbnN0IHR5cGUgPSAobm9kZSBhcyBhbnkpLnR5cGU7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT09ICdMb2NhdGlvbicgJiYgKHR5cGUgPT09ICdjYXZlJyB8fCB0eXBlID09PSAnZm9ydHJlc3MnKSkge1xuICAgICAgcm9tLmxvY2F0aW9uc1sobm9kZSBhcyBhbnkpLmlkXS50aWxlUGFsZXR0ZXMuZmlsbCgweDlhKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xvc2VDYXZlRW50cmFuY2VzKHJvbTogUm9tLCBmbGFnczogRmxhZ1NldCk6IHZvaWQge1xuICAvLyBQcmV2ZW50IHNvZnRsb2NrIGZyb20gZXhpdGluZyBzZWFsZWQgY2F2ZSBiZWZvcmUgd2luZG1pbGwgc3RhcnRlZFxuICByb20ubG9jYXRpb25zLnZhbGxleU9mV2luZC5lbnRyYW5jZXNbMV0ueSArPSAxNjtcblxuICAvLyBDbGVhciB0aWxlcyAxLDIsMyw0IGZvciBibG9ja2FibGUgY2F2ZXMgaW4gdGlsZXNldHMgOTAsIDk0LCBhbmQgOWNcbiAgcm9tLnN3YXBNZXRhdGlsZXMoWzB4OTBdLFxuICAgICAgICAgICAgICAgICAgICBbMHgwNywgWzB4MDEsIDB4MDBdLCB+MHhjMV0sXG4gICAgICAgICAgICAgICAgICAgIFsweDBlLCBbMHgwMiwgMHgwMF0sIH4weGMxXSxcbiAgICAgICAgICAgICAgICAgICAgWzB4MjAsIFsweDAzLCAweDBhXSwgfjB4ZDddLFxuICAgICAgICAgICAgICAgICAgICBbMHgyMSwgWzB4MDQsIDB4MGFdLCB+MHhkN10pO1xuICByb20uc3dhcE1ldGF0aWxlcyhbMHg5NCwgMHg5Y10sXG4gICAgICAgICAgICAgICAgICAgIFsweDY4LCBbMHgwMSwgMHgwMF0sIH4weGMxXSxcbiAgICAgICAgICAgICAgICAgICAgWzB4ODMsIFsweDAyLCAweDAwXSwgfjB4YzFdLFxuICAgICAgICAgICAgICAgICAgICBbMHg4OCwgWzB4MDMsIDB4MGFdLCB+MHhkN10sXG4gICAgICAgICAgICAgICAgICAgIFsweDg5LCBbMHgwNCwgMHgwYV0sIH4weGQ3XSk7XG5cbiAgLy8gTm93IHJlcGxhY2UgdGhlIHRpbGVzIHdpdGggdGhlIGJsb2NrYWJsZSBvbmVzXG4gIHJvbS5zY3JlZW5zWzB4MGFdLnRpbGVzWzB4MzhdID0gMHgwMTtcbiAgcm9tLnNjcmVlbnNbMHgwYV0udGlsZXNbMHgzOV0gPSAweDAyO1xuICByb20uc2NyZWVuc1sweDBhXS50aWxlc1sweDQ4XSA9IDB4MDM7XG4gIHJvbS5zY3JlZW5zWzB4MGFdLnRpbGVzWzB4NDldID0gMHgwNDtcblxuICByb20uc2NyZWVuc1sweDE1XS50aWxlc1sweDc5XSA9IDB4MDE7XG4gIHJvbS5zY3JlZW5zWzB4MTVdLnRpbGVzWzB4N2FdID0gMHgwMjtcbiAgcm9tLnNjcmVlbnNbMHgxNV0udGlsZXNbMHg4OV0gPSAweDAzO1xuICByb20uc2NyZWVuc1sweDE1XS50aWxlc1sweDhhXSA9IDB4MDQ7XG5cbiAgcm9tLnNjcmVlbnNbMHgxOV0udGlsZXNbMHg0OF0gPSAweDAxO1xuICByb20uc2NyZWVuc1sweDE5XS50aWxlc1sweDQ5XSA9IDB4MDI7XG4gIHJvbS5zY3JlZW5zWzB4MTldLnRpbGVzWzB4NThdID0gMHgwMztcbiAgcm9tLnNjcmVlbnNbMHgxOV0udGlsZXNbMHg1OV0gPSAweDA0O1xuXG4gIHJvbS5zY3JlZW5zWzB4M2VdLnRpbGVzWzB4NTZdID0gMHgwMTtcbiAgcm9tLnNjcmVlbnNbMHgzZV0udGlsZXNbMHg1N10gPSAweDAyO1xuICByb20uc2NyZWVuc1sweDNlXS50aWxlc1sweDY2XSA9IDB4MDM7XG4gIHJvbS5zY3JlZW5zWzB4M2VdLnRpbGVzWzB4NjddID0gMHgwNDtcblxuICAvLyBEZXN0cnVjdHVyZSBvdXQgYSBmZXcgbG9jYXRpb25zIGJ5IG5hbWVcbiAgY29uc3Qge1xuICAgIHZhbGxleU9mV2luZCxcbiAgICBjb3JkZWxQbGFpbnNXZXN0LFxuICAgIGNvcmRlbFBsYWluc0Vhc3QsXG4gICAgd2F0ZXJmYWxsVmFsbGV5Tm9ydGgsXG4gICAgd2F0ZXJmYWxsVmFsbGV5U291dGgsXG4gICAga2lyaXNhTWVhZG93LFxuICAgIHNhaGFyYU91dHNpZGVDYXZlLFxuICAgIGRlc2VydDIsXG4gIH0gPSByb20ubG9jYXRpb25zO1xuXG4gIC8vIE5PVEU6IGZsYWcgMmVmIGlzIEFMV0FZUyBzZXQgLSB1c2UgaXQgYXMgYSBiYXNlbGluZS5cbiAgY29uc3QgZmxhZ3NUb0NsZWFyID0gW1xuICAgIFt2YWxsZXlPZldpbmQsIDB4MzBdLCAvLyB2YWxsZXkgb2Ygd2luZCwgemVidSdzIGNhdmVcbiAgICBbY29yZGVsUGxhaW5zV2VzdCwgMHgzMF0sIC8vIGNvcmRlbCB3ZXN0LCB2YW1waXJlIGNhdmVcbiAgICBbY29yZGVsUGxhaW5zRWFzdCwgMHgzMF0sIC8vIGNvcmRlbCBlYXN0LCB2YW1waXJlIGNhdmVcbiAgICBbd2F0ZXJmYWxsVmFsbGV5Tm9ydGgsIDB4MDBdLCAvLyB3YXRlcmZhbGwgbm9ydGgsIHByaXNvbiBjYXZlXG4gICAgW3dhdGVyZmFsbFZhbGxleU5vcnRoLCAweDE0XSwgLy8gd2F0ZXJmYWxsIG5vcnRoLCBmb2cgbGFtcFxuICAgIFt3YXRlcmZhbGxWYWxsZXlTb3V0aCwgMHg3NF0sIC8vIHdhdGVyZmFsbCBzb3V0aCwga2lyaXNhXG4gICAgW2tpcmlzYU1lYWRvdywgMHgxMF0sIC8vIGtpcmlzYSBtZWFkb3dcbiAgICBbc2FoYXJhT3V0c2lkZUNhdmUsIDB4MDBdLCAvLyBjYXZlIHRvIGRlc2VydFxuICAgIFtkZXNlcnQyLCAweDQxXSxcbiAgXSBhcyBjb25zdDtcbiAgZm9yIChjb25zdCBbbG9jLCB5eF0gb2YgZmxhZ3NUb0NsZWFyKSB7XG4gICAgbG9jLmZsYWdzLnB1c2goRmxhZy5vZih7eXgsIGZsYWc6IDB4MmVmfSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVwbGFjZUZsYWcobG9jOiBMb2NhdGlvbiwgeXg6IG51bWJlciwgZmxhZzogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBmIG9mIGxvYy5mbGFncykge1xuICAgICAgaWYgKGYueXggPT09IHl4KSB7XG4gICAgICAgIGYuZmxhZyA9IGZsYWc7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgZmluZCBmbGFnIHRvIHJlcGxhY2UgYXQgJHtsb2N9OiR7eXh9YCk7XG4gIH07XG5cbiAgaWYgKGZsYWdzLnBhcmFseXNpc1JlcXVpcmVzUHJpc29uS2V5KCkpIHsgLy8gY2xvc2Ugb2ZmIHJldmVyc2UgZW50cmFuY2VzXG4gICAgLy8gTk9URTogd2UgY291bGQgYWxzbyBjbG9zZSBpdCBvZmYgdW50aWwgYm9zcyBraWxsZWQuLi4/XG4gICAgLy8gIC0gY29uc3QgdmFtcGlyZUZsYWcgPSB+cm9tLm5wY1NwYXduc1sweGMwXS5jb25kaXRpb25zWzB4MGFdWzBdO1xuICAgIC8vICAtPiBrZWxiZXNxdWUgZm9yIHRoZSBvdGhlciBvbmUuXG4gICAgY29uc3Qgd2luZG1pbGxGbGFnID0gMHgyZWU7XG4gICAgcmVwbGFjZUZsYWcoY29yZGVsUGxhaW5zV2VzdCwgMHgzMCwgd2luZG1pbGxGbGFnKTtcbiAgICByZXBsYWNlRmxhZyhjb3JkZWxQbGFpbnNFYXN0LCAweDMwLCB3aW5kbWlsbEZsYWcpO1xuXG4gICAgcmVwbGFjZUZsYWcod2F0ZXJmYWxsVmFsbGV5Tm9ydGgsIDB4MDAsIDB4MmQ4KTsgLy8ga2V5IHRvIHByaXNvbiBmbGFnXG4gICAgY29uc3QgZXhwbG9zaW9uID0gU3Bhd24ub2Yoe3k6IDB4MDYwLCB4OiAweDA2MCwgdHlwZTogNCwgaWQ6IDB4MmN9KTtcbiAgICBjb25zdCBrZXlUcmlnZ2VyID0gU3Bhd24ub2Yoe3k6IDB4MDcwLCB4OiAweDA3MCwgdHlwZTogMiwgaWQ6IDB4YWR9KTtcbiAgICB3YXRlcmZhbGxWYWxsZXlOb3J0aC5zcGF3bnMuc3BsaWNlKDEsIDAsIGV4cGxvc2lvbik7XG4gICAgd2F0ZXJmYWxsVmFsbGV5Tm9ydGguc3Bhd25zLnB1c2goa2V5VHJpZ2dlcik7XG4gIH1cblxuICAvLyByb20ubG9jYXRpb25zWzB4MTRdLnRpbGVFZmZlY3RzID0gMHhiMztcblxuICAvLyBkNyBmb3IgMz9cblxuICAvLyBUT0RPIC0gdGhpcyBlbmRlZCB1cCB3aXRoIG1lc3NhZ2UgMDA6MDMgYW5kIGFuIGFjdGlvbiB0aGF0IGdhdmUgYm93IG9mIG1vb24hXG5cbiAgLy8gcm9tLnRyaWdnZXJzWzB4MTldLm1lc3NhZ2UucGFydCA9IDB4MWI7XG4gIC8vIHJvbS50cmlnZ2Vyc1sweDE5XS5tZXNzYWdlLmluZGV4ID0gMHgwODtcbiAgLy8gcm9tLnRyaWdnZXJzWzB4MTldLmZsYWdzLnB1c2goMHgyZjYsIDB4MmY3LCAweDJmOCk7XG59O1xuXG4vLyBAdHMtaWdub3JlOiBub3QgeWV0IHVzZWRcbmNvbnN0IGVhc3RDYXZlID0gKHJvbTogUm9tKSA9PiB7XG4gIC8vIE5PVEU6IDB4OWMgY2FuIGJlY29tZSAweDk5IGluIHRvcCBsZWZ0IG9yIDB4OTcgaW4gdG9wIHJpZ2h0IG9yIGJvdHRvbSBtaWRkbGUgZm9yIGEgY2F2ZSBleGl0XG4gIGNvbnN0IHNjcmVlbnMxID0gW1sweDljLCAweDg0LCAweDgwLCAweDgzLCAweDljXSxcbiAgICAgICAgICAgICAgICAgICAgWzB4ODAsIDB4ODEsIDB4ODMsIDB4ODYsIDB4ODBdLFxuICAgICAgICAgICAgICAgICAgICBbMHg4MywgMHg4OCwgMHg4OSwgMHg4MCwgMHg4MF0sXG4gICAgICAgICAgICAgICAgICAgIFsweDgxLCAweDhjLCAweDg1LCAweDgyLCAweDg0XSxcbiAgICAgICAgICAgICAgICAgICAgWzB4OWEsIDB4ODUsIDB4OWMsIDB4OTgsIDB4ODZdXTtcbiAgY29uc3Qgc2NyZWVuczIgPSBbWzB4OWMsIDB4ODQsIDB4OWIsIDB4ODAsIDB4OWJdLFxuICAgICAgICAgICAgICAgICAgICBbMHg4MCwgMHg4MSwgMHg4MSwgMHg4MCwgMHg4MV0sXG4gICAgICAgICAgICAgICAgICAgIFsweDgwLCAweDg3LCAweDhiLCAweDhhLCAweDg2XSxcbiAgICAgICAgICAgICAgICAgICAgWzB4ODAsIDB4OGMsIDB4ODAsIDB4ODUsIDB4ODRdLFxuICAgICAgICAgICAgICAgICAgICBbMHg5YywgMHg4NiwgMHg4MCwgMHg4MCwgMHg5YV1dO1xuICAvLyBUT0RPIGZpbGwgdXAgZ3JhcGhpY3MsIGV0YyAtLT4gJDFhLCAkMWIsICQwNSAvICQ4OCwgJGI1IC8gJDE0LCAkMDJcbiAgLy8gVGhpbmsgYW9idXQgZXhpdHMgYW5kIGVudHJhbmNlcy4uLj9cbiAgY29uc29sZS5sb2cocm9tLCBzY3JlZW5zMSwgc2NyZWVuczIpO1xufTtcblxuY29uc3QgYWRqdXN0R29hRm9ydHJlc3NUcmlnZ2VycyA9IChyb206IFJvbSkgPT4ge1xuICBjb25zdCBsID0gcm9tLmxvY2F0aW9ucztcbiAgLy8gTW92ZSBLZWxiZXNxdWUgMiBvbmUgdGlsZSBsZWZ0LlxuICBsLmdvYUZvcnRyZXNzS2VsYmVzcXVlLnNwYXduc1swXS54IC09IDg7XG4gIC8vIFJlbW92ZSBzYWdlIHNjcmVlbiBsb2NrcyAoZXhjZXB0IEtlbnN1KS5cbiAgbC5nb2FGb3J0cmVzc1plYnUuc3Bhd25zLnNwbGljZSgxLCAxKTsgLy8gemVidSBzY3JlZW4gbG9jayB0cmlnZ2VyXG4gIGwuZ29hRm9ydHJlc3NUb3JuZWwuc3Bhd25zLnNwbGljZSgyLCAxKTsgLy8gdG9ybmVsIHNjcmVlbiBsb2NrIHRyaWdnZXJcbiAgbC5nb2FGb3J0cmVzc0FzaW5hLnNwYXducy5zcGxpY2UoMiwgMSk7IC8vIGFzaW5hIHNjcmVlbiBsb2NrIHRyaWdnZXJcbn07XG5cbmNvbnN0IGFsYXJtRmx1dGVJc0tleUl0ZW0gPSAocm9tOiBSb20pID0+IHtcbiAgY29uc3Qge3dhdGVyZmFsbENhdmU0fSA9IHJvbS5sb2NhdGlvbnM7XG5cbiAgLy8gUGVyc29uIDE0IChaZWJ1J3Mgc3R1ZGVudCk6IHNlY29uZGFyeSBpdGVtIC0+IGFsYXJtIGZsdXRlXG4gIHJvbS5ucGNzWzB4MTRdLmRhdGFbMV0gPSAweDMxOyAvLyBOT1RFOiBDbG9iYmVycyBzaHVmZmxlZCBpdGVtISEhXG4gIC8vIE1vdmUgYWxhcm0gZmx1dGUgdG8gdGhpcmQgcm93XG4gIHJvbS5pdGVtR2V0c1sweDMxXS5pbnZlbnRvcnlSb3dTdGFydCA9IDB4MjA7XG4gIC8vIEVuc3VyZSBhbGFybSBmbHV0ZSBjYW5ub3QgYmUgZHJvcHBlZFxuICAvLyByb20ucHJnWzB4MjEwMjFdID0gMHg0MzsgLy8gVE9ETyAtIHJvbS5pdGVtc1sweDMxXS4/Pz9cbiAgcm9tLml0ZW1zWzB4MzFdLnVuaXF1ZSA9IHRydWU7XG4gIC8vIEVuc3VyZSBhbGFybSBmbHV0ZSBjYW5ub3QgYmUgc29sZFxuICByb20uaXRlbXNbMHgzMV0uYmFzZVByaWNlID0gMDtcblxuICAvLyBSZW1vdmUgYWxhcm0gZmx1dGUgZnJvbSBzaG9wcyAocmVwbGFjZSB3aXRoIG90aGVyIGl0ZW1zKVxuICAvLyBOT1RFIC0gd2UgY291bGQgc2ltcGxpZnkgdGhpcyB3aG9sZSB0aGluZyBieSBqdXN0IGhhcmRjb2RpbmcgaW5kaWNlcy5cbiAgLy8gICAgICAtIGlmIHRoaXMgaXMgZ3VhcmFudGVlZCB0byBoYXBwZW4gZWFybHksIGl0J3MgYWxsIHRoZSBzYW1lLlxuICBjb25zdCByZXBsYWNlbWVudHMgPSBbXG4gICAgWzB4MjEsIDAuNzJdLCAvLyBmcnVpdCBvZiBwb3dlciwgNzIlIG9mIGNvc3RcbiAgICBbMHgxZiwgMC45XSwgLy8gbHlzaXMgcGxhbnQsIDkwJSBvZiBjb3N0XG4gIF07XG4gIGxldCBqID0gMDtcbiAgZm9yIChjb25zdCBzaG9wIG9mIHJvbS5zaG9wcykge1xuICAgIGlmIChzaG9wLnR5cGUgIT09IFNob3BUeXBlLlRPT0wpIGNvbnRpbnVlO1xuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBzaG9wLmNvbnRlbnRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBpZiAoc2hvcC5jb250ZW50c1tpXSAhPT0gMHgzMSkgY29udGludWU7XG4gICAgICBjb25zdCBbaXRlbSwgcHJpY2VSYXRpb10gPSByZXBsYWNlbWVudHNbKGorKykgJSByZXBsYWNlbWVudHMubGVuZ3RoXTtcbiAgICAgIHNob3AuY29udGVudHNbaV0gPSBpdGVtO1xuICAgICAgaWYgKHJvbS5zaG9wRGF0YVRhYmxlc0FkZHJlc3MpIHtcbiAgICAgICAgLy8gTk9URTogdGhpcyBpcyBicm9rZW4gLSBuZWVkIGEgY29udHJvbGxlZCB3YXkgdG8gY29udmVydCBwcmljZSBmb3JtYXRzXG4gICAgICAgIHNob3AucHJpY2VzW2ldID0gTWF0aC5yb3VuZChzaG9wLnByaWNlc1tpXSAqIHByaWNlUmF0aW8pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIENoYW5nZSBmbHV0ZSBvZiBsaW1lIGNoZXN0J3MgKG5vdy11bnVzZWQpIGl0ZW1nZXQgdG8gaGF2ZSBtZWRpY2FsIGhlcmJcbiAgcm9tLml0ZW1HZXRzWzB4NWJdLml0ZW1JZCA9IDB4MWQ7XG4gIC8vIENoYW5nZSB0aGUgYWN0dWFsIHNwYXduIGZvciB0aGF0IGNoZXN0IHRvIGJlIHRoZSBtaXJyb3JlZCBzaGllbGQgY2hlc3RcbiAgd2F0ZXJmYWxsQ2F2ZTQuc3Bhd24oMHgxOSkuaWQgPSAweDEwO1xuXG4gIC8vIFRPRE8gLSByZXF1aXJlIG5ldyBjb2RlIGZvciB0d28gdXNlc1xufTtcblxuY29uc3QgcmV2ZXJzaWJsZVN3YW5HYXRlID0gKHJvbTogUm9tKSA9PiB7XG4gIC8vIEFsbG93IG9wZW5pbmcgU3dhbiBmcm9tIGVpdGhlciBzaWRlIGJ5IGFkZGluZyBhIHBhaXIgb2YgZ3VhcmRzIG9uIHRoZVxuICAvLyBvcHBvc2l0ZSBzaWRlIG9mIHRoZSBnYXRlLlxuICByb20ubG9jYXRpb25zWzB4NzNdLnNwYXducy5wdXNoKFxuICAgIC8vIE5PVEU6IFNvbGRpZXJzIG11c3QgY29tZSBpbiBwYWlycyAod2l0aCBpbmRleCBeMSBmcm9tIGVhY2ggb3RoZXIpXG4gICAgU3Bhd24ub2Yoe3h0OiAweDBhLCB5dDogMHgwMiwgdHlwZTogMSwgaWQ6IDB4MmR9KSwgLy8gbmV3IHNvbGRpZXJcbiAgICBTcGF3bi5vZih7eHQ6IDB4MGIsIHl0OiAweDAyLCB0eXBlOiAxLCBpZDogMHgyZH0pLCAvLyBuZXcgc29sZGllclxuICAgIFNwYXduLm9mKHt4dDogMHgwZSwgeXQ6IDB4MGEsIHR5cGU6IDIsIGlkOiAweGIzfSksIC8vIG5ldyB0cmlnZ2VyOiBlcmFzZSBndWFyZHNcbiAgKTtcblxuICAvLyBHdWFyZHMgKCQyZCkgYXQgc3dhbiBnYXRlICgkNzMpIH4gc2V0IDEwZCBhZnRlciBvcGVuaW5nIGdhdGUgPT4gY29uZGl0aW9uIGZvciBkZXNwYXduXG4gIHJvbS5ucGNzWzB4MmRdLmxvY2FsRGlhbG9ncy5nZXQoMHg3MykhWzBdLmZsYWdzLnB1c2goMHgxMGQpO1xuXG4gIC8vIERlc3Bhd24gZ3VhcmQgdHJpZ2dlciByZXF1aXJlcyAxMGRcbiAgcm9tLnRyaWdnZXIoMHhiMykuY29uZGl0aW9ucy5wdXNoKDB4MTBkKTtcbn07XG5cbmZ1bmN0aW9uIHByZXZlbnROcGNEZXNwYXducyhyb206IFJvbSwgZmxhZ3M6IEZsYWdTZXQpOiB2b2lkIHtcbiAgZnVuY3Rpb24gcmVtb3ZlPFQ+KGFycjogVFtdLCBlbGVtOiBUKTogdm9pZCB7XG4gICAgY29uc3QgaW5kZXggPSBhcnIuaW5kZXhPZihlbGVtKTtcbiAgICBpZiAoaW5kZXggPCAwKSB0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBmaW5kIGVsZW1lbnQgJHtlbGVtfSBpbiAke2Fycn1gKTtcbiAgICBhcnIuc3BsaWNlKGluZGV4LCAxKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRpYWxvZyhpZDogbnVtYmVyLCBsb2M6IG51bWJlciA9IC0xKTogTG9jYWxEaWFsb2dbXSB7XG4gICAgY29uc3QgcmVzdWx0ID0gcm9tLm5wY3NbaWRdLmxvY2FsRGlhbG9ncy5nZXQobG9jKTtcbiAgICBpZiAoIXJlc3VsdCkgdGhyb3cgbmV3IEVycm9yKGBNaXNzaW5nIGRpYWxvZyAkJHtoZXgoaWQpfSBhdCAkJHtoZXgobG9jKX1gKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIGZ1bmN0aW9uIHNwYXducyhpZDogbnVtYmVyLCBsb2M6IG51bWJlcik6IG51bWJlcltdIHtcbiAgICBjb25zdCByZXN1bHQgPSByb20ubnBjc1tpZF0uc3Bhd25Db25kaXRpb25zLmdldChsb2MpO1xuICAgIGlmICghcmVzdWx0KSB0aHJvdyBuZXcgRXJyb3IoYE1pc3Npbmcgc3Bhd24gY29uZGl0aW9uICQke2hleChpZCl9IGF0ICQke2hleChsb2MpfWApO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBMaW5rIHNvbWUgcmVkdW5kYW50IE5QQ3M6IEtlbnN1ICg3ZSwgNzQpIGFuZCBBa2FoYW5hICg4OCwgMTYpXG4gIHJvbS5ucGNzWzB4NzRdLmxpbmsoMHg3ZSk7XG4gIHJvbS5ucGNzWzB4NzRdLnVzZWQgPSB0cnVlO1xuICByb20ubnBjc1sweDc0XS5kYXRhID0gWy4uLnJvbS5ucGNzWzB4N2VdLmRhdGFdIGFzIGFueTtcbiAgcm9tLmxvY2F0aW9ucy5zd2FuRGFuY2VIYWxsLnNwYXducy5maW5kKHMgPT4gcy5pc05wYygpICYmIHMuaWQgPT09IDB4N2UpIS5pZCA9IDB4NzQ7XG4gIHJvbS5pdGVtc1sweDNiXS50cmFkZUluIVswXSA9IDB4NzQ7XG5cbiAgLy8gZGlhbG9nIGlzIHNoYXJlZCBiZXR3ZWVuIDg4IGFuZCAxNi5cbiAgcm9tLm5wY3NbMHg4OF0ubGlua0RpYWxvZygweDE2KTtcblxuICAvLyBNYWtlIGEgbmV3IE5QQyBmb3IgQWthaGFuYSBpbiBCcnlubWFlcjsgb3RoZXJzIHdvbid0IGFjY2VwdCB0aGUgU3RhdHVlIG9mIE9ueXguXG4gIC8vIExpbmtpbmcgc3Bhd24gY29uZGl0aW9ucyBhbmQgZGlhbG9ncyBpcyBzdWZmaWNpZW50LCBzaW5jZSB0aGUgYWN0dWFsIE5QQyBJRFxuICAvLyAoMTYgb3IgODIpIGlzIHdoYXQgbWF0dGVycyBmb3IgdGhlIHRyYWRlLWluXG4gIHJvbS5ucGNzWzB4ODJdLnVzZWQgPSB0cnVlO1xuICByb20ubnBjc1sweDgyXS5saW5rKDB4MTYpO1xuICByb20ubnBjc1sweDgyXS5kYXRhID0gWy4uLnJvbS5ucGNzWzB4MTZdLmRhdGFdIGFzIGFueTsgLy8gZW5zdXJlIGdpdmUgaXRlbVxuICByb20ubG9jYXRpb25zLmJyeW5tYWVyLnNwYXducy5maW5kKHMgPT4gcy5pc05wYygpICYmIHMuaWQgPT09IDB4MTYpIS5pZCA9IDB4ODI7XG4gIHJvbS5pdGVtc1sweDI1XS50cmFkZUluIVswXSA9IDB4ODI7XG5cbiAgLy8gTGVhZiBlbGRlciBpbiBob3VzZSAoJDBkIEAgJGMwKSB+IHN3b3JkIG9mIHdpbmQgcmVkdW5kYW50IGZsYWdcbiAgLy8gZGlhbG9nKDB4MGQsIDB4YzApWzJdLmZsYWdzID0gW107XG4gIC8vcm9tLml0ZW1HZXRzWzB4MDBdLmZsYWdzID0gW107IC8vIGNsZWFyIHJlZHVuZGFudCBmbGFnXG5cbiAgLy8gTGVhZiByYWJiaXQgKCQxMykgbm9ybWFsbHkgc3RvcHMgc2V0dGluZyBpdHMgZmxhZyBhZnRlciBwcmlzb24gZG9vciBvcGVuZWQsXG4gIC8vIGJ1dCB0aGF0IGRvZXNuJ3QgbmVjZXNzYXJpbHkgb3BlbiBtdCBzYWJyZS4gIEluc3RlYWQgKGEpIHRyaWdnZXIgb24gMDQ3XG4gIC8vIChzZXQgYnkgOGQgdXBvbiBlbnRlcmluZyBlbGRlcidzIGNlbGwpLiAgQWxzbyBtYWtlIHN1cmUgdGhhdCB0aGF0IHBhdGggYWxzb1xuICAvLyBwcm92aWRlcyB0aGUgbmVlZGVkIGZsYWcgdG8gZ2V0IGludG8gbXQgc2FicmUuXG4gIGRpYWxvZygweDEzKVsyXS5jb25kaXRpb24gPSAweDA0NztcbiAgZGlhbG9nKDB4MTMpWzJdLmZsYWdzID0gWzB4MGE5XTtcbiAgZGlhbG9nKDB4MTMpWzNdLmZsYWdzID0gWzB4MGE5XTtcblxuICAvLyBXaW5kbWlsbCBndWFyZCAoJDE0IEAgJDBlKSBzaG91bGRuJ3QgZGVzcGF3biBhZnRlciBhYmR1Y3Rpb24gKDAzOCksXG4gIC8vIGJ1dCBpbnN0ZWFkIGFmdGVyIGdpdmluZyB0aGUgaXRlbSAoMDg4KVxuICBzcGF3bnMoMHgxNCwgMHgwZSlbMV0gPSB+MHgwODg7IC8vIHJlcGxhY2UgZmxhZyB+MDM4ID0+IH4wODhcbiAgLy9kaWFsb2coMHgxNCwgMHgwZSlbMF0uZmxhZ3MgPSBbXTsgLy8gcmVtb3ZlIHJlZHVuZGFudCBmbGFnIH4gd2luZG1pbGwga2V5XG5cbiAgLy8gQWthaGFuYSAoJDE2IC8gODgpIH4gc2hpZWxkIHJpbmcgcmVkdW5kYW50IGZsYWdcbiAgLy9kaWFsb2coMHgxNiwgMHg1NylbMF0uZmxhZ3MgPSBbXTtcbiAgLy8gRG9uJ3QgZGlzYXBwZWFyIGFmdGVyIGdldHRpbmcgYmFycmllciAobm90ZSA4OCdzIHNwYXducyBub3QgbGlua2VkIHRvIDE2KVxuICByZW1vdmUoc3Bhd25zKDB4MTYsIDB4NTcpLCB+MHgwNTEpO1xuICByZW1vdmUoc3Bhd25zKDB4ODgsIDB4NTcpLCB+MHgwNTEpO1xuXG4gIGZ1bmN0aW9uIHJldmVyc2VEaWFsb2coZHM6IExvY2FsRGlhbG9nW10pOiB2b2lkIHtcbiAgICBkcy5yZXZlcnNlKCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgbmV4dCA9IGRzW2kgKyAxXTtcbiAgICAgIGRzW2ldLmNvbmRpdGlvbiA9IG5leHQgPyB+bmV4dC5jb25kaXRpb24gOiB+MDtcbiAgICB9XG4gIH07XG5cbiAgLy8gT2FrIGVsZGVyICgkMWQpIH4gc3dvcmQgb2YgZmlyZSByZWR1bmRhbnQgZmxhZ1xuICBjb25zdCBvYWtFbGRlckRpYWxvZyA9IGRpYWxvZygweDFkKTtcbiAgLy9vYWtFbGRlckRpYWxvZ1s0XS5mbGFncyA9IFtdO1xuICAvLyBNYWtlIHN1cmUgdGhhdCB3ZSB0cnkgdG8gZ2l2ZSB0aGUgaXRlbSBmcm9tICphbGwqIHBvc3QtaW5zZWN0IGRpYWxvZ3NcbiAgb2FrRWxkZXJEaWFsb2dbMF0ubWVzc2FnZS5hY3Rpb24gPSAweDAzO1xuICBvYWtFbGRlckRpYWxvZ1sxXS5tZXNzYWdlLmFjdGlvbiA9IDB4MDM7XG4gIG9ha0VsZGVyRGlhbG9nWzJdLm1lc3NhZ2UuYWN0aW9uID0gMHgwMztcbiAgb2FrRWxkZXJEaWFsb2dbM10ubWVzc2FnZS5hY3Rpb24gPSAweDAzO1xuXG4gIC8vIE9hayBtb3RoZXIgKCQxZSkgfiBpbnNlY3QgZmx1dGUgcmVkdW5kYW50IGZsYWdcbiAgLy8gVE9ETyAtIHJlYXJyYW5nZSB0aGVzZSBmbGFncyBhIGJpdCAobWF5YmUgfjA0NSwgfjBhMCB+MDQxIC0gc28gcmV2ZXJzZSlcbiAgLy8gICAgICAtIHdpbGwgbmVlZCB0byBjaGFuZ2UgYmFsbE9mRmlyZSBhbmQgaW5zZWN0Rmx1dGUgaW4gZGVwZ3JhcGhcbiAgY29uc3Qgb2FrTW90aGVyRGlhbG9nID0gZGlhbG9nKDB4MWUpO1xuICAoKCkgPT4ge1xuICAgIGNvbnN0IFtraWxsZWRJbnNlY3QsIGdvdEl0ZW0sIGdldEl0ZW0sIGZpbmRDaGlsZF0gPSBvYWtNb3RoZXJEaWFsb2c7XG4gICAgZmluZENoaWxkLmNvbmRpdGlvbiA9IH4weDA0NTtcbiAgICAvL2dldEl0ZW0uY29uZGl0aW9uID0gfjB4MjI3O1xuICAgIC8vZ2V0SXRlbS5mbGFncyA9IFtdO1xuICAgIGdvdEl0ZW0uY29uZGl0aW9uID0gfjA7XG4gICAgcm9tLm5wY3NbMHgxZV0ubG9jYWxEaWFsb2dzLnNldCgtMSwgW2ZpbmRDaGlsZCwgZ2V0SXRlbSwga2lsbGVkSW5zZWN0LCBnb3RJdGVtXSk7XG4gIH0pKCk7XG4gIC8vLyBvYWtNb3RoZXJEaWFsb2dbMl0uZmxhZ3MgPSBbXTtcbiAgLy8gLy8gRW5zdXJlIHdlIGFsd2F5cyBnaXZlIGl0ZW0gYWZ0ZXIgaW5zZWN0LlxuICAvLyBvYWtNb3RoZXJEaWFsb2dbMF0ubWVzc2FnZS5hY3Rpb24gPSAweDAzO1xuICAvLyBvYWtNb3RoZXJEaWFsb2dbMV0ubWVzc2FnZS5hY3Rpb24gPSAweDAzO1xuICAvLyByZXZlcnNlRGlhbG9nKG9ha01vdGhlckRpYWxvZyk7XG5cbiAgLy8gUmV2ZXJzZSB0aGUgb3RoZXIgb2FrIGRpYWxvZ3MsIHRvby5cbiAgZm9yIChjb25zdCBpIG9mIFsweDIwLCAweDIxLCAweDIyLCAweDdjLCAweDdkXSkge1xuICAgIHJldmVyc2VEaWFsb2coZGlhbG9nKGkpKTtcbiAgfVxuXG4gIC8vIFN3YXAgdGhlIGZpcnN0IHR3byBvYWsgY2hpbGQgZGlhbG9ncy5cbiAgY29uc3Qgb2FrQ2hpbGREaWFsb2cgPSBkaWFsb2coMHgxZik7XG4gIG9ha0NoaWxkRGlhbG9nLnVuc2hpZnQoLi4ub2FrQ2hpbGREaWFsb2cuc3BsaWNlKDEsIDEpKTtcblxuICAvLyBUaHJvbmUgcm9vbSBiYWNrIGRvb3IgZ3VhcmQgKCQzMyBAICRkZikgc2hvdWxkIGhhdmUgc2FtZSBzcGF3biBjb25kaXRpb24gYXMgcXVlZW5cbiAgLy8gKDAyMCBOT1QgcXVlZW4gbm90IGluIHRocm9uZSByb29tIEFORCAwMWIgTk9UIHZpZXdlZCBtZXNpYSByZWNvcmRpbmcpXG4gIHJvbS5ucGNzWzB4MzNdLnNwYXduQ29uZGl0aW9ucy5zZXQoMHhkZiwgIFt+MHgwMjAsIH4weDAxYl0pO1xuXG4gIC8vIEZyb250IHBhbGFjZSBndWFyZCAoJDM0KSB2YWNhdGlvbiBtZXNzYWdlIGtleXMgb2ZmIDAxYiBpbnN0ZWFkIG9mIDAxZlxuICBkaWFsb2coMHgzNClbMV0uY29uZGl0aW9uID0gMHgwMWI7XG5cbiAgLy8gUXVlZW4ncyAoJDM4KSBkaWFsb2cgbmVlZHMgcXVpdGUgYSBiaXQgb2Ygd29ya1xuICAvLyBHaXZlIGl0ZW0gKGZsdXRlIG9mIGxpbWUpIGV2ZW4gaWYgZ290IHRoZSBzd29yZCBvZiB3YXRlclxuICBkaWFsb2coMHgzOClbM10ubWVzc2FnZS5hY3Rpb24gPSAweDAzOyAvLyBcInlvdSBmb3VuZCBzd29yZFwiID0+IGFjdGlvbiAzXG4gIGRpYWxvZygweDM4KVs0XS5mbGFncy5wdXNoKDB4MDljKTsgICAgIC8vIHNldCAwOWMgcXVlZW4gZ29pbmcgYXdheVxuICAvLyBRdWVlbiBzcGF3biBjb25kaXRpb24gZGVwZW5kcyBvbiAwMWIgKG1lc2lhIHJlY29yZGluZykgbm90IDAxZiAoYmFsbCBvZiB3YXRlcilcbiAgLy8gVGhpcyBlbnN1cmVzIHlvdSBoYXZlIGJvdGggc3dvcmQgYW5kIGJhbGwgdG8gZ2V0IHRvIGhlciAoPz8/KVxuICBzcGF3bnMoMHgzOCwgMHhkZilbMV0gPSB+MHgwMWI7ICAvLyB0aHJvbmUgcm9vbTogMDFiIE5PVCBtZXNpYSByZWNvcmRpbmdcbiAgc3Bhd25zKDB4MzgsIDB4ZTEpWzBdID0gMHgwMWI7ICAgLy8gYmFjayByb29tOiAwMWIgbWVzaWEgcmVjb3JkaW5nXG4gIGRpYWxvZygweDM4KVsxXS5jb25kaXRpb24gPSAweDAxYjsgICAgIC8vIHJldmVhbCBjb25kaXRpb246IDAxYiBtZXNpYSByZWNvcmRpbmdcblxuICAvLyBGb3J0dW5lIHRlbGxlciAoJDM5KSBzaG91bGQgYWxzbyBub3Qgc3Bhd24gYmFzZWQgb24gbWVzaWEgcmVjb3JkaW5nIHJhdGhlciB0aGFuIG9yYlxuICBzcGF3bnMoMHgzOSwgMHhkOClbMV0gPSB+MHgwMWI7ICAvLyBmb3J0dW5lIHRlbGxlciByb29tOiAwMWIgTk9UXG5cbiAgLy8gQ2xhcmsgKCQ0NCkgbW92ZXMgYWZ0ZXIgdGFsa2luZyB0byBoaW0gKDA4ZCkgcmF0aGVyIHRoYW4gY2FsbWluZyBzZWEgKDA4ZikuXG4gIC8vIFRPRE8gLSBjaGFuZ2UgMDhkIHRvIHdoYXRldmVyIGFjdHVhbCBpdGVtIGhlIGdpdmVzLCB0aGVuIHJlbW92ZSBib3RoIGZsYWdzXG4gIHJvbS5ucGNzWzB4NDRdLnNwYXduQ29uZGl0aW9ucy5zZXQoMHhlOSwgW34weDA4ZF0pOyAvLyB6b21iaWUgdG93biBiYXNlbWVudFxuICByb20ubnBjc1sweDQ0XS5zcGF3bkNvbmRpdGlvbnMuc2V0KDB4ZTQsIFsweDA4ZF0pOyAgLy8gam9lbCBzaGVkXG4gIC8vZGlhbG9nKDB4NDQsIDB4ZTkpWzFdLmZsYWdzLnBvcCgpOyAvLyByZW1vdmUgcmVkdW5kYW50IGl0ZW1nZXQgZmxhZ1xuXG4gIC8vIEJyb2thaGFuYSAoJDU0KSB+IHdhcnJpb3IgcmluZyByZWR1bmRhbnQgZmxhZ1xuICAvL2RpYWxvZygweDU0KVsyXS5mbGFncyA9IFtdO1xuXG4gIC8vIERlbyAoJDVhKSB+IHBlbmRhbnQgcmVkdW5kYW50IGZsYWdcbiAgLy9kaWFsb2coMHg1YSlbMV0uZmxhZ3MgPSBbXTtcblxuICAvLyBaZWJ1ICgkNWUpIGNhdmUgZGlhbG9nIChAICQxMClcbiAgLy8gVE9ETyAtIGRpYWxvZ3MoMHg1ZSwgMHgxMCkucmVhcnJhbmdlKH4weDAzYSwgMHgwMGQsIDB4MDM4LCAweDAzOSwgMHgwMGEsIH4weDAwMCk7XG4gIHJvbS5ucGNzWzB4NWVdLmxvY2FsRGlhbG9ncy5zZXQoMHgxMCwgW1xuICAgIExvY2FsRGlhbG9nLm9mKH4weDAzYSwgWzB4MDAsIDB4MWFdLCBbMHgwM2FdKSwgLy8gMDNhIE5PVCB0YWxrZWQgdG8gemVidSBpbiBjYXZlIC0+IFNldCAwM2FcbiAgICBMb2NhbERpYWxvZy5vZiggMHgwMGQsIFsweDAwLCAweDFkXSksIC8vIDAwZCBsZWFmIHZpbGxhZ2VycyByZXNjdWVkXG4gICAgTG9jYWxEaWFsb2cub2YoIDB4MDM4LCBbMHgwMCwgMHgxY10pLCAvLyAwMzggbGVhZiBhdHRhY2tlZFxuICAgIExvY2FsRGlhbG9nLm9mKCAweDAzOSwgWzB4MDAsIDB4MWRdKSwgLy8gMDM5IGxlYXJuZWQgcmVmcmVzaFxuICAgIExvY2FsRGlhbG9nLm9mKCAweDAwYSwgWzB4MDAsIDB4MWIsIDB4MDNdKSwgLy8gMDBhIHdpbmRtaWxsIGtleSB1c2VkIC0+IHRlYWNoIHJlZnJlc2hcbiAgICBMb2NhbERpYWxvZy5vZih+MHgwMDAsIFsweDAwLCAweDFkXSksXG4gIF0pO1xuICAvLyBEb24ndCBkZXNwYXduIG9uIGdldHRpbmcgYmFycmllclxuICByZW1vdmUoc3Bhd25zKDB4NWUsIDB4MTApLCB+MHgwNTEpOyAvLyByZW1vdmUgMDUxIE5PVCBsZWFybmVkIGJhcnJpZXJcblxuICAvLyBUb3JuZWwgKCQ1ZikgaW4gc2FicmUgd2VzdCAoJDIxKSB+IHRlbGVwb3J0IHJlZHVuZGFudCBmbGFnXG4gIC8vZGlhbG9nKDB4NWYsIDB4MjEpWzFdLmZsYWdzID0gW107XG4gIC8vIERvbid0IGRlc3Bhd24gb24gZ2V0dGluZyBiYXJyaWVyXG4gIHJvbS5ucGNzWzB4NWZdLnNwYXduQ29uZGl0aW9ucy5kZWxldGUoMHgyMSk7IC8vIHJlbW92ZSAwNTEgTk9UIGxlYXJuZWQgYmFycmllclxuXG4gIC8vIFN0b20gKCQ2MCk6IGRvbid0IGRlc3Bhd24gb24gZ2V0dGluZyBiYXJyaWVyXG4gIHJvbS5ucGNzWzB4NjBdLnNwYXduQ29uZGl0aW9ucy5kZWxldGUoMHgxZSk7IC8vIHJlbW92ZSAwNTEgTk9UIGxlYXJuZWQgYmFycmllclxuXG4gIC8vIEFzaW5hICgkNjIpIGluIGJhY2sgcm9vbSAoJGUxKSBnaXZlcyBmbHV0ZSBvZiBsaW1lXG4gIGNvbnN0IGFzaW5hID0gcm9tLm5wY3NbMHg2Ml07XG4gIGFzaW5hLmRhdGFbMV0gPSAweDI4O1xuICBkaWFsb2coYXNpbmEuaWQsIDB4ZTEpWzBdLm1lc3NhZ2UuYWN0aW9uID0gMHgxMTtcbiAgZGlhbG9nKGFzaW5hLmlkLCAweGUxKVsyXS5tZXNzYWdlLmFjdGlvbiA9IDB4MTE7XG4gIC8vIFByZXZlbnQgZGVzcGF3biBmcm9tIGJhY2sgcm9vbSBhZnRlciBkZWZlYXRpbmcgc2FiZXJhICh+MDhmKVxuICByZW1vdmUoc3Bhd25zKGFzaW5hLmlkLCAweGUxKSwgfjB4MDhmKTtcblxuICAvLyBLZW5zdSBpbiBjYWJpbiAoJDY4IEAgJDYxKSBuZWVkcyB0byBiZSBhdmFpbGFibGUgZXZlbiBhZnRlciB2aXNpdGluZyBKb2VsLlxuICAvLyBDaGFuZ2UgaGltIHRvIGp1c3QgZGlzYXBwZWFyIGFmdGVyIHNldHRpbmcgdGhlIHJpZGVhYmxlIGRvbHBoaW4gZmxhZyAoMDliKSxcbiAgLy8gYW5kIHRvIG5vdCBldmVuIHNob3cgdXAgYXQgYWxsIHVubGVzcyB0aGUgZm9nIGxhbXAgd2FzIHJldHVybmVkICgwMjEpLlxuICByb20ubnBjc1sweDY4XS5zcGF3bkNvbmRpdGlvbnMuc2V0KDB4NjEsIFt+MHgwOWIsIDB4MDIxXSk7XG4gIGRpYWxvZygweDY4KVswXS5tZXNzYWdlLmFjdGlvbiA9IDB4MDI7IC8vIGRpc2FwcGVhclxuXG4gIC8vIEtlbnN1IGluIGxpZ2h0aG91c2UgKCQ3NC8kN2UgQCAkNjIpIH4gcmVkdW5kYW50IGZsYWdcbiAgLy9kaWFsb2coMHg3NCwgMHg2MilbMF0uZmxhZ3MgPSBbXTtcblxuICAvLyBBenRlY2EgKCQ4MykgaW4gcHlyYW1pZCB+IGJvdyBvZiB0cnV0aCByZWR1bmRhbnQgZmxhZ1xuICAvL2RpYWxvZygweDgzKVswXS5jb25kaXRpb24gPSB+MHgyNDA7ICAvLyAyNDAgTk9UIGJvdyBvZiB0cnV0aFxuICAvL2RpYWxvZygweDgzKVswXS5mbGFncyA9IFtdO1xuXG4gIC8vIFJhZ2UgYmxvY2tzIG9uIHN3b3JkIG9mIHdhdGVyLCBub3QgcmFuZG9tIGl0ZW0gZnJvbSB0aGUgY2hlc3RcbiAgZGlhbG9nKDB4YzMpWzBdLmNvbmRpdGlvbiA9IDB4MjAyO1xuXG4gIC8vIFJlbW92ZSB1c2VsZXNzIHNwYXduIGNvbmRpdGlvbiBmcm9tIE1hZG8gMVxuICByb20ubnBjc1sweGM0XS5zcGF3bkNvbmRpdGlvbnMuZGVsZXRlKDB4ZjIpOyAvLyBhbHdheXMgc3Bhd25cblxuICAvLyBEcmF5Z29uIDIgKCRjYiBAIGxvY2F0aW9uICRhNikgc2hvdWxkIGRlc3Bhd24gYWZ0ZXIgYmVpbmcgZGVmZWF0ZWQuXG4gIHJvbS5ucGNzWzB4Y2JdLnNwYXduQ29uZGl0aW9ucy5zZXQoMHhhNiwgW34weDI4ZF0pOyAvLyBrZXkgb24gYmFjayB3YWxsIGRlc3Ryb3llZFxuXG4gIC8vIEZpeCBaZWJ1IHRvIGdpdmUga2V5IHRvIHN0eHkgZXZlbiBpZiB0aHVuZGVyIHN3b3JkIGlzIGdvdHRlbiAoanVzdCBzd2l0Y2ggdGhlXG4gIC8vIG9yZGVyIG9mIHRoZSBmaXJzdCB0d28pLiAgQWxzbyBkb24ndCBib3RoZXIgc2V0dGluZyAwM2Igc2luY2UgdGhlIG5ldyBJdGVtR2V0XG4gIC8vIGxvZ2ljIG9idmlhdGVzIHRoZSBuZWVkLlxuICBjb25zdCB6ZWJ1U2h5cm9uID0gcm9tLm5wY3NbMHg1ZV0ubG9jYWxEaWFsb2dzLmdldCgweGYyKSE7XG4gIHplYnVTaHlyb24udW5zaGlmdCguLi56ZWJ1U2h5cm9uLnNwbGljZSgxLCAxKSk7XG4gIC8vIHplYnVTaHlyb25bMF0uZmxhZ3MgPSBbXTtcblxuICAvLyBTaHlyb24gbWFzc2FjcmUgKCQ4MCkgcmVxdWlyZXMga2V5IHRvIHN0eHlcbiAgcm9tLnRyaWdnZXIoMHg4MCkuY29uZGl0aW9ucyA9IFtcbiAgICB+MHgwMjcsIC8vIG5vdCB0cmlnZ2VyZWQgbWFzc2FjcmUgeWV0XG4gICAgIDB4MDNiLCAvLyBnb3QgaXRlbSBmcm9tIGtleSB0byBzdHh5IHNsb3RcbiAgICAgMHgyMDMsIC8vIGdvdCBzd29yZCBvZiB0aHVuZGVyXG4gIF07XG5cbiAgLy8gRW50ZXIgc2h5cm9uICgkODEpIHNob3VsZCBzZXQgd2FycCBubyBtYXR0ZXIgd2hhdFxuICByb20udHJpZ2dlcigweDgxKS5jb25kaXRpb25zID0gW107XG5cbiAgaWYgKGZsYWdzLmJhcnJpZXJSZXF1aXJlc0NhbG1TZWEoKSkge1xuICAgIC8vIExlYXJuIGJhcnJpZXIgKCQ4NCkgcmVxdWlyZXMgY2FsbSBzZWFcbiAgICByb20udHJpZ2dlcigweDg0KS5jb25kaXRpb25zLnB1c2goMHgyODMpOyAvLyAyODMgY2FsbWVkIHRoZSBzZWFcbiAgICAvLyBUT0RPIC0gY29uc2lkZXIgbm90IHNldHRpbmcgMDUxIGFuZCBjaGFuZ2luZyB0aGUgY29uZGl0aW9uIHRvIG1hdGNoIHRoZSBpdGVtXG4gIH1cbiAgLy9yb20udHJpZ2dlcigweDg0KS5mbGFncyA9IFtdO1xuXG4gIC8vIEFkZCBhbiBleHRyYSBjb25kaXRpb24gdG8gdGhlIExlYWYgYWJkdWN0aW9uIHRyaWdnZXIgKGJlaGluZCB6ZWJ1KS4gIFRoaXMgZW5zdXJlc1xuICAvLyBhbGwgdGhlIGl0ZW1zIGluIExlYWYgcHJvcGVyIChlbGRlciBhbmQgc3R1ZGVudCkgYXJlIGdvdHRlbiBiZWZvcmUgdGhleSBkaXNhcHBlYXIuXG4gIHJvbS50cmlnZ2VyKDB4OGMpLmNvbmRpdGlvbnMucHVzaCgweDAzYSk7IC8vIDAzYSB0YWxrZWQgdG8gemVidSBpbiBjYXZlXG5cbiAgLy8gUGFyYWx5c2lzIHRyaWdnZXIgKCRiMikgfiByZW1vdmUgcmVkdW5kYW50IGl0ZW1nZXQgZmxhZ1xuICAvL3JvbS50cmlnZ2VyKDB4YjIpLmNvbmRpdGlvbnNbMF0gPSB+MHgyNDI7XG4gIC8vcm9tLnRyaWdnZXIoMHhiMikuZmxhZ3Muc2hpZnQoKTsgLy8gcmVtb3ZlIDAzNyBsZWFybmVkIHBhcmFseXNpc1xuXG4gIC8vIExlYXJuIHJlZnJlc2ggdHJpZ2dlciAoJGI0KSB+IHJlbW92ZSByZWR1bmRhbnQgaXRlbWdldCBmbGFnXG4gIC8vcm9tLnRyaWdnZXIoMHhiNCkuY29uZGl0aW9uc1sxXSA9IH4weDI0MTtcbiAgLy9yb20udHJpZ2dlcigweGI0KS5mbGFncyA9IFtdOyAvLyByZW1vdmUgMDM5IGxlYXJuZWQgcmVmcmVzaFxuXG4gIC8vIFRlbGVwb3J0IGJsb2NrIG9uIG10IHNhYnJlIGlzIGZyb20gc3BlbGwsIG5vdCBzbG90XG4gIHJvbS50cmlnZ2VyKDB4YmEpLmNvbmRpdGlvbnNbMF0gPSB+MHgyNDQ7IC8vIH4wM2YgLT4gfjI0NFxuXG4gIC8vIFBvcnRvYSBwYWxhY2UgZ3VhcmQgbW92ZW1lbnQgdHJpZ2dlciAoJGJiKSBzdG9wcyBvbiAwMWIgKG1lc2lhKSBub3QgMDFmIChvcmIpXG4gIHJvbS50cmlnZ2VyKDB4YmIpLmNvbmRpdGlvbnNbMV0gPSB+MHgwMWI7XG5cbiAgLy8gUmVtb3ZlIHJlZHVuZGFudCB0cmlnZ2VyIDhhIChzbG90IDE2KSBpbiB6b21iaWV0b3duICgkNjUpXG4gIGNvbnN0IHt6b21iaWVUb3dufSA9IHJvbS5sb2NhdGlvbnM7XG4gIHpvbWJpZVRvd24uc3Bhd25zID0gem9tYmllVG93bi5zcGF3bnMuZmlsdGVyKHggPT4gIXguaXNUcmlnZ2VyKCkgfHwgeC5pZCAhPSAweDhhKTtcblxuICAvLyBSZXBsYWNlIGFsbCBkaWFsb2cgY29uZGl0aW9ucyBmcm9tIDAwZSB0byAyNDNcbiAgZm9yIChjb25zdCBucGMgb2Ygcm9tLm5wY3MpIHtcbiAgICBmb3IgKGNvbnN0IGQgb2YgbnBjLmFsbERpYWxvZ3MoKSkge1xuICAgICAgaWYgKGQuY29uZGl0aW9uID09PSAweDAwZSkgZC5jb25kaXRpb24gPSAweDI0MztcbiAgICAgIGlmIChkLmNvbmRpdGlvbiA9PT0gfjB4MDBlKSBkLmNvbmRpdGlvbiA9IH4weDI0MztcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogUmVtb3ZlIHRpbWVyIHNwYXducywgcmVudW1iZXJzIHRoZW0gc28gdGhhdCB0aGV5J3JlIHVuaXF1ZS4gU2hvdWxkIGJlIHJ1blxuICogYmVmb3JlIHBhcnNpbmcgdGhlIFJPTS5cbiAqL1xuZnVuY3Rpb24gZml4TWltaWNzKHJvbTogUm9tKTogdm9pZCB7XG4gIGxldCBtaW1pYyA9IDB4NzA7XG4gIGZvciAoY29uc3QgbG9jIG9mIHJvbS5sb2NhdGlvbnMpIHtcbiAgICBmb3IgKGNvbnN0IHMgb2YgbG9jLnNwYXducykge1xuICAgICAgaWYgKCFzLmlzQ2hlc3QoKSkgY29udGludWU7XG4gICAgICBzLnRpbWVkID0gZmFsc2U7XG4gICAgICBpZiAocy5pZCA+PSAweDcwKSBzLmlkID0gbWltaWMrKztcbiAgICB9XG4gIH1cbn1cblxuY29uc3QgcmVxdWlyZUhlYWxlZERvbHBoaW4gPSAocm9tOiBSb20pID0+IHtcbiAgLy8gTm9ybWFsbHkgdGhlIGZpc2hlcm1hbiAoJDY0KSBzcGF3bnMgaW4gaGlzIGhvdXNlICgkZDYpIGlmIHlvdSBoYXZlXG4gIC8vIHRoZSBzaGVsbCBmbHV0ZSAoMjM2KS4gIEhlcmUgd2UgYWxzbyBhZGQgYSByZXF1aXJlbWVudCBvbiB0aGUgaGVhbGVkXG4gIC8vIGRvbHBoaW4gc2xvdCAoMDI1KSwgd2hpY2ggd2Uga2VlcCBhcm91bmQgc2luY2UgaXQncyBhY3R1YWxseSB1c2VmdWwuXG4gIHJvbS5ucGNzWzB4NjRdLnNwYXduQ29uZGl0aW9ucy5zZXQoMHhkNiwgWzB4MjM2LCAweDAyNV0pO1xuICAvLyBBbHNvIGZpeCBkYXVnaHRlcidzIGRpYWxvZyAoJDdiKS5cbiAgY29uc3QgZGF1Z2h0ZXJEaWFsb2cgPSByb20ubnBjc1sweDdiXS5sb2NhbERpYWxvZ3MuZ2V0KC0xKSE7XG4gIGRhdWdodGVyRGlhbG9nLnVuc2hpZnQoZGF1Z2h0ZXJEaWFsb2dbMF0uY2xvbmUoKSk7XG4gIGRhdWdodGVyRGlhbG9nWzBdLmNvbmRpdGlvbiA9IH4weDAyNTtcbiAgZGF1Z2h0ZXJEaWFsb2dbMV0uY29uZGl0aW9uID0gfjB4MjM2O1xufTtcblxuY29uc3QgcmVxdWlyZVRlbGVwYXRoeUZvckRlbyA9IChyb206IFJvbSkgPT4ge1xuICAvLyBOb3QgaGF2aW5nIHRlbGVwYXRoeSAoMjQzKSB3aWxsIHRyaWdnZXIgYSBcImt5dSBreXVcIiAoMWE6MTIsIDFhOjEzKSBmb3JcbiAgLy8gYm90aCBnZW5lcmljIGJ1bm5pZXMgKDU5KSBhbmQgZGVvICg1YSkuXG4gIHJvbS5ucGNzWzB4NTldLmdsb2JhbERpYWxvZ3MucHVzaChHbG9iYWxEaWFsb2cub2YofjB4MjQzLCBbMHgxYSwgMHgxMl0pKTtcbiAgcm9tLm5wY3NbMHg1YV0uZ2xvYmFsRGlhbG9ncy5wdXNoKEdsb2JhbERpYWxvZy5vZih+MHgyNDMsIFsweDFhLCAweDEzXSkpO1xufTtcblxuY29uc3QgdGVsZXBvcnRPblRodW5kZXJTd29yZCA9IChyb206IFJvbSkgPT4ge1xuICAvLyBpdGVtZ2V0IDAzIHN3b3JkIG9mIHRodW5kZXIgPT4gc2V0IDJmZCBzaHlyb24gd2FycCBwb2ludFxuICByb20uaXRlbUdldHNbMHgwM10uZmxhZ3MucHVzaCgweDJmZCk7XG4gIC8vIGRpYWxvZyA2MiBhc2luYSBpbiBmMi9mNCBzaHlyb24gLT4gYWN0aW9uIDFmICh0ZWxlcG9ydCB0byBzdGFydClcbiAgLy8gICAtIG5vdGU6IGYyIGFuZCBmNCBkaWFsb2dzIGFyZSBsaW5rZWQuXG4gIGZvciAoY29uc3QgaSBvZiBbMCwgMSwgM10pIHtcbiAgICBmb3IgKGNvbnN0IGxvYyBvZiBbMHhmMiwgMHhmNF0pIHtcbiAgICAgIHJvbS5ucGNzWzB4NjJdLmxvY2FsRGlhbG9ncy5nZXQobG9jKSFbaV0ubWVzc2FnZS5hY3Rpb24gPSAweDFmO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3Qgbm9UZWxlcG9ydE9uVGh1bmRlclN3b3JkID0gKHJvbTogUm9tKSA9PiB7XG4gIC8vIENoYW5nZSBzd29yZCBvZiB0aHVuZGVyJ3MgYWN0aW9uIHRvIGJiZSB0aGUgc2FtZSBhcyBvdGhlciBzd29yZHMgKDE2KVxuICByb20uaXRlbUdldHNbMHgwM10uYWNxdWlzaXRpb25BY3Rpb24uYWN0aW9uID0gMHgxNjtcbn07XG5cbmNvbnN0IGFkanVzdEl0ZW1OYW1lcyA9IChyb206IFJvbSwgZmxhZ3M6IEZsYWdTZXQpID0+IHtcbiAgaWYgKGZsYWdzLmxlYXRoZXJCb290c0dpdmVTcGVlZCgpKSB7XG4gICAgLy8gcmVuYW1lIGxlYXRoZXIgYm9vdHMgdG8gc3BlZWQgYm9vdHNcbiAgICBjb25zdCBsZWF0aGVyQm9vdHMgPSByb20uaXRlbXNbMHgyZl0hO1xuICAgIGxlYXRoZXJCb290cy5tZW51TmFtZSA9ICdTcGVlZCBCb290cyc7XG4gICAgbGVhdGhlckJvb3RzLm1lc3NhZ2VOYW1lID0gJ1NwZWVkIEJvb3RzJztcbiAgfVxuXG4gIC8vIHJlbmFtZSBiYWxscyB0byBvcmJzXG4gIGZvciAobGV0IGkgPSAweDA1OyBpIDwgMHgwYzsgaSArPSAyKSB7XG4gICAgcm9tLml0ZW1zW2ldLm1lbnVOYW1lID0gcm9tLml0ZW1zW2ldLm1lbnVOYW1lLnJlcGxhY2UoJ0JhbGwnLCAnT3JiJyk7XG4gICAgcm9tLml0ZW1zW2ldLm1lc3NhZ2VOYW1lID0gcm9tLml0ZW1zW2ldLm1lc3NhZ2VOYW1lLnJlcGxhY2UoJ0JhbGwnLCAnT3JiJyk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHNpbXBsaWZ5SW52aXNpYmxlQ2hlc3RzKHJvbTogUm9tKTogdm9pZCB7XG4gIGZvciAoY29uc3QgbG9jYXRpb24gb2YgW3JvbS5sb2NhdGlvbnMuY29yZGVsUGxhaW5zRWFzdCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcm9tLmxvY2F0aW9ucy51bmRlcmdyb3VuZENoYW5uZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHJvbS5sb2NhdGlvbnMua2lyaXNhTWVhZG93XSkge1xuICAgIGZvciAoY29uc3Qgc3Bhd24gb2YgbG9jYXRpb24uc3Bhd25zKSB7XG4gICAgICAvLyBzZXQgdGhlIG5ldyBcImludmlzaWJsZVwiIGZsYWcgb24gdGhlIGNoZXN0LlxuICAgICAgaWYgKHNwYXduLmlzQ2hlc3QoKSkgc3Bhd24uZGF0YVsyXSB8PSAweDIwO1xuICAgIH1cbiAgfVxufVxuXG4vLyBBZGQgdGhlIHN0YXR1ZSBvZiBvbnl4IGFuZCBwb3NzaWJseSB0aGUgdGVsZXBvcnQgYmxvY2sgdHJpZ2dlciB0byBDb3JkZWwgV2VzdFxuY29uc3QgYWRkQ29yZGVsV2VzdFRyaWdnZXJzID0gKHJvbTogUm9tLCBmbGFnczogRmxhZ1NldCkgPT4ge1xuICBjb25zdCB7Y29yZGVsUGxhaW5zRWFzdCwgY29yZGVsUGxhaW5zV2VzdH0gPSByb20ubG9jYXRpb25zO1xuICBmb3IgKGNvbnN0IHNwYXduIG9mIGNvcmRlbFBsYWluc0Vhc3Quc3Bhd25zKSB7XG4gICAgaWYgKHNwYXduLmlzQ2hlc3QoKSB8fCAoZmxhZ3MuZGlzYWJsZVRlbGVwb3J0U2tpcCgpICYmIHNwYXduLmlzVHJpZ2dlcigpKSkge1xuICAgICAgLy8gQ29weSBpZiAoMSkgaXQncyB0aGUgY2hlc3QsIG9yICgyKSB3ZSdyZSBkaXNhYmxpbmcgdGVsZXBvcnQgc2tpcFxuICAgICAgY29yZGVsUGxhaW5zV2VzdC5zcGF3bnMucHVzaChzcGF3bi5jbG9uZSgpKTtcbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IGZpeFJhYmJpdFNraXAgPSAocm9tOiBSb20pID0+IHtcbiAgZm9yIChjb25zdCBzcGF3biBvZiByb20ubG9jYXRpb25zLm10U2FicmVOb3J0aE1haW4uc3Bhd25zKSB7XG4gICAgaWYgKHNwYXduLmlzVHJpZ2dlcigpICYmIHNwYXduLmlkID09PSAweDg2KSB7XG4gICAgICBpZiAoc3Bhd24ueCA9PT0gMHg3NDApIHtcbiAgICAgICAgc3Bhd24ueCArPSAxNjtcbiAgICAgICAgc3Bhd24ueSArPSAxNjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHN0b3J5TW9kZSA9IChyb206IFJvbSkgPT4ge1xuICAvLyBzaHVmZmxlIGhhcyBhbHJlYWR5IGhhcHBlbmVkLCBuZWVkIHRvIHVzZSBzaHVmZmxlZCBmbGFncyBmcm9tXG4gIC8vIE5QQyBzcGF3biBjb25kaXRpb25zLi4uXG4gIHJvbS5ucGNzWzB4Y2JdLnNwYXduQ29uZGl0aW9ucy5zZXQoMHhhNiwgW1xuICAgIC8vIE5vdGU6IGlmIGJvc3NlcyBhcmUgc2h1ZmZsZWQgd2UnbGwgbmVlZCB0byBkZXRlY3QgdGhpcy4uLlxuICAgIH5yb20ubnBjc1sweGMyXS5zcGF3bkNvbmRpdGlvbnMuZ2V0KDB4MjgpIVswXSwgLy8gS2VsYmVzcXVlIDFcbiAgICB+cm9tLm5wY3NbMHg4NF0uc3Bhd25Db25kaXRpb25zLmdldCgweDZlKSFbMF0sIC8vIFNhYmVyYSAxXG4gICAgfnJvbS50cmlnZ2VyKDB4OWEpLmNvbmRpdGlvbnNbMV0sIC8vIE1hZG8gMVxuICAgIH5yb20ubnBjc1sweGM1XS5zcGF3bkNvbmRpdGlvbnMuZ2V0KDB4YTkpIVswXSwgLy8gS2VsYmVzcXVlIDJcbiAgICB+cm9tLm5wY3NbMHhjNl0uc3Bhd25Db25kaXRpb25zLmdldCgweGFjKSFbMF0sIC8vIFNhYmVyYSAyXG4gICAgfnJvbS5ucGNzWzB4YzddLnNwYXduQ29uZGl0aW9ucy5nZXQoMHhiOSkhWzBdLCAvLyBNYWRvIDJcbiAgICB+cm9tLm5wY3NbMHhjOF0uc3Bhd25Db25kaXRpb25zLmdldCgweGI2KSFbMF0sIC8vIEthcm1pbmVcbiAgICB+cm9tLm5wY3NbMHhjYl0uc3Bhd25Db25kaXRpb25zLmdldCgweDlmKSFbMF0sIC8vIERyYXlnb24gMVxuICAgIDB4MjAwLCAvLyBTd29yZCBvZiBXaW5kXG4gICAgMHgyMDEsIC8vIFN3b3JkIG9mIEZpcmVcbiAgICAweDIwMiwgLy8gU3dvcmQgb2YgV2F0ZXJcbiAgICAweDIwMywgLy8gU3dvcmQgb2YgVGh1bmRlclxuICAgIC8vIFRPRE8gLSBzdGF0dWVzIG9mIG1vb24gYW5kIHN1biBtYXkgYmUgcmVsZXZhbnQgaWYgZW50cmFuY2Ugc2h1ZmZsZT9cbiAgICAvLyBUT0RPIC0gdmFtcGlyZXMgYW5kIGluc2VjdD9cbiAgXSk7XG59O1xuXG4vLyBIYXJkIG1vZGUgZmxhZzogSGMgLSB6ZXJvIG91dCB0aGUgc3dvcmQncyBjb2xsaXNpb24gcGxhbmVcbmNvbnN0IGRpc2FibGVTdGFicyA9IChyb206IFJvbSkgPT4ge1xuICBmb3IgKGNvbnN0IG8gb2YgWzB4MDgsIDB4MDksIDB4MjddKSB7XG4gICAgcm9tLm9iamVjdHNbb10uY29sbGlzaW9uUGxhbmUgPSAwO1xuICB9XG59O1xuXG5jb25zdCBvcmJzT3B0aW9uYWwgPSAocm9tOiBSb20pID0+IHtcbiAgZm9yIChjb25zdCBvYmogb2YgWzB4MTAsIDB4MTQsIDB4MTgsIDB4MWRdKSB7XG4gICAgLy8gMS4gTG9vc2VuIHRlcnJhaW4gc3VzY2VwdGliaWxpdHkgb2YgbGV2ZWwgMSBzaG90c1xuICAgIHJvbS5vYmplY3RzW29ial0udGVycmFpblN1c2NlcHRpYmlsaXR5ICY9IH4weDA0O1xuICAgIC8vIDIuIEluY3JlYXNlIHRoZSBsZXZlbCB0byAyXG4gICAgcm9tLm9iamVjdHNbb2JqXS5sZXZlbCA9IDI7XG4gIH1cbn07XG5cbi8vIFByb2dyYW1tYXRpY2FsbHkgYWRkIGEgaG9sZSBiZXR3ZWVuIHZhbGxleSBvZiB3aW5kIGFuZCBsaW1lIHRyZWUgdmFsbGV5XG5jb25zdCBjb25uZWN0TGltZVRyZWVUb0xlYWYgPSAocm9tOiBSb20pID0+IHtcbiAgY29uc3Qge3ZhbGxleU9mV2luZCwgbGltZVRyZWVWYWxsZXl9ID0gcm9tLmxvY2F0aW9ucztcblxuICB2YWxsZXlPZldpbmQuc2NyZWVuc1s1XVs0XSA9IDB4MTA7IC8vIG5ldyBleGl0XG4gIGxpbWVUcmVlVmFsbGV5LnNjcmVlbnNbMV1bMF0gPSAweDFhOyAvLyBuZXcgZXhpdFxuICBsaW1lVHJlZVZhbGxleS5zY3JlZW5zWzJdWzBdID0gMHgwYzsgLy8gbmljZXIgbW91bnRhaW5zXG5cbiAgY29uc3Qgd2luZEVudHJhbmNlID1cbiAgICAgIHZhbGxleU9mV2luZC5lbnRyYW5jZXMucHVzaChFbnRyYW5jZS5vZih7eDogMHg0ZWYsIHk6IDB4NTc4fSkpIC0gMTtcbiAgY29uc3QgbGltZUVudHJhbmNlID1cbiAgICAgIGxpbWVUcmVlVmFsbGV5LmVudHJhbmNlcy5wdXNoKEVudHJhbmNlLm9mKHt4OiAweDAxMCwgeTogMHgxYzB9KSkgLSAxO1xuXG4gIHZhbGxleU9mV2luZC5leGl0cy5wdXNoKFxuICAgICAgRXhpdC5vZih7eDogMHg0ZjAsIHk6IDB4NTYwLCBkZXN0OiAweDQyLCBlbnRyYW5jZTogbGltZUVudHJhbmNlfSksXG4gICAgICBFeGl0Lm9mKHt4OiAweDRmMCwgeTogMHg1NzAsIGRlc3Q6IDB4NDIsIGVudHJhbmNlOiBsaW1lRW50cmFuY2V9KSk7XG4gIGxpbWVUcmVlVmFsbGV5LmV4aXRzLnB1c2goXG4gICAgICBFeGl0Lm9mKHt4OiAweDAwMCwgeTogMHgxYjAsIGRlc3Q6IDB4MDMsIGVudHJhbmNlOiB3aW5kRW50cmFuY2V9KSxcbiAgICAgIEV4aXQub2Yoe3g6IDB4MDAwLCB5OiAweDFjMCwgZGVzdDogMHgwMywgZW50cmFuY2U6IHdpbmRFbnRyYW5jZX0pKTtcbn07XG5cbi8vIFN0YW1wIHRoZSBST01cbmV4cG9ydCBmdW5jdGlvbiBzdGFtcFZlcnNpb25TZWVkQW5kSGFzaChyb206IFVpbnQ4QXJyYXksIHNlZWQ6IG51bWJlciwgZmxhZ3M6IEZsYWdTZXQpOiBudW1iZXIge1xuICAvLyBVc2UgdXAgdG8gMjYgYnl0ZXMgc3RhcnRpbmcgYXQgUFJHICQyNWVhOFxuICAvLyBXb3VsZCBiZSBuaWNlIHRvIHN0b3JlICgxKSBjb21taXQsICgyKSBmbGFncywgKDMpIHNlZWQsICg0KSBoYXNoXG4gIC8vIFdlIGNhbiB1c2UgYmFzZTY0IGVuY29kaW5nIHRvIGhlbHAgc29tZS4uLlxuICAvLyBGb3Igbm93IGp1c3Qgc3RpY2sgaW4gdGhlIGNvbW1pdCBhbmQgc2VlZCBpbiBzaW1wbGUgaGV4XG4gIGNvbnN0IGNyYyA9IGNyYzMyKHJvbSk7XG4gIGNvbnN0IGNyY1N0cmluZyA9IGNyYy50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKS50b1VwcGVyQ2FzZSgpO1xuICBjb25zdCBoYXNoID0gdmVyc2lvbi5TVEFUVVMgPT09ICd1bnN0YWJsZScgP1xuICAgICAgdmVyc2lvbi5IQVNILnN1YnN0cmluZygwLCA3KS5wYWRTdGFydCg3LCAnMCcpLnRvVXBwZXJDYXNlKCkgKyAnICAgICAnIDpcbiAgICAgIHZlcnNpb24uVkVSU0lPTi5zdWJzdHJpbmcoMCwgMTIpLnBhZEVuZCgxMiwgJyAnKTtcbiAgY29uc3Qgc2VlZFN0ciA9IHNlZWQudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsICcwJykudG9VcHBlckNhc2UoKTtcbiAgY29uc3QgZW1iZWQgPSAoYWRkcjogbnVtYmVyLCB0ZXh0OiBzdHJpbmcpID0+IHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICAgIHJvbVthZGRyICsgMHgxMCArIGldID0gdGV4dC5jaGFyQ29kZUF0KGkpO1xuICAgIH1cbiAgfTtcbiAgY29uc3QgaW50ZXJjYWxhdGUgPSAoczE6IHN0cmluZywgczI6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgY29uc3Qgb3V0ID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzMS5sZW5ndGggfHwgaSA8IHMyLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvdXQucHVzaChzMVtpXSB8fCAnICcpO1xuICAgICAgb3V0LnB1c2goczJbaV0gfHwgJyAnKTtcbiAgICB9XG4gICAgcmV0dXJuIG91dC5qb2luKCcnKTtcbiAgfTtcblxuICBlbWJlZCgweDI3N2NmLCBpbnRlcmNhbGF0ZSgnICBWRVJTSU9OICAgICBTRUVEICAgICAgJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYCAgJHtoYXNofSR7c2VlZFN0cn1gKSk7XG4gIGxldCBmbGFnU3RyaW5nID0gU3RyaW5nKGZsYWdzKTtcblxuICAvLyBpZiAoZmxhZ1N0cmluZy5sZW5ndGggPiAzNikgZmxhZ1N0cmluZyA9IGZsYWdTdHJpbmcucmVwbGFjZSgvIC9nLCAnJyk7XG4gIGxldCBleHRyYUZsYWdzO1xuICBpZiAoZmxhZ1N0cmluZy5sZW5ndGggPiA0Nikge1xuICAgIGlmIChmbGFnU3RyaW5nLmxlbmd0aCA+IDkyKSB0aHJvdyBuZXcgRXJyb3IoJ0ZsYWcgc3RyaW5nIHdheSB0b28gbG9uZyEnKTtcbiAgICBleHRyYUZsYWdzID0gZmxhZ1N0cmluZy5zdWJzdHJpbmcoNDYsIDkyKS5wYWRFbmQoNDYsICcgJyk7XG4gICAgZmxhZ1N0cmluZyA9IGZsYWdTdHJpbmcuc3Vic3RyaW5nKDAsIDQ2KTtcbiAgfVxuICAvLyBpZiAoZmxhZ1N0cmluZy5sZW5ndGggPD0gMzYpIHtcbiAgLy8gICAvLyBhdHRlbXB0IHRvIGJyZWFrIGl0IG1vcmUgZmF2b3JhYmx5XG5cbiAgLy8gfVxuICAvLyAgIGZsYWdTdHJpbmcgPSBbJ0ZMQUdTICcsXG4gIC8vICAgICAgICAgICAgICAgICBmbGFnU3RyaW5nLnN1YnN0cmluZygwLCAxOCkucGFkRW5kKDE4LCAnICcpLFxuICAvLyAgICAgICAgICAgICAgICAgJyAgICAgICcsXG5cbiAgLy8gfVxuXG4gIGZsYWdTdHJpbmcgPSBmbGFnU3RyaW5nLnBhZEVuZCg0NiwgJyAnKTtcblxuICBlbWJlZCgweDI3N2ZmLCBpbnRlcmNhbGF0ZShmbGFnU3RyaW5nLnN1YnN0cmluZygwLCAyMyksIGZsYWdTdHJpbmcuc3Vic3RyaW5nKDIzKSkpO1xuICBpZiAoZXh0cmFGbGFncykge1xuICAgIGVtYmVkKDB4Mjc4MmYsIGludGVyY2FsYXRlKGV4dHJhRmxhZ3Muc3Vic3RyaW5nKDAsIDIzKSwgZXh0cmFGbGFncy5zdWJzdHJpbmcoMjMpKSk7XG4gIH1cblxuICBlbWJlZCgweDI3ODg1LCBpbnRlcmNhbGF0ZShjcmNTdHJpbmcuc3Vic3RyaW5nKDAsIDQpLCBjcmNTdHJpbmcuc3Vic3RyaW5nKDQpKSk7XG5cbiAgLy8gZW1iZWQoMHgyNWVhOCwgYHYuJHtoYXNofSAgICR7c2VlZH1gKTtcbiAgZW1iZWQoMHgyNTcxNiwgJ1JBTkRPTUlaRVInKTtcbiAgaWYgKHZlcnNpb24uU1RBVFVTID09PSAndW5zdGFibGUnKSBlbWJlZCgweDI1NzNjLCAnQkVUQScpO1xuICAvLyBOT1RFOiBpdCB3b3VsZCBiZSBwb3NzaWJsZSB0byBhZGQgdGhlIGhhc2gvc2VlZC9ldGMgdG8gdGhlIHRpdGxlXG4gIC8vIHBhZ2UgYXMgd2VsbCwgYnV0IHdlJ2QgbmVlZCB0byByZXBsYWNlIHRoZSB1bnVzZWQgbGV0dGVycyBpbiBiYW5rXG4gIC8vICQxZCB3aXRoIHRoZSBtaXNzaW5nIG51bWJlcnMgKEosIFEsIFcsIFgpLCBhcyB3ZWxsIGFzIHRoZSB0d29cbiAgLy8gd2VpcmQgc3F1YXJlcyBhdCAkNWIgYW5kICQ1YyB0aGF0IGRvbid0IGFwcGVhciB0byBiZSB1c2VkLiAgVG9nZXRoZXJcbiAgLy8gd2l0aCB1c2luZyB0aGUgbGV0dGVyICdPJyBhcyAwLCB0aGF0J3Mgc3VmZmljaWVudCB0byBjcmFtIGluIGFsbCB0aGVcbiAgLy8gbnVtYmVycyBhbmQgZGlzcGxheSBhcmJpdHJhcnkgaGV4IGRpZ2l0cy5cblxuICByZXR1cm4gY3JjO1xufTtcblxuY29uc3QgcGF0Y2hCeXRlcyA9IChyb206IFVpbnQ4QXJyYXksIGFkZHJlc3M6IG51bWJlciwgYnl0ZXM6IG51bWJlcltdKSA9PiB7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICByb21bYWRkcmVzcyArIGldID0gYnl0ZXNbaV07XG4gIH1cbn07XG5cbmNvbnN0IHBhdGNoV29yZHMgPSAocm9tOiBVaW50OEFycmF5LCBhZGRyZXNzOiBudW1iZXIsIHdvcmRzOiBudW1iZXJbXSkgPT4ge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDIgKiB3b3Jkcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJvbVthZGRyZXNzICsgaV0gPSB3b3Jkc1tpID4+PiAxXSAmIDB4ZmY7XG4gICAgcm9tW2FkZHJlc3MgKyBpICsgMV0gPSB3b3Jkc1tpID4+PiAxXSA+Pj4gODtcbiAgfVxufTtcblxuLy8gZ29lcyB3aXRoIGVuZW15IHN0YXQgcmVjb21wdXRhdGlvbnMgaW4gcG9zdHNodWZmbGUuc1xuY29uc3QgdXBkYXRlQ29pbkRyb3BzID0gKHJvbTogVWludDhBcnJheSwgZmxhZ3M6IEZsYWdTZXQpID0+IHtcbiAgcm9tID0gcm9tLnN1YmFycmF5KDB4MTApO1xuICBpZiAoZmxhZ3MuZGlzYWJsZVNob3BHbGl0Y2goKSkge1xuICAgIC8vIGJpZ2dlciBnb2xkIGRyb3BzIGlmIG5vIHNob3AgZ2xpdGNoLCBwYXJ0aWN1bGFybHkgYXQgdGhlIHN0YXJ0XG4gICAgLy8gLSBzdGFydHMgb3V0IGZpYm9uYWNjaSwgdGhlbiBnb2VzIGxpbmVhciBhdCA2MDBcbiAgICBwYXRjaFdvcmRzKHJvbSwgMHgzNGJkZSwgW1xuICAgICAgICAwLCAgIDUsICAxMCwgIDE1LCAgMjUsICA0MCwgIDY1LCAgMTA1LFxuICAgICAgMTcwLCAyNzUsIDQ0NSwgNjAwLCA3MDAsIDgwMCwgOTAwLCAxMDAwLFxuICAgIF0pO1xuICB9IGVsc2Uge1xuICAgIC8vIHRoaXMgdGFibGUgaXMgYmFzaWNhbGx5IG1lYW5pbmdsZXNzIGIvYyBzaG9wIGdsaXRjaFxuICAgIHBhdGNoV29yZHMocm9tLCAweDM0YmRlLCBbXG4gICAgICAgIDAsICAgMSwgICAyLCAgIDQsICAgOCwgIDE2LCAgMzAsICA1MCxcbiAgICAgIDEwMCwgMjAwLCAzMDAsIDQwMCwgNTAwLCA2MDAsIDcwMCwgODAwLFxuICAgIF0pO1xuICB9XG59O1xuXG4vLyBnb2VzIHdpdGggZW5lbXkgc3RhdCByZWNvbXB1dGF0aW9ucyBpbiBwb3N0c2h1ZmZsZS5zXG5jb25zdCB1cGRhdGVEaWZmaWN1bHR5U2NhbGluZ1RhYmxlcyA9IChyb206IFVpbnQ4QXJyYXksIGZsYWdzOiBGbGFnU2V0LCBhc206IEFzc2VtYmxlcikgPT4ge1xuICByb20gPSByb20uc3ViYXJyYXkoMHgxMCk7XG5cbiAgLy8gQ3VycmVudGx5IHRoaXMgaXMgdGhyZWUgJDMwLWJ5dGUgdGFibGVzLCB3aGljaCB3ZSBzdGFydCBhdCB0aGUgYmVnaW5uaW5nXG4gIC8vIG9mIHRoZSBwb3N0c2h1ZmZsZSBDb21wdXRlRW5lbXlTdGF0cy5cbiAgY29uc3QgZGlmZiA9IHNlcSg0OCwgeCA9PiB4KTtcblxuICAvLyBQQXRrID0gNSArIERpZmYgKiAxNS8zMlxuICAvLyBEaWZmQXRrIHRhYmxlIGlzIDggKiBQQXRrID0gcm91bmQoNDAgKyAoRGlmZiAqIDE1IC8gNCkpXG4gIHBhdGNoQnl0ZXMocm9tLCBhc20uZXhwYW5kKCdEaWZmQXRrJyksXG4gICAgICAgICAgICAgZGlmZi5tYXAoZCA9PiBNYXRoLnJvdW5kKDQwICsgZCAqIDE1IC8gNCkpKTtcblxuICAvLyBOT1RFOiBPbGQgRGlmZkRlZiB0YWJsZSAoNCAqIFBEZWYpIHdhcyAxMiArIERpZmYgKiAzLCBidXQgd2Ugbm8gbG9uZ2VyXG4gIC8vIHVzZSB0aGlzIHRhYmxlIHNpbmNlIG5lcmZpbmcgYXJtb3JzLlxuICAvLyAoUERlZiA9IDMgKyBEaWZmICogMy80KVxuICAvLyBwYXRjaEJ5dGVzKHJvbSwgYXNtLmV4cGFuZCgnRGlmZkRlZicpLFxuICAvLyAgICAgICAgICAgIGRpZmYubWFwKGQgPT4gMTIgKyBkICogMykpO1xuXG4gIC8vIE5PVEU6IFRoaXMgaXMgdGhlIGFybW9yLW5lcmZlZCBEaWZmRGVmIHRhYmxlLlxuICAvLyBQRGVmID0gMiArIERpZmYgLyAyXG4gIC8vIERpZmZEZWYgdGFibGUgaXMgNCAqIFBEZWYgPSA4ICsgRGlmZiAqIDJcbiAgLy8gcGF0Y2hCeXRlcyhyb20sIGFzbS5leHBhbmQoJ0RpZmZEZWYnKSxcbiAgLy8gICAgICAgICAgICBkaWZmLm1hcChkID0+IDggKyBkICogMikpO1xuXG4gIC8vIE5PVEU6IEZvciBhcm1vciBjYXAgYXQgMyAqIEx2bCwgc2V0IFBEZWYgPSBEaWZmXG4gIHBhdGNoQnl0ZXMocm9tLCBhc20uZXhwYW5kKCdEaWZmRGVmJyksXG4gICAgICAgICAgICAgZGlmZi5tYXAoZCA9PiBkICogNCkpO1xuXG4gIC8vIERpZmZIUCB0YWJsZSBpcyBQSFAgPSBtaW4oMjU1LCA0OCArIHJvdW5kKERpZmYgKiAxMSAvIDIpKVxuICBjb25zdCBwaHBTdGFydCA9IGZsYWdzLmRlY3JlYXNlRW5lbXlEYW1hZ2UoKSA/IDE2IDogNDg7XG4gIGNvbnN0IHBocEluY3IgPSBmbGFncy5kZWNyZWFzZUVuZW15RGFtYWdlKCkgPyA2IDogNS41O1xuICBwYXRjaEJ5dGVzKHJvbSwgYXNtLmV4cGFuZCgnRGlmZkhQJyksXG4gICAgICAgICAgICAgZGlmZi5tYXAoZCA9PiBNYXRoLm1pbigyNTUsIHBocFN0YXJ0ICsgTWF0aC5yb3VuZChkICogcGhwSW5jcikpKSk7XG5cbiAgLy8gRGlmZkV4cCB0YWJsZSBpcyBFeHBCID0gY29tcHJlc3MoZmxvb3IoNCAqICgyICoqICgoMTYgKyA5ICogRGlmZikgLyAzMikpKSlcbiAgLy8gd2hlcmUgY29tcHJlc3MgbWFwcyB2YWx1ZXMgPiAxMjcgdG8gJDgwfCh4Pj40KVxuXG4gIGNvbnN0IGV4cEZhY3RvciA9IGZsYWdzLmV4cFNjYWxpbmdGYWN0b3IoKTtcbiAgcGF0Y2hCeXRlcyhyb20sIGFzbS5leHBhbmQoJ0RpZmZFeHAnKSwgZGlmZi5tYXAoZCA9PiB7XG4gICAgY29uc3QgZXhwID0gTWF0aC5mbG9vcig0ICogKDIgKiogKCgxNiArIDkgKiBkKSAvIDMyKSkgKiBleHBGYWN0b3IpO1xuICAgIHJldHVybiBleHAgPCAweDgwID8gZXhwIDogTWF0aC5taW4oMHhmZiwgMHg4MCArIChleHAgPj4gNCkpO1xuICB9KSk7XG5cbiAgLy8gLy8gSGFsdmUgc2hpZWxkIGFuZCBhcm1vciBkZWZlbnNlIHZhbHVlc1xuICAvLyBwYXRjaEJ5dGVzKHJvbSwgMHgzNGJjMCwgW1xuICAvLyAgIC8vIEFybW9yIGRlZmVuc2VcbiAgLy8gICAwLCAxLCAzLCA1LCA3LCA5LCAxMiwgMTAsIDE2LFxuICAvLyAgIC8vIFNoaWVsZCBkZWZlbnNlXG4gIC8vICAgMCwgMSwgMywgNCwgNiwgOSwgOCwgMTIsIDE2LFxuICAvLyBdKTtcblxuICAvLyBBZGp1c3Qgc2hpZWxkIGFuZCBhcm1vciBkZWZlbnNlIHZhbHVlc1xuICBwYXRjaEJ5dGVzKHJvbSwgMHgzNGJjMCwgW1xuICAgIC8vIEFybW9yIGRlZmVuc2VcbiAgICAwLCAyLCA2LCAxMCwgMTQsIDE4LCAzMiwgMjQsIDIwLFxuICAgIC8vIFNoaWVsZCBkZWZlbnNlXG4gICAgMCwgMiwgNiwgMTAsIDE0LCAxOCwgMTYsIDMyLCAyMCxcbiAgXSk7XG59O1xuXG5jb25zdCByZXNjYWxlU2hvcHMgPSAocm9tOiBSb20sIGFzbTogQXNzZW1ibGVyLCByYW5kb20/OiBSYW5kb20pID0+IHtcbiAgLy8gUG9wdWxhdGUgcmVzY2FsZWQgcHJpY2VzIGludG8gdGhlIHZhcmlvdXMgcm9tIGxvY2F0aW9ucy5cbiAgLy8gU3BlY2lmaWNhbGx5LCB3ZSByZWFkIHRoZSBhdmFpbGFibGUgaXRlbSBJRHMgb3V0IG9mIHRoZVxuICAvLyBzaG9wIHRhYmxlcyBhbmQgdGhlbiBjb21wdXRlIG5ldyBwcmljZXMgZnJvbSB0aGVyZS5cbiAgLy8gSWYgYHJhbmRvbWAgaXMgcGFzc2VkIHRoZW4gdGhlIGJhc2UgcHJpY2UgdG8gYnV5IGVhY2hcbiAgLy8gaXRlbSBhdCBhbnkgZ2l2ZW4gc2hvcCB3aWxsIGJlIGFkanVzdGVkIHRvIGFueXdoZXJlIGZyb21cbiAgLy8gNTAlIHRvIDE1MCUgb2YgdGhlIGJhc2UgcHJpY2UuICBUaGUgcGF3biBzaG9wIHByaWNlIGlzXG4gIC8vIGFsd2F5cyA1MCUgb2YgdGhlIGJhc2UgcHJpY2UuXG5cbiAgcm9tLnNob3BDb3VudCA9IDExOyAvLyAxMSBvZiBhbGwgdHlwZXMgb2Ygc2hvcCBmb3Igc29tZSByZWFzb24uXG4gIHJvbS5zaG9wRGF0YVRhYmxlc0FkZHJlc3MgPSBhc20uZXhwYW5kKCdTaG9wRGF0YScpO1xuXG4gIC8vIE5PVEU6IFRoaXMgaXNuJ3QgaW4gdGhlIFJvbSBvYmplY3QgeWV0Li4uXG4gIHdyaXRlTGl0dGxlRW5kaWFuKHJvbS5wcmcsIGFzbS5leHBhbmQoJ0lubkJhc2VQcmljZScpLCAyMCk7XG5cbiAgZm9yIChjb25zdCBzaG9wIG9mIHJvbS5zaG9wcykge1xuICAgIGlmIChzaG9wLnR5cGUgPT09IFNob3BUeXBlLlBBV04pIGNvbnRpbnVlO1xuICAgIGZvciAobGV0IGkgPSAwLCBsZW4gPSBzaG9wLnByaWNlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgaWYgKHNob3AuY29udGVudHNbaV0gPCAweDgwKSB7XG4gICAgICAgIHNob3AucHJpY2VzW2ldID0gcmFuZG9tID8gcmFuZG9tLm5leHROb3JtYWwoMSwgMC4zLCAwLjUsIDEuNSkgOiAxO1xuICAgICAgfSBlbHNlIGlmIChzaG9wLnR5cGUgIT09IFNob3BUeXBlLklOTikge1xuICAgICAgICBzaG9wLnByaWNlc1tpXSA9IDA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBqdXN0IHNldCB0aGUgb25lIHByaWNlXG4gICAgICAgIHNob3AucHJpY2VzW2ldID0gcmFuZG9tID8gcmFuZG9tLm5leHROb3JtYWwoMSwgMC41LCAwLjM3NSwgMS42MjUpIDogMTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBBbHNvIGZpbGwgdGhlIHNjYWxpbmcgdGFibGVzLlxuICBjb25zdCBkaWZmID0gc2VxKDQ4LCB4ID0+IHgpO1xuICAvLyBUb29sIHNob3BzIHNjYWxlIGFzIDIgKiogKERpZmYgLyAxMCksIHN0b3JlIGluIDh0aHNcbiAgcGF0Y2hCeXRlcyhyb20ucHJnLCBhc20uZXhwYW5kKCdUb29sU2hvcFNjYWxpbmcnKSxcbiAgICAgICAgICAgICBkaWZmLm1hcChkID0+IE1hdGgucm91bmQoOCAqICgyICoqIChkIC8gMTApKSkpKTtcbiAgLy8gQXJtb3Igc2hvcHMgc2NhbGUgYXMgMiAqKiAoKDQ3IC0gRGlmZikgLyAxMiksIHN0b3JlIGluIDh0aHNcbiAgcGF0Y2hCeXRlcyhyb20ucHJnLCBhc20uZXhwYW5kKCdBcm1vclNob3BTY2FsaW5nJyksXG4gICAgICAgICAgICAgZGlmZi5tYXAoZCA9PiBNYXRoLnJvdW5kKDggKiAoMiAqKiAoKDQ3IC0gZCkgLyAxMikpKSkpO1xuXG4gIC8vIFNldCB0aGUgaXRlbSBiYXNlIHByaWNlcy5cbiAgZm9yIChsZXQgaSA9IDB4MGQ7IGkgPCAweDI3OyBpKyspIHtcbiAgICByb20uaXRlbXNbaV0uYmFzZVByaWNlID0gQkFTRV9QUklDRVNbaV07XG4gIH1cblxuICAvLyBUT0RPIC0gc2VwYXJhdGUgZmxhZyBmb3IgcmVzY2FsaW5nIG1vbnN0ZXJzPz8/XG59O1xuXG4vLyBNYXAgb2YgYmFzZSBwcmljZXMuICAoVG9vbHMgYXJlIHBvc2l0aXZlLCBhcm1vcnMgYXJlIG9uZXMtY29tcGxlbWVudC4pXG5jb25zdCBCQVNFX1BSSUNFUzoge1tpdGVtSWQ6IG51bWJlcl06IG51bWJlcn0gPSB7XG4gIC8vIEFybW9yc1xuICAweDBkOiA0LCAgICAvLyBjYXJhcGFjZSBzaGllbGRcbiAgMHgwZTogMTYsICAgLy8gYnJvbnplIHNoaWVsZFxuICAweDBmOiA1MCwgICAvLyBwbGF0aW51bSBzaGllbGRcbiAgMHgxMDogMzI1LCAgLy8gbWlycm9yZWQgc2hpZWxkXG4gIDB4MTE6IDEwMDAsIC8vIGNlcmFtaWMgc2hpZWxkXG4gIDB4MTI6IDIwMDAsIC8vIHNhY3JlZCBzaGllbGRcbiAgMHgxMzogNDAwMCwgLy8gYmF0dGxlIHNoaWVsZFxuICAweDE1OiA2LCAgICAvLyB0YW5uZWQgaGlkZVxuICAweDE2OiAyMCwgICAvLyBsZWF0aGVyIGFybW9yXG4gIDB4MTc6IDc1LCAgIC8vIGJyb256ZSBhcm1vclxuICAweDE4OiAyNTAsICAvLyBwbGF0aW51bSBhcm1vclxuICAweDE5OiAxMDAwLCAvLyBzb2xkaWVyIHN1aXRcbiAgMHgxYTogNDgwMCwgLy8gY2VyYW1pYyBzdWl0XG4gIC8vIFRvb2xzXG4gIDB4MWQ6IDI1LCAgIC8vIG1lZGljYWwgaGVyYlxuICAweDFlOiAzMCwgICAvLyBhbnRpZG90ZVxuICAweDFmOiA0NSwgICAvLyBseXNpcyBwbGFudFxuICAweDIwOiA0MCwgICAvLyBmcnVpdCBvZiBsaW1lXG4gIDB4MjE6IDM2LCAgIC8vIGZydWl0IG9mIHBvd2VyXG4gIDB4MjI6IDIwMCwgIC8vIG1hZ2ljIHJpbmdcbiAgMHgyMzogMTUwLCAgLy8gZnJ1aXQgb2YgcmVwdW5cbiAgMHgyNDogODAsICAgLy8gd2FycCBib290c1xuICAweDI2OiAzMDAsICAvLyBvcGVsIHN0YXR1ZVxuICAvLyAweDMxOiA1MCwgLy8gYWxhcm0gZmx1dGVcbn07XG5cbi8vLy8vLy8vL1xuLy8vLy8vLy8vXG4vLy8vLy8vLy9cblxuZnVuY3Rpb24gbm9ybWFsaXplU3dvcmRzKHJvbTogUm9tLCBmbGFnczogRmxhZ1NldCwgcmFuZG9tOiBSYW5kb20pIHtcbiAgLy8gVE9ETyAtIGZsYWdzIHRvIHJhbmRvbWl6ZSBzd29yZCBkYW1hZ2U/XG4gIGNvbnN0IHt9ID0ge2ZsYWdzLCByYW5kb219IGFzIGFueTtcblxuICAvLyB3aW5kIDEgPT4gMSBoaXQgICAgICAgICAgICAgICA9PiAzXG4gIC8vIHdpbmQgMiA9PiAxIGhpdCAgICAgICAgICAgICAgID0+IDZcbiAgLy8gd2luZCAzID0+IDItMyBoaXRzIDhNUCAgICAgICAgPT4gOFxuXG4gIC8vIGZpcmUgMSA9PiAxIGhpdCAgICAgICAgICAgICAgID0+IDNcbiAgLy8gZmlyZSAyID0+IDMgaGl0cyAgICAgICAgICAgICAgPT4gNVxuICAvLyBmaXJlIDMgPT4gNC02IGhpdHMgMTZNUCAgICAgICA9PiA3XG5cbiAgLy8gd2F0ZXIgMSA9PiAxIGhpdCAgICAgICAgICAgICAgPT4gM1xuICAvLyB3YXRlciAyID0+IDEtMiBoaXRzICAgICAgICAgICA9PiA2XG4gIC8vIHdhdGVyIDMgPT4gMy02IGhpdHMgMTZNUCAgICAgID0+IDhcblxuICAvLyB0aHVuZGVyIDEgPT4gMS0yIGhpdHMgc3ByZWFkICA9PiAzXG4gIC8vIHRodW5kZXIgMiA9PiAxLTMgaGl0cyBzcHJlYWQgID0+IDVcbiAgLy8gdGh1bmRlciAzID0+IDctMTAgaGl0cyA0ME1QICAgPT4gN1xuXG4gIHJvbS5vYmplY3RzWzB4MTBdLmF0ayA9IDM7IC8vIHdpbmQgMVxuICByb20ub2JqZWN0c1sweDExXS5hdGsgPSA2OyAvLyB3aW5kIDJcbiAgcm9tLm9iamVjdHNbMHgxMl0uYXRrID0gODsgLy8gd2luZCAzXG5cbiAgcm9tLm9iamVjdHNbMHgxOF0uYXRrID0gMzsgLy8gZmlyZSAxXG4gIHJvbS5vYmplY3RzWzB4MTNdLmF0ayA9IDU7IC8vIGZpcmUgMlxuICByb20ub2JqZWN0c1sweDE5XS5hdGsgPSA1OyAvLyBmaXJlIDJcbiAgcm9tLm9iamVjdHNbMHgxN10uYXRrID0gNzsgLy8gZmlyZSAzXG4gIHJvbS5vYmplY3RzWzB4MWFdLmF0ayA9IDc7IC8vIGZpcmUgM1xuXG4gIHJvbS5vYmplY3RzWzB4MTRdLmF0ayA9IDM7IC8vIHdhdGVyIDFcbiAgcm9tLm9iamVjdHNbMHgxNV0uYXRrID0gNjsgLy8gd2F0ZXIgMlxuICByb20ub2JqZWN0c1sweDE2XS5hdGsgPSA4OyAvLyB3YXRlciAzXG5cbiAgcm9tLm9iamVjdHNbMHgxY10uYXRrID0gMzsgLy8gdGh1bmRlciAxXG4gIHJvbS5vYmplY3RzWzB4MWVdLmF0ayA9IDU7IC8vIHRodW5kZXIgMlxuICByb20ub2JqZWN0c1sweDFiXS5hdGsgPSA3OyAvLyB0aHVuZGVyIDNcbiAgcm9tLm9iamVjdHNbMHgxZl0uYXRrID0gNzsgLy8gdGh1bmRlciAzXG59XG5cbmZ1bmN0aW9uIHJlc2NhbGVNb25zdGVycyhyb206IFJvbSwgZmxhZ3M6IEZsYWdTZXQsIHJhbmRvbTogUmFuZG9tKTogdm9pZCB7XG5cbiAgLy8gVE9ETyAtIGZpbmQgYW55dGhpbmcgc2hhcmluZyB0aGUgc2FtZSBtZW1vcnkgYW5kIHVwZGF0ZSB0aGVtIGFzIHdlbGxcbiAgY29uc3QgdW5zY2FsZWRNb25zdGVycyA9XG4gICAgICBuZXcgU2V0PG51bWJlcj4oc2VxKDB4MTAwLCB4ID0+IHgpLmZpbHRlcihzID0+IHMgaW4gcm9tLm9iamVjdHMpKTtcbiAgZm9yIChjb25zdCBbaWRdIG9mIFNDQUxFRF9NT05TVEVSUykge1xuICAgIHVuc2NhbGVkTW9uc3RlcnMuZGVsZXRlKGlkKTtcbiAgfVxuICBmb3IgKGNvbnN0IFtpZCwgbW9uc3Rlcl0gb2YgU0NBTEVEX01PTlNURVJTKSB7XG4gICAgZm9yIChjb25zdCBvdGhlciBvZiB1bnNjYWxlZE1vbnN0ZXJzKSB7XG4gICAgICBpZiAocm9tLm9iamVjdHNbaWRdLmJhc2UgPT09IHJvbS5vYmplY3RzW290aGVyXS5iYXNlKSB7XG4gICAgICAgIFNDQUxFRF9NT05TVEVSUy5zZXQob3RoZXIsIG1vbnN0ZXIpO1xuICAgICAgICB1bnNjYWxlZE1vbnN0ZXJzLmRlbGV0ZShpZCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gRml4IFNhYmVyYSAxJ3MgZWxlbWVudGFsIGRlZmVuc2UgdG8gbm8gbG9uZ2VyIGFsbG93IHRodW5kZXJcbiAgcm9tLm9iamVjdHNbMHg3ZF0uZWxlbWVudHMgfD0gMHgwODtcbiAgLy8gRml4IFNhYmVyYSAyJ3MgZmlyZWJhbGxzIHRvIGRvIHNoaWVsZCBkYW1hZ2UgYW5kIG5vdCBjYXVzZSBwYXJhbHlzaXNcbiAgcm9tLm9iamVjdHNbMHhjOF0uYXR0YWNrVHlwZSA9IDB4ZmY7XG4gIHJvbS5vYmplY3RzWzB4YzhdLnN0YXR1c0VmZmVjdCA9IDA7XG5cbiAgY29uc3QgQk9TU0VTID0gbmV3IFNldChbMHg1NywgMHg1ZSwgMHg2OCwgMHg3ZCwgMHg4OCwgMHg5NywgMHg5YiwgMHg5ZV0pO1xuICBjb25zdCBTTElNRVMgPSBuZXcgU2V0KFsweDUwLCAweDUzLCAweDVmLCAweDY5XSk7XG4gIGZvciAoY29uc3QgW2lkLCB7c2RlZiwgc3dyZCwgaGl0cywgc2F0aywgZGdsZCwgc2V4cH1dIG9mIFNDQUxFRF9NT05TVEVSUykge1xuICAgIC8vIGluZGljYXRlIHRoYXQgdGhpcyBvYmplY3QgbmVlZHMgc2NhbGluZ1xuICAgIGNvbnN0IG8gPSByb20ub2JqZWN0c1tpZF0uZGF0YTtcbiAgICBjb25zdCBib3NzID0gQk9TU0VTLmhhcyhpZCkgPyAxIDogMDtcbiAgICBvWzJdIHw9IDB4ODA7IC8vIHJlY29pbFxuICAgIG9bNl0gPSBoaXRzOyAvLyBIUFxuICAgIG9bN10gPSBzYXRrOyAgLy8gQVRLXG4gICAgLy8gU3dvcmQ6IDAuLjMgKHdpbmQgLSB0aHVuZGVyKSBwcmVzZXJ2ZWQsIDQgKGNyeXN0YWxpcykgPT4gN1xuICAgIG9bOF0gPSBzZGVmIHwgc3dyZCA8PCA0OyAvLyBERUZcbiAgICAvLyBOT1RFOiBsb25nIGFnbyB3ZSBzdG9yZWQgd2hldGhlciB0aGlzIHdhcyBhIGJvc3MgaW4gdGhlIGxvd2VzdFxuICAgIC8vIGJpdCBvZiB0aGUgbm93LXVudXNlZCBMRVZFTC4gc28gdGhhdCB3ZSBjb3VsZCBpbmNyZWFzZSBzY2FsaW5nXG4gICAgLy8gb24ga2lsbGluZyB0aGVtLCBidXQgbm93IHRoYXQgc2NhbGluZyBpcyB0aWVkIHRvIGl0ZW1zLCB0aGF0J3NcbiAgICAvLyBubyBsb25nZXIgbmVlZGVkIC0gd2UgY291bGQgY28tb3B0IHRoaXMgdG8gaW5zdGVhZCBzdG9yZSB1cHBlclxuICAgIC8vIGJpdHMgb2YgSFAgKG9yIHBvc3NpYmx5IGxvd2VyIGJpdHMgc28gdGhhdCBIUC1iYXNlZCBlZmZlY3RzXG4gICAgLy8gc3RpbGwgd29yayBjb3JyZWN0bHkpLlxuICAgIC8vIG9bOV0gPSBvWzldICYgMHhlMDtcbiAgICBvWzE2XSA9IG9bMTZdICYgMHgwZiB8IGRnbGQgPDwgNDsgLy8gR0xEXG4gICAgb1sxN10gPSBzZXhwOyAvLyBFWFBcblxuICAgIGlmIChib3NzID8gZmxhZ3Muc2h1ZmZsZUJvc3NFbGVtZW50cygpIDogZmxhZ3Muc2h1ZmZsZU1vbnN0ZXJFbGVtZW50cygpKSB7XG4gICAgICBpZiAoIVNMSU1FUy5oYXMoaWQpKSB7XG4gICAgICAgIGNvbnN0IGJpdHMgPSBbLi4ucm9tLm9iamVjdHNbaWRdLmVsZW1lbnRzLnRvU3RyaW5nKDIpLnBhZFN0YXJ0KDQsICcwJyldO1xuICAgICAgICByYW5kb20uc2h1ZmZsZShiaXRzKTtcbiAgICAgICAgcm9tLm9iamVjdHNbaWRdLmVsZW1lbnRzID0gTnVtYmVyLnBhcnNlSW50KGJpdHMuam9pbignJyksIDIpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIGhhbmRsZSBzbGltZXMgYWxsIGF0IG9uY2VcbiAgaWYgKGZsYWdzLnNodWZmbGVNb25zdGVyRWxlbWVudHMoKSkge1xuICAgIC8vIHBpY2sgYW4gZWxlbWVudCBmb3Igc2xpbWUgZGVmZW5zZVxuICAgIGNvbnN0IGUgPSByYW5kb20ubmV4dEludCg0KTtcbiAgICByb20ucHJnWzB4MzUyMmRdID0gZSArIDE7XG4gICAgZm9yIChjb25zdCBpZCBvZiBTTElNRVMpIHtcbiAgICAgIHJvbS5vYmplY3RzW2lkXS5lbGVtZW50cyA9IDEgPDwgZTtcbiAgICB9XG4gIH1cblxuICAvLyByb20ud3JpdGVPYmplY3REYXRhKCk7XG59O1xuXG5jb25zdCBzaHVmZmxlTW9uc3RlcnMgPSAocm9tOiBSb20sIGZsYWdzOiBGbGFnU2V0LCByYW5kb206IFJhbmRvbSkgPT4ge1xuICAvLyBUT0RPOiBvbmNlIHdlIGhhdmUgbG9jYXRpb24gbmFtZXMsIGNvbXBpbGUgYSBzcG9pbGVyIG9mIHNodWZmbGVkIG1vbnN0ZXJzXG4gIGNvbnN0IGdyYXBoaWNzID0gbmV3IEdyYXBoaWNzKHJvbSk7XG4gIC8vICh3aW5kb3cgYXMgYW55KS5ncmFwaGljcyA9IGdyYXBoaWNzO1xuICBpZiAoZmxhZ3Muc2h1ZmZsZVNwcml0ZVBhbGV0dGVzKCkpIGdyYXBoaWNzLnNodWZmbGVQYWxldHRlcyhyYW5kb20pO1xuICBjb25zdCBwb29sID0gbmV3IE1vbnN0ZXJQb29sKGZsYWdzLCB7fSk7XG4gIGZvciAoY29uc3QgbG9jIG9mIHJvbS5sb2NhdGlvbnMpIHtcbiAgICBpZiAobG9jLnVzZWQpIHBvb2wucG9wdWxhdGUobG9jKTtcbiAgfVxuICBwb29sLnNodWZmbGUocmFuZG9tLCBncmFwaGljcyk7XG59O1xuXG5jb25zdCBpZGVudGlmeUtleUl0ZW1zRm9yRGlmZmljdWx0eUJ1ZmZzID0gKHJvbTogUm9tKSA9PiB7XG4gIC8vIC8vIFRhZyBrZXkgaXRlbXMgZm9yIGRpZmZpY3VsdHkgYnVmZnNcbiAgLy8gZm9yIChjb25zdCBnZXQgb2Ygcm9tLml0ZW1HZXRzKSB7XG4gIC8vICAgY29uc3QgaXRlbSA9IElURU1TLmdldChnZXQuaXRlbUlkKTtcbiAgLy8gICBpZiAoIWl0ZW0gfHwgIWl0ZW0ua2V5KSBjb250aW51ZTtcbiAgLy8gICBnZXQua2V5ID0gdHJ1ZTtcbiAgLy8gfVxuICAvLyAvLyBjb25zb2xlLmxvZyhyZXBvcnQpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IDB4NDk7IGkrKykge1xuICAgIC8vIE5PVEUgLSBzcGVjaWFsIGhhbmRsaW5nIGZvciBhbGFybSBmbHV0ZSB1bnRpbCB3ZSBwcmUtcGF0Y2hcbiAgICBjb25zdCB1bmlxdWUgPSAocm9tLnByZ1sweDIwZmYwICsgaV0gJiAweDQwKSB8fCBpID09PSAweDMxO1xuICAgIGNvbnN0IGJpdCA9IDEgPDwgKGkgJiA3KTtcbiAgICBjb25zdCBhZGRyID0gMHgxZTExMCArIChpID4+PiAzKTtcbiAgICByb20ucHJnW2FkZHJdID0gcm9tLnByZ1thZGRyXSAmIH5iaXQgfCAodW5pcXVlID8gYml0IDogMCk7XG4gIH1cbn07XG5cbmludGVyZmFjZSBNb25zdGVyRGF0YSB7XG4gIGlkOiBudW1iZXI7XG4gIHR5cGU6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBzZGVmOiBudW1iZXI7XG4gIHN3cmQ6IG51bWJlcjtcbiAgaGl0czogbnVtYmVyO1xuICBzYXRrOiBudW1iZXI7XG4gIGRnbGQ6IG51bWJlcjtcbiAgc2V4cDogbnVtYmVyO1xufVxuXG4vKiB0c2xpbnQ6ZGlzYWJsZTp0cmFpbGluZy1jb21tYSB3aGl0ZXNwYWNlICovXG5jb25zdCBTQ0FMRURfTU9OU1RFUlM6IE1hcDxudW1iZXIsIE1vbnN0ZXJEYXRhPiA9IG5ldyBNYXAoW1xuICAvLyBJRCAgVFlQRSAgTkFNRSAgICAgICAgICAgICAgICAgICAgICAgU0RFRiBTV1JEIEhJVFMgU0FUSyBER0xEIFNFWFBcbiAgWzB4M2YsICdwJywgJ1NvcmNlcm9yIHNob3QnLCAgICAgICAgICAgICAgLCAgICwgICAsICAgIDE5LCAgLCAgICAsXSxcbiAgWzB4NGIsICdtJywgJ3dyYWl0aD8/JywgICAgICAgICAgICAgICAgICAgMiwgICwgICAyLCAgIDIyLCAgNCwgICA2MV0sXG4gIFsweDRmLCAnbScsICd3cmFpdGgnLCAgICAgICAgICAgICAgICAgICAgIDEsICAsICAgMiwgICAyMCwgIDQsICAgNjFdLFxuICBbMHg1MCwgJ20nLCAnQmx1ZSBTbGltZScsICAgICAgICAgICAgICAgICAsICAgLCAgIDEsICAgMTYsICAyLCAgIDMyXSxcbiAgWzB4NTEsICdtJywgJ1dlcmV0aWdlcicsICAgICAgICAgICAgICAgICAgLCAgICwgICAxLCAgIDIxLCAgNCwgICA0MF0sXG4gIFsweDUyLCAnbScsICdHcmVlbiBKZWxseScsICAgICAgICAgICAgICAgIDQsICAsICAgMywgICAxNiwgIDQsICAgMzZdLFxuICBbMHg1MywgJ20nLCAnUmVkIFNsaW1lJywgICAgICAgICAgICAgICAgICA2LCAgLCAgIDQsICAgMTYsICA0LCAgIDQ4XSxcbiAgWzB4NTQsICdtJywgJ1JvY2sgR29sZW0nLCAgICAgICAgICAgICAgICAgNiwgICwgICAxMSwgIDI0LCAgNiwgICA4NV0sXG4gIFsweDU1LCAnbScsICdCbHVlIEJhdCcsICAgICAgICAgICAgICAgICAgICwgICAsICAgLCAgICA0LCAgICwgICAgMzJdLFxuICBbMHg1NiwgJ20nLCAnR3JlZW4gV3l2ZXJuJywgICAgICAgICAgICAgICA0LCAgLCAgIDQsICAgMjQsICA2LCAgIDUyXSxcbiAgWzB4NTcsICdiJywgJ1ZhbXBpcmUnLCAgICAgICAgICAgICAgICAgICAgMywgICwgICAxMiwgIDE4LCAgLCAgICAsXSxcbiAgWzB4NTgsICdtJywgJ09yYycsICAgICAgICAgICAgICAgICAgICAgICAgMywgICwgICA0LCAgIDIxLCAgNCwgICA1N10sXG4gIFsweDU5LCAnbScsICdSZWQgRmx5aW5nIFN3YW1wIEluc2VjdCcsICAgIDMsICAsICAgMSwgICAyMSwgIDQsICAgNTddLFxuICBbMHg1YSwgJ20nLCAnQmx1ZSBNdXNocm9vbScsICAgICAgICAgICAgICAyLCAgLCAgIDEsICAgMjEsICA0LCAgIDQ0XSxcbiAgWzB4NWIsICdtJywgJ1N3YW1wIFRvbWF0bycsICAgICAgICAgICAgICAgMywgICwgICAyLCAgIDM1LCAgNCwgICA1Ml0sXG4gIFsweDVjLCAnbScsICdGbHlpbmcgTWVhZG93IEluc2VjdCcsICAgICAgIDMsICAsICAgMywgICAyMywgIDQsICAgODFdLFxuICBbMHg1ZCwgJ20nLCAnU3dhbXAgUGxhbnQnLCAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgLCAgICAsICAgIDM2XSxcbiAgWzB4NWUsICdiJywgJ0luc2VjdCcsICAgICAgICAgICAgICAgICAgICAgLCAgIDEsICA4LCAgIDYsICAgLCAgICAsXSxcbiAgWzB4NWYsICdtJywgJ0xhcmdlIEJsdWUgU2xpbWUnLCAgICAgICAgICAgNSwgICwgICAzLCAgIDIwLCAgNCwgICA1Ml0sXG4gIFsweDYwLCAnbScsICdJY2UgWm9tYmllJywgICAgICAgICAgICAgICAgIDUsICAsICAgNywgICAxNCwgIDQsICAgNTddLFxuICBbMHg2MSwgJ20nLCAnR3JlZW4gTGl2aW5nIFJvY2snLCAgICAgICAgICAsICAgLCAgIDEsICAgOSwgICA0LCAgIDI4XSxcbiAgWzB4NjIsICdtJywgJ0dyZWVuIFNwaWRlcicsICAgICAgICAgICAgICAgNCwgICwgICA0LCAgIDIyLCAgNCwgICA0NF0sXG4gIFsweDYzLCAnbScsICdSZWQvUHVycGxlIFd5dmVybicsICAgICAgICAgIDMsICAsICAgNCwgICAzMCwgIDQsICAgNjVdLFxuICBbMHg2NCwgJ20nLCAnRHJheWdvbmlhIFNvbGRpZXInLCAgICAgICAgICA2LCAgLCAgIDExLCAgMzYsICA0LCAgIDg5XSxcbiAgLy8gSUQgIFRZUEUgIE5BTUUgICAgICAgICAgICAgICAgICAgICAgIFNERUYgU1dSRCBISVRTIFNBVEsgREdMRCBTRVhQXG4gIFsweDY1LCAnbScsICdJY2UgRW50aXR5JywgICAgICAgICAgICAgICAgIDMsICAsICAgMiwgICAyNCwgIDQsICAgNTJdLFxuICBbMHg2NiwgJ20nLCAnUmVkIExpdmluZyBSb2NrJywgICAgICAgICAgICAsICAgLCAgIDEsICAgMTMsICA0LCAgIDQwXSxcbiAgWzB4NjcsICdtJywgJ0ljZSBHb2xlbScsICAgICAgICAgICAgICAgICAgNywgIDIsICAxMSwgIDI4LCAgNCwgICA4MV0sXG4gIFsweDY4LCAnYicsICdLZWxiZXNxdWUnLCAgICAgICAgICAgICAgICAgIDQsICA2LCAgMTIsICAyOSwgICwgICAgLF0sXG4gIFsweDY5LCAnbScsICdHaWFudCBSZWQgU2xpbWUnLCAgICAgICAgICAgIDcsICAsICAgNDAsICA5MCwgIDQsICAgMTAyXSxcbiAgWzB4NmEsICdtJywgJ1Ryb2xsJywgICAgICAgICAgICAgICAgICAgICAgMiwgICwgICAzLCAgIDI0LCAgNCwgICA2NV0sXG4gIFsweDZiLCAnbScsICdSZWQgSmVsbHknLCAgICAgICAgICAgICAgICAgIDIsICAsICAgMiwgICAxNCwgIDQsICAgNDRdLFxuICBbMHg2YywgJ20nLCAnTWVkdXNhJywgICAgICAgICAgICAgICAgICAgICAzLCAgLCAgIDQsICAgMzYsICA4LCAgIDc3XSxcbiAgWzB4NmQsICdtJywgJ1JlZCBDcmFiJywgICAgICAgICAgICAgICAgICAgMiwgICwgICAxLCAgIDIxLCAgNCwgICA0NF0sXG4gIFsweDZlLCAnbScsICdNZWR1c2EgSGVhZCcsICAgICAgICAgICAgICAgICwgICAsICAgMSwgICAyOSwgIDQsICAgMzZdLFxuICBbMHg2ZiwgJ20nLCAnRXZpbCBCaXJkJywgICAgICAgICAgICAgICAgICAsICAgLCAgIDIsICAgMzAsICA2LCAgIDY1XSxcbiAgWzB4NzEsICdtJywgJ1JlZC9QdXJwbGUgTXVzaHJvb20nLCAgICAgICAgMywgICwgICA1LCAgIDE5LCAgNiwgICA2OV0sXG4gIFsweDcyLCAnbScsICdWaW9sZXQgRWFydGggRW50aXR5JywgICAgICAgIDMsICAsICAgMywgICAxOCwgIDYsICAgNjFdLFxuICBbMHg3MywgJ20nLCAnTWltaWMnLCAgICAgICAgICAgICAgICAgICAgICAsICAgLCAgIDMsICAgMjYsICAxNSwgIDczXSxcbiAgWzB4NzQsICdtJywgJ1JlZCBTcGlkZXInLCAgICAgICAgICAgICAgICAgMywgICwgICA0LCAgIDIyLCAgNiwgICA0OF0sXG4gIFsweDc1LCAnbScsICdGaXNobWFuJywgICAgICAgICAgICAgICAgICAgIDQsICAsICAgNiwgICAxOSwgIDUsICAgNjFdLFxuICBbMHg3NiwgJ20nLCAnSmVsbHlmaXNoJywgICAgICAgICAgICAgICAgICAsICAgLCAgIDMsICAgMTQsICAzLCAgIDQ4XSxcbiAgWzB4NzcsICdtJywgJ0tyYWtlbicsICAgICAgICAgICAgICAgICAgICAgNSwgICwgICAxMSwgIDI1LCAgNywgICA3M10sXG4gIFsweDc4LCAnbScsICdEYXJrIEdyZWVuIFd5dmVybicsICAgICAgICAgIDQsICAsICAgNSwgICAyMSwgIDUsICAgNjFdLFxuICBbMHg3OSwgJ20nLCAnU2FuZCBNb25zdGVyJywgICAgICAgICAgICAgICA1LCAgLCAgIDgsICAgNiwgICA0LCAgIDU3XSxcbiAgWzB4N2IsICdtJywgJ1dyYWl0aCBTaGFkb3cgMScsICAgICAgICAgICAgLCAgICwgICAsICAgIDksICAgNywgICA0NF0sXG4gIFsweDdjLCAnbScsICdLaWxsZXIgTW90aCcsICAgICAgICAgICAgICAgICwgICAsICAgMiwgICAzNSwgICwgICAgNzddLFxuICBbMHg3ZCwgJ2InLCAnU2FiZXJhJywgICAgICAgICAgICAgICAgICAgICAzLCAgNywgIDEzLCAgMjQsICAsICAgICxdLFxuICBbMHg4MCwgJ20nLCAnRHJheWdvbmlhIEFyY2hlcicsICAgICAgICAgICAxLCAgLCAgIDMsICAgMjAsICA2LCAgIDYxXSxcbiAgLy8gSUQgIFRZUEUgIE5BTUUgICAgICAgICAgICAgICAgICAgICAgIFNERUYgU1dSRCBISVRTIFNBVEsgREdMRCBTRVhQXG4gIFsweDgxLCAnbScsICdFdmlsIEJvbWJlciBCaXJkJywgICAgICAgICAgICwgICAsICAgMSwgICAxOSwgIDQsICAgNjVdLFxuICBbMHg4MiwgJ20nLCAnTGF2YW1hbi9ibG9iJywgICAgICAgICAgICAgICAzLCAgLCAgIDMsICAgMjQsICA2LCAgIDg1XSxcbiAgWzB4ODQsICdtJywgJ0xpemFyZG1hbiAody8gZmxhaWwoJywgICAgICAgMiwgICwgICAzLCAgIDMwLCAgNiwgICA4MV0sXG4gIFsweDg1LCAnbScsICdHaWFudCBFeWUnLCAgICAgICAgICAgICAgICAgIDMsICAsICAgNSwgICAzMywgIDQsICAgODFdLFxuICBbMHg4NiwgJ20nLCAnU2FsYW1hbmRlcicsICAgICAgICAgICAgICAgICAyLCAgLCAgIDQsICAgMjksICA4LCAgIDc3XSxcbiAgWzB4ODcsICdtJywgJ1NvcmNlcm9yJywgICAgICAgICAgICAgICAgICAgMiwgICwgICA1LCAgIDMxLCAgNiwgICA2NV0sXG4gIFsweDg4LCAnYicsICdNYWRvJywgICAgICAgICAgICAgICAgICAgICAgIDQsICA4LCAgMTAsICAzMCwgICwgICAgLF0sXG4gIFsweDg5LCAnbScsICdEcmF5Z29uaWEgS25pZ2h0JywgICAgICAgICAgIDIsICAsICAgMywgICAyNCwgIDQsICAgNzddLFxuICBbMHg4YSwgJ20nLCAnRGV2aWwnLCAgICAgICAgICAgICAgICAgICAgICAsICAgLCAgIDEsICAgMTgsICA0LCAgIDUyXSxcbiAgWzB4OGIsICdiJywgJ0tlbGJlc3F1ZSAyJywgICAgICAgICAgICAgICAgNCwgIDYsICAxMSwgIDI3LCAgLCAgICAsXSxcbiAgWzB4OGMsICdtJywgJ1dyYWl0aCBTaGFkb3cgMicsICAgICAgICAgICAgLCAgICwgICAsICAgIDE3LCAgNCwgICA0OF0sXG4gIFsweDkwLCAnYicsICdTYWJlcmEgMicsICAgICAgICAgICAgICAgICAgIDUsICA3LCAgMjEsICAyNywgICwgICAgLF0sXG4gIFsweDkxLCAnbScsICdUYXJhbnR1bGEnLCAgICAgICAgICAgICAgICAgIDMsICAsICAgMywgICAyMSwgIDYsICAgNzNdLFxuICBbMHg5MiwgJ20nLCAnU2tlbGV0b24nLCAgICAgICAgICAgICAgICAgICAsICAgLCAgIDQsICAgMzAsICA2LCAgIDY5XSxcbiAgWzB4OTMsICdiJywgJ01hZG8gMicsICAgICAgICAgICAgICAgICAgICAgNCwgIDgsICAxMSwgIDI1LCAgLCAgICAsXSxcbiAgWzB4OTQsICdtJywgJ1B1cnBsZSBHaWFudCBFeWUnLCAgICAgICAgICAgNCwgICwgICAxMCwgIDIzLCAgNiwgICAxMDJdLFxuICBbMHg5NSwgJ20nLCAnQmxhY2sgS25pZ2h0ICh3LyBmbGFpbCknLCAgICAzLCAgLCAgIDcsICAgMjYsICA2LCAgIDg5XSxcbiAgWzB4OTYsICdtJywgJ1Njb3JwaW9uJywgICAgICAgICAgICAgICAgICAgMywgICwgICA1LCAgIDI5LCAgMiwgICA3M10sXG4gIFsweDk3LCAnYicsICdLYXJtaW5lJywgICAgICAgICAgICAgICAgICAgIDQsICAsICAgMTQsICAyNiwgICwgICAgLF0sXG4gIFsweDk4LCAnbScsICdTYW5kbWFuL2Jsb2InLCAgICAgICAgICAgICAgIDMsICAsICAgNSwgICAzNiwgIDYsICAgOThdLFxuICBbMHg5OSwgJ20nLCAnTXVtbXknLCAgICAgICAgICAgICAgICAgICAgICA1LCAgLCAgIDE5LCAgMzYsICA2LCAgIDExMF0sXG4gIFsweDlhLCAnbScsICdUb21iIEd1YXJkaWFuJywgICAgICAgICAgICAgIDcsICAsICAgNjAsICAzNywgIDYsICAgMTA2XSxcbiAgWzB4OWIsICdiJywgJ0RyYXlnb24nLCAgICAgICAgICAgICAgICAgICAgNSwgIDYsICAxNiwgIDQxLCAgLCAgICAsXSxcbiAgWzB4OWUsICdiJywgJ0RyYXlnb24gMicsICAgICAgICAgICAgICAgICAgNywgIDYsICAyOCwgIDQwLCAgLCAgICAsXSxcbiAgLy8gSUQgIFRZUEUgIE5BTUUgICAgICAgICAgICAgICAgICAgICAgIFNERUYgU1dSRCBISVRTIFNBVEsgREdMRCBTRVhQXG4gIFsweGEwLCAnbScsICdHcm91bmQgU2VudHJ5ICgxKScsICAgICAgICAgIDQsICAsICAgNiwgICAyNiwgICwgICAgNzNdLFxuICBbMHhhMSwgJ20nLCAnVG93ZXIgRGVmZW5zZSBNZWNoICgyKScsICAgICA1LCAgLCAgIDgsICAgMzYsICAsICAgIDg1XSxcbiAgWzB4YTIsICdtJywgJ1Rvd2VyIFNlbnRpbmVsJywgICAgICAgICAgICAgLCAgICwgICAxLCAgICwgICAgLCAgICAzMl0sXG4gIFsweGEzLCAnbScsICdBaXIgU2VudHJ5JywgICAgICAgICAgICAgICAgIDMsICAsICAgMiwgICAyNiwgICwgICAgNjVdLFxuICAvLyBbMHhhNCwgJ2InLCAnRHluYScsICAgICAgICAgICAgICAgICAgICAgICA2LCAgNSwgIDE2LCAgLCAgICAsICAgICxdLFxuICBbMHhhNSwgJ2InLCAnVmFtcGlyZSAyJywgICAgICAgICAgICAgICAgICAzLCAgLCAgIDEyLCAgMjcsICAsICAgICxdLFxuICAvLyBbMHhiNCwgJ2InLCAnZHluYSBwb2QnLCAgICAgICAgICAgICAgICAgICAxNSwgLCAgIDI1NSwgMjYsICAsICAgICxdLFxuICAvLyBbMHhiOCwgJ3AnLCAnZHluYSBjb3VudGVyJywgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMjYsICAsICAgICxdLFxuICAvLyBbMHhiOSwgJ3AnLCAnZHluYSBsYXNlcicsICAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMjYsICAsICAgICxdLFxuICAvLyBbMHhiYSwgJ3AnLCAnZHluYSBidWJibGUnLCAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMzYsICAsICAgICxdLFxuICBbMHhhNCwgJ2InLCAnRHluYScsICAgICAgICAgICAgICAgICAgICAgICA2LCAgNSwgIDMyLCAgLCAgICAsICAgICxdLFxuICBbMHhiNCwgJ2InLCAnZHluYSBwb2QnLCAgICAgICAgICAgICAgICAgICA2LCAgNSwgIDQ4LCAgMjYsICAsICAgICxdLFxuICBbMHhiOCwgJ3AnLCAnZHluYSBjb3VudGVyJywgICAgICAgICAgICAgIDE1LCAgLCAgICwgICAgNDIsICAsICAgICxdLFxuICBbMHhiOSwgJ3AnLCAnZHluYSBsYXNlcicsICAgICAgICAgICAgICAgIDE1LCAgLCAgICwgICAgNDIsICAsICAgICxdLFxuICBbMHhiYSwgJ3AnLCAnZHluYSBidWJibGUnLCAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMzYsICAsICAgICxdLFxuICAvL1xuICBbMHhiYywgJ20nLCAndmFtcDIgYmF0JywgICAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMTYsICAsICAgIDE1XSxcbiAgWzB4YmYsICdwJywgJ2RyYXlnb24yIGZpcmViYWxsJywgICAgICAgICAgLCAgICwgICAsICAgIDI2LCAgLCAgICAsXSxcbiAgWzB4YzEsICdtJywgJ3ZhbXAxIGJhdCcsICAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDE2LCAgLCAgICAxNV0sXG4gIFsweGMzLCAncCcsICdnaWFudCBpbnNlY3Qgc3BpdCcsICAgICAgICAgICwgICAsICAgLCAgICAzNSwgICwgICAgLF0sXG4gIFsweGM0LCAnbScsICdzdW1tb25lZCBpbnNlY3QnLCAgICAgICAgICAgIDQsICAsICAgMiwgICA0MiwgICwgICAgOThdLFxuICBbMHhjNSwgJ3AnLCAna2VsYnkxIHJvY2snLCAgICAgICAgICAgICAgICAsICAgLCAgICwgICAgMjIsICAsICAgICxdLFxuICBbMHhjNiwgJ3AnLCAnc2FiZXJhMSBiYWxscycsICAgICAgICAgICAgICAsICAgLCAgICwgICAgMTksICAsICAgICxdLFxuICBbMHhjNywgJ3AnLCAna2VsYnkyIGZpcmViYWxscycsICAgICAgICAgICAsICAgLCAgICwgICAgMTEsICAsICAgICxdLFxuICBbMHhjOCwgJ3AnLCAnc2FiZXJhMiBmaXJlJywgICAgICAgICAgICAgICAsICAgLCAgIDEsICAgNiwgICAsICAgICxdLFxuICBbMHhjOSwgJ3AnLCAnc2FiZXJhMiBiYWxscycsICAgICAgICAgICAgICAsICAgLCAgICwgICAgMTcsICAsICAgICxdLFxuICBbMHhjYSwgJ3AnLCAna2FybWluZSBiYWxscycsICAgICAgICAgICAgICAsICAgLCAgICwgICAgMjUsICAsICAgICxdLFxuICBbMHhjYiwgJ3AnLCAnc3VuL21vb24gc3RhdHVlIGZpcmViYWxscycsICAsICAgLCAgICwgICAgMzksICAsICAgICxdLFxuICBbMHhjYywgJ3AnLCAnZHJheWdvbjEgbGlnaHRuaW5nJywgICAgICAgICAsICAgLCAgICwgICAgMzcsICAsICAgICxdLFxuICBbMHhjZCwgJ3AnLCAnZHJheWdvbjIgbGFzZXInLCAgICAgICAgICAgICAsICAgLCAgICwgICAgMzYsICAsICAgICxdLFxuICAvLyBJRCAgVFlQRSAgTkFNRSAgICAgICAgICAgICAgICAgICAgICAgU0RFRiBTV1JEIEhJVFMgU0FUSyBER0xEIFNFWFBcbiAgWzB4Y2UsICdwJywgJ2RyYXlnb24yIGJyZWF0aCcsICAgICAgICAgICAgLCAgICwgICAsICAgIDM2LCAgLCAgICAsXSxcbiAgWzB4ZTAsICdwJywgJ2V2aWwgYm9tYmVyIGJpcmQgYm9tYicsICAgICAgLCAgICwgICAsICAgIDIsICAgLCAgICAsXSxcbiAgWzB4ZTIsICdwJywgJ3N1bW1vbmVkIGluc2VjdCBib21iJywgICAgICAgLCAgICwgICAsICAgIDQ3LCAgLCAgICAsXSxcbiAgWzB4ZTMsICdwJywgJ3BhcmFseXNpcyBiZWFtJywgICAgICAgICAgICAgLCAgICwgICAsICAgIDIzLCAgLCAgICAsXSxcbiAgWzB4ZTQsICdwJywgJ3N0b25lIGdhemUnLCAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDMzLCAgLCAgICAsXSxcbiAgWzB4ZTUsICdwJywgJ3JvY2sgZ29sZW0gcm9jaycsICAgICAgICAgICAgLCAgICwgICAsICAgIDI0LCAgLCAgICAsXSxcbiAgWzB4ZTYsICdwJywgJ2N1cnNlIGJlYW0nLCAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDEwLCAgLCAgICAsXSxcbiAgWzB4ZTcsICdwJywgJ21wIGRyYWluIHdlYicsICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDExLCAgLCAgICAsXSxcbiAgWzB4ZTgsICdwJywgJ2Zpc2htYW4gdHJpZGVudCcsICAgICAgICAgICAgLCAgICwgICAsICAgIDE1LCAgLCAgICAsXSxcbiAgWzB4ZTksICdwJywgJ29yYyBheGUnLCAgICAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDI0LCAgLCAgICAsXSxcbiAgWzB4ZWEsICdwJywgJ1N3YW1wIFBvbGxlbicsICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDM3LCAgLCAgICAsXSxcbiAgWzB4ZWIsICdwJywgJ3BhcmFseXNpcyBwb3dkZXInLCAgICAgICAgICAgLCAgICwgICAsICAgIDE3LCAgLCAgICAsXSxcbiAgWzB4ZWMsICdwJywgJ2RyYXlnb25pYSBzb2xpZGVyIHN3b3JkJywgICAgLCAgICwgICAsICAgIDI4LCAgLCAgICAsXSxcbiAgWzB4ZWQsICdwJywgJ2ljZSBnb2xlbSByb2NrJywgICAgICAgICAgICAgLCAgICwgICAsICAgIDIwLCAgLCAgICAsXSxcbiAgWzB4ZWUsICdwJywgJ3Ryb2xsIGF4ZScsICAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDI3LCAgLCAgICAsXSxcbiAgWzB4ZWYsICdwJywgJ2tyYWtlbiBpbmsnLCAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDI0LCAgLCAgICAsXSxcbiAgWzB4ZjAsICdwJywgJ2RyYXlnb25pYSBhcmNoZXIgYXJyb3cnLCAgICAgLCAgICwgICAsICAgIDEyLCAgLCAgICAsXSxcbiAgWzB4ZjEsICdwJywgJz8/PyB1bnVzZWQnLCAgICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDE2LCAgLCAgICAsXSxcbiAgWzB4ZjIsICdwJywgJ2RyYXlnb25pYSBrbmlnaHQgc3dvcmQnLCAgICAgLCAgICwgICAsICAgIDksICAgLCAgICAsXSxcbiAgWzB4ZjMsICdwJywgJ21vdGggcmVzaWR1ZScsICAgICAgICAgICAgICAgLCAgICwgICAsICAgIDE5LCAgLCAgICAsXSxcbiAgWzB4ZjQsICdwJywgJ2dyb3VuZCBzZW50cnkgbGFzZXInLCAgICAgICAgLCAgICwgICAsICAgIDEzLCAgLCAgICAsXSxcbiAgWzB4ZjUsICdwJywgJ3Rvd2VyIGRlZmVuc2UgbWVjaCBsYXNlcicsICAgLCAgICwgICAsICAgIDIzLCAgLCAgICAsXSxcbiAgWzB4ZjYsICdwJywgJ3Rvd2VyIHNlbnRpbmVsIGxhc2VyJywgICAgICAgLCAgICwgICAsICAgIDgsICAgLCAgICAsXSxcbiAgWzB4ZjcsICdwJywgJ3NrZWxldG9uIHNob3QnLCAgICAgICAgICAgICAgLCAgICwgICAsICAgIDExLCAgLCAgICAsXSxcbiAgLy8gSUQgIFRZUEUgIE5BTUUgICAgICAgICAgICAgICAgICAgICAgIFNERUYgU1dSRCBISVRTIFNBVEsgREdMRCBTRVhQXG4gIFsweGY4LCAncCcsICdsYXZhbWFuIHNob3QnLCAgICAgICAgICAgICAgICwgICAsICAgLCAgICAxNCwgICwgICAgLF0sXG4gIFsweGY5LCAncCcsICdibGFjayBrbmlnaHQgZmxhaWwnLCAgICAgICAgICwgICAsICAgLCAgICAxOCwgICwgICAgLF0sXG4gIFsweGZhLCAncCcsICdsaXphcmRtYW4gZmxhaWwnLCAgICAgICAgICAgICwgICAsICAgLCAgICAyMSwgICwgICAgLF0sXG4gIFsweGZjLCAncCcsICdtYWRvIHNodXJpa2VuJywgICAgICAgICAgICAgICwgICAsICAgLCAgICAzNiwgICwgICAgLF0sXG4gIFsweGZkLCAncCcsICdndWFyZGlhbiBzdGF0dWUgbWlzc2lsZScsICAgICwgICAsICAgLCAgICAyMywgICwgICAgLF0sXG4gIFsweGZlLCAncCcsICdkZW1vbiB3YWxsIGZpcmUnLCAgICAgICAgICAgICwgICAsICAgLCAgICAyMywgICwgICAgLF0sXG5dLm1hcCgoW2lkLCB0eXBlLCBuYW1lLCBzZGVmPTAsIHN3cmQ9MCwgaGl0cz0wLCBzYXRrPTAsIGRnbGQ9MCwgc2V4cD0wXSkgPT5cbiAgICAgIFtpZCwge2lkLCB0eXBlLCBuYW1lLCBzZGVmLCBzd3JkLCBoaXRzLCBzYXRrLCBkZ2xkLCBzZXhwfV0pKSBhcyBhbnk7XG5cbi8qIHRzbGludDplbmFibGU6dHJhaWxpbmctY29tbWEgd2hpdGVzcGFjZSAqL1xuXG4vLyBXaGVuIGRlYWxpbmcgd2l0aCBjb25zdHJhaW50cywgaXQncyBiYXNpY2FsbHkga3NhdFxuLy8gIC0gd2UgaGF2ZSBhIGxpc3Qgb2YgcmVxdWlyZW1lbnRzIHRoYXQgYXJlIEFORGVkIHRvZ2V0aGVyXG4vLyAgLSBlYWNoIGlzIGEgbGlzdCBvZiBwcmVkaWNhdGVzIHRoYXQgYXJlIE9SZWQgdG9nZXRoZXJcbi8vICAtIGVhY2ggcHJlZGljYXRlIGhhcyBhIGNvbnRpbnVhdGlvbiBmb3Igd2hlbiBpdCdzIHBpY2tlZFxuLy8gIC0gbmVlZCBhIHdheSB0byB0aGluIHRoZSBjcm93ZCwgZWZmaWNpZW50bHkgY2hlY2sgY29tcGF0LCBldGNcbi8vIFByZWRpY2F0ZSBpcyBhIGZvdXItZWxlbWVudCBhcnJheSBbcGF0MCxwYXQxLHBhbDIscGFsM11cbi8vIFJhdGhlciB0aGFuIGEgY29udGludWF0aW9uIHdlIGNvdWxkIGdvIHRocm91Z2ggYWxsIHRoZSBzbG90cyBhZ2FpblxuXG4vLyBjbGFzcyBDb25zdHJhaW50cyB7XG4vLyAgIGNvbnN0cnVjdG9yKCkge1xuLy8gICAgIC8vIEFycmF5IG9mIHBhdHRlcm4gdGFibGUgb3B0aW9ucy4gIE51bGwgaW5kaWNhdGVzIHRoYXQgaXQgY2FuIGJlIGFueXRoaW5nLlxuLy8gICAgIC8vXG4vLyAgICAgdGhpcy5wYXR0ZXJucyA9IFtbbnVsbCwgbnVsbF1dO1xuLy8gICAgIHRoaXMucGFsZXR0ZXMgPSBbW251bGwsIG51bGxdXTtcbi8vICAgICB0aGlzLmZseWVycyA9IDA7XG4vLyAgIH1cblxuLy8gICByZXF1aXJlVHJlYXN1cmVDaGVzdCgpIHtcbi8vICAgICB0aGlzLnJlcXVpcmVPcmRlcmVkU2xvdCgwLCBUUkVBU1VSRV9DSEVTVF9CQU5LUyk7XG4vLyAgIH1cblxuLy8gICByZXF1aXJlT3JkZXJlZFNsb3Qoc2xvdCwgc2V0KSB7XG5cbi8vICAgICBpZiAoIXRoaXMub3JkZXJlZCkge1xuXG4vLyAgICAgfVxuLy8gLy8gVE9ET1xuLy8gICAgIHRoaXMucGF0MCA9IGludGVyc2VjdCh0aGlzLnBhdDAsIHNldCk7XG5cbi8vICAgfVxuXG4vLyB9XG5cbi8vIGNvbnN0IGludGVyc2VjdCA9IChsZWZ0LCByaWdodCkgPT4ge1xuLy8gICBpZiAoIXJpZ2h0KSB0aHJvdyBuZXcgRXJyb3IoJ3JpZ2h0IG11c3QgYmUgbm9udHJpdmlhbCcpO1xuLy8gICBpZiAoIWxlZnQpIHJldHVybiByaWdodDtcbi8vICAgY29uc3Qgb3V0ID0gbmV3IFNldCgpO1xuLy8gICBmb3IgKGNvbnN0IHggb2YgbGVmdCkge1xuLy8gICAgIGlmIChyaWdodC5oYXMoeCkpIG91dC5hZGQoeCk7XG4vLyAgIH1cbi8vICAgcmV0dXJuIG91dDtcbi8vIH1cblxuaW50ZXJmYWNlIE1vbnN0ZXJDb25zdHJhaW50IHtcbiAgaWQ6IG51bWJlcjtcbiAgcGF0OiBudW1iZXI7XG4gIHBhbDI6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgcGFsMzogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICBwYXRCYW5rOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbi8vIEEgcG9vbCBvZiBtb25zdGVyIHNwYXducywgYnVpbHQgdXAgZnJvbSB0aGUgbG9jYXRpb25zIGluIHRoZSByb20uXG4vLyBQYXNzZXMgdGhyb3VnaCB0aGUgbG9jYXRpb25zIHR3aWNlLCBmaXJzdCB0byBidWlsZCBhbmQgdGhlbiB0b1xuLy8gcmVhc3NpZ24gbW9uc3RlcnMuXG5jbGFzcyBNb25zdGVyUG9vbCB7XG5cbiAgLy8gYXZhaWxhYmxlIG1vbnN0ZXJzXG4gIHJlYWRvbmx5IG1vbnN0ZXJzOiBNb25zdGVyQ29uc3RyYWludFtdID0gW107XG4gIC8vIHVzZWQgbW9uc3RlcnMgLSBhcyBhIGJhY2t1cCBpZiBubyBhdmFpbGFibGUgbW9uc3RlcnMgZml0XG4gIHJlYWRvbmx5IHVzZWQ6IE1vbnN0ZXJDb25zdHJhaW50W10gPSBbXTtcbiAgLy8gYWxsIGxvY2F0aW9uc1xuICByZWFkb25seSBsb2NhdGlvbnM6IHtsb2NhdGlvbjogTG9jYXRpb24sIHNsb3RzOiBudW1iZXJbXX1bXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcmVhZG9ubHkgZmxhZ3M6IEZsYWdTZXQsXG4gICAgICByZWFkb25seSByZXBvcnQ6IHtbbG9jOiBudW1iZXJdOiBzdHJpbmdbXSwgW2tleTogc3RyaW5nXTogKHN0cmluZ3xudW1iZXIpW119KSB7fVxuXG4gIC8vIFRPRE8gLSBtb25zdGVycyB3LyBwcm9qZWN0aWxlcyBtYXkgaGF2ZSBhIHNwZWNpZmljIGJhbmsgdGhleSBuZWVkIHRvIGFwcGVhciBpbixcbiAgLy8gc2luY2UgdGhlIHByb2plY3RpbGUgZG9lc24ndCBrbm93IHdoZXJlIGl0IGNhbWUgZnJvbS4uLj9cbiAgLy8gICAtIGZvciBub3csIGp1c3QgYXNzdW1lIGlmIGl0IGhhcyBhIGNoaWxkIHRoZW4gaXQgbXVzdCBrZWVwIHNhbWUgcGF0dGVybiBiYW5rIVxuXG4gIHBvcHVsYXRlKGxvY2F0aW9uOiBMb2NhdGlvbikge1xuICAgIGNvbnN0IHttYXhGbHllcnMgPSAwLFxuICAgICAgICAgICBub25GbHllcnMgPSB7fSxcbiAgICAgICAgICAgc2tpcCA9IGZhbHNlLFxuICAgICAgICAgICB0b3dlciA9IGZhbHNlLFxuICAgICAgICAgICBmaXhlZFNsb3RzID0ge30sXG4gICAgICAgICAgIC4uLnVuZXhwZWN0ZWR9ID0gTU9OU1RFUl9BREpVU1RNRU5UU1tsb2NhdGlvbi5pZF0gfHwge307XG4gICAgZm9yIChjb25zdCB1IG9mIE9iamVjdC5rZXlzKHVuZXhwZWN0ZWQpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFVuZXhwZWN0ZWQgcHJvcGVydHkgJyR7dX0nIGluIE1PTlNURVJfQURKVVNUTUVOVFNbJHtsb2NhdGlvbi5pZH1dYCk7XG4gICAgfVxuICAgIGNvbnN0IHNraXBNb25zdGVycyA9XG4gICAgICAgIChza2lwID09PSB0cnVlIHx8XG4gICAgICAgICAgICAoIXRoaXMuZmxhZ3Muc2h1ZmZsZVRvd2VyTW9uc3RlcnMoKSAmJiB0b3dlcikgfHxcbiAgICAgICAgICAgICFsb2NhdGlvbi5zcHJpdGVQYXR0ZXJucyB8fFxuICAgICAgICAgICAgIWxvY2F0aW9uLnNwcml0ZVBhbGV0dGVzKTtcbiAgICBjb25zdCBtb25zdGVycyA9IFtdO1xuICAgIGxldCBzbG90cyA9IFtdO1xuICAgIC8vIGNvbnN0IGNvbnN0cmFpbnRzID0ge307XG4gICAgLy8gbGV0IHRyZWFzdXJlQ2hlc3QgPSBmYWxzZTtcbiAgICBsZXQgc2xvdCA9IDB4MGM7XG4gICAgZm9yIChjb25zdCBzcGF3biBvZiBza2lwTW9uc3RlcnMgPyBbXSA6IGxvY2F0aW9uLnNwYXducykge1xuICAgICAgKytzbG90O1xuICAgICAgaWYgKCFzcGF3bi51c2VkIHx8ICFzcGF3bi5pc01vbnN0ZXIoKSkgY29udGludWU7XG4gICAgICBjb25zdCBpZCA9IHNwYXduLm1vbnN0ZXJJZDtcbiAgICAgIGlmIChpZCBpbiBVTlRPVUNIRURfTU9OU1RFUlMgfHwgIVNDQUxFRF9NT05TVEVSUy5oYXMoaWQpIHx8XG4gICAgICAgICAgU0NBTEVEX01PTlNURVJTLmdldChpZCkhLnR5cGUgIT09ICdtJykgY29udGludWU7XG4gICAgICBjb25zdCBvYmplY3QgPSBsb2NhdGlvbi5yb20ub2JqZWN0c1tpZF07XG4gICAgICBpZiAoIW9iamVjdCkgY29udGludWU7XG4gICAgICBjb25zdCBwYXRCYW5rID0gc3Bhd24ucGF0dGVybkJhbms7XG4gICAgICBjb25zdCBwYXQgPSBsb2NhdGlvbi5zcHJpdGVQYXR0ZXJuc1twYXRCYW5rXTtcbiAgICAgIGNvbnN0IHBhbCA9IG9iamVjdC5wYWxldHRlcyh0cnVlKTtcbiAgICAgIGNvbnN0IHBhbDIgPSBwYWwuaW5jbHVkZXMoMikgPyBsb2NhdGlvbi5zcHJpdGVQYWxldHRlc1swXSA6IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IHBhbDMgPSBwYWwuaW5jbHVkZXMoMykgPyBsb2NhdGlvbi5zcHJpdGVQYWxldHRlc1sxXSA6IHVuZGVmaW5lZDtcbiAgICAgIG1vbnN0ZXJzLnB1c2goe2lkLCBwYXQsIHBhbDIsIHBhbDMsIHBhdEJhbmt9KTtcbiAgICAgICh0aGlzLnJlcG9ydFtgc3RhcnQtJHtpZC50b1N0cmluZygxNil9YF0gPSB0aGlzLnJlcG9ydFtgc3RhcnQtJHtpZC50b1N0cmluZygxNil9YF0gfHwgW10pXG4gICAgICAgICAgLnB1c2goJyQnICsgbG9jYXRpb24uaWQudG9TdHJpbmcoMTYpKTtcbiAgICAgIHNsb3RzLnB1c2goc2xvdCk7XG4gICAgfVxuICAgIGlmICghbW9uc3RlcnMubGVuZ3RoIHx8IHNraXApIHNsb3RzID0gW107XG4gICAgdGhpcy5sb2NhdGlvbnMucHVzaCh7bG9jYXRpb24sIHNsb3RzfSk7XG4gICAgdGhpcy5tb25zdGVycy5wdXNoKC4uLm1vbnN0ZXJzKTtcbiAgfVxuXG4gIHNodWZmbGUocmFuZG9tOiBSYW5kb20sIGdyYXBoaWNzOiBHcmFwaGljcykge1xuICAgIHRoaXMucmVwb3J0WydwcmUtc2h1ZmZsZSBsb2NhdGlvbnMnXSA9IHRoaXMubG9jYXRpb25zLm1hcChsID0+IGwubG9jYXRpb24uaWQpO1xuICAgIHRoaXMucmVwb3J0WydwcmUtc2h1ZmZsZSBtb25zdGVycyddID0gdGhpcy5tb25zdGVycy5tYXAobSA9PiBtLmlkKTtcbiAgICByYW5kb20uc2h1ZmZsZSh0aGlzLmxvY2F0aW9ucyk7XG4gICAgcmFuZG9tLnNodWZmbGUodGhpcy5tb25zdGVycyk7XG4gICAgdGhpcy5yZXBvcnRbJ3Bvc3Qtc2h1ZmZsZSBsb2NhdGlvbnMnXSA9IHRoaXMubG9jYXRpb25zLm1hcChsID0+IGwubG9jYXRpb24uaWQpO1xuICAgIHRoaXMucmVwb3J0Wydwb3N0LXNodWZmbGUgbW9uc3RlcnMnXSA9IHRoaXMubW9uc3RlcnMubWFwKG0gPT4gbS5pZCk7XG4gICAgd2hpbGUgKHRoaXMubG9jYXRpb25zLmxlbmd0aCkge1xuICAgICAgY29uc3Qge2xvY2F0aW9uLCBzbG90c30gPSB0aGlzLmxvY2F0aW9ucy5wb3AoKSE7XG4gICAgICBjb25zdCByZXBvcnQ6IHN0cmluZ1tdID0gdGhpcy5yZXBvcnRbJyQnICsgbG9jYXRpb24uaWQudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJyldID0gW107XG4gICAgICBjb25zdCB7bWF4Rmx5ZXJzID0gMCwgbm9uRmx5ZXJzID0ge30sIHRvd2VyID0gZmFsc2V9ID1cbiAgICAgICAgICAgIE1PTlNURVJfQURKVVNUTUVOVFNbbG9jYXRpb24uaWRdIHx8IHt9O1xuICAgICAgaWYgKHRvd2VyKSBjb250aW51ZTtcbiAgICAgIGxldCBmbHllcnMgPSBtYXhGbHllcnM7IC8vIGNvdW50IGRvd24uLi5cblxuICAgICAgLy8gRGV0ZXJtaW5lIGxvY2F0aW9uIGNvbnN0cmFpbnRzXG4gICAgICBsZXQgY29uc3RyYWludCA9IENvbnN0cmFpbnQuZm9yTG9jYXRpb24obG9jYXRpb24uaWQpO1xuICAgICAgaWYgKGxvY2F0aW9uLmJvc3NJZCgpICE9IG51bGwpIHtcbiAgICAgICAgLy8gTm90ZSB0aGF0IGJvc3NlcyBhbHdheXMgbGVhdmUgY2hlc3RzLlxuICAgICAgICAvLyBUT0RPIC0gaXQncyBwb3NzaWJsZSB0aGlzIGlzIG91dCBvZiBvcmRlciB3LnIudC4gd3JpdGluZyB0aGUgYm9zcz9cbiAgICAgICAgLy8gICAgY29uc3RyYWludCA9IGNvbnN0cmFpbnQubWVldChDb25zdHJhaW50LkJPU1MsIHRydWUpO1xuICAgICAgICAvLyBOT1RFOiB0aGlzIGRvZXMgbm90IHdvcmsgZm9yIChlLmcuKSBtYWRvIDEsIHdoZXJlIGF6dGVjYSByZXF1aXJlc1xuICAgICAgICAvLyA1MyB3aGljaCBpcyBub3QgYSBjb21wYXRpYmxlIGNoZXN0IHBhZ2UuXG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHNwYXduIG9mIGxvY2F0aW9uLnNwYXducykge1xuICAgICAgICBpZiAoc3Bhd24uaXNDaGVzdCgpICYmICFzcGF3bi5pc0ludmlzaWJsZSgpKSB7XG4gICAgICAgICAgaWYgKHNwYXduLmlkIDwgMHg3MCkge1xuICAgICAgICAgICAgY29uc3RyYWludCA9IGNvbnN0cmFpbnQubWVldChDb25zdHJhaW50LlRSRUFTVVJFX0NIRVNULCB0cnVlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3RyYWludCA9IGNvbnN0cmFpbnQubWVldChDb25zdHJhaW50Lk1JTUlDLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3Bhd24uaXNOcGMoKSB8fCBzcGF3bi5pc0Jvc3MoKSkge1xuICAgICAgICAgIGNvbnN0IGMgPSBncmFwaGljcy5nZXROcGNDb25zdHJhaW50KGxvY2F0aW9uLmlkLCBzcGF3bi5pZCk7XG4gICAgICAgICAgY29uc3RyYWludCA9IGNvbnN0cmFpbnQubWVldChjLCB0cnVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChzcGF3bi5pc01vbnN0ZXIoKSAmJiBVTlRPVUNIRURfTU9OU1RFUlNbc3Bhd24ubW9uc3RlcklkXSkge1xuICAgICAgICAgIGNvbnN0IGMgPSBncmFwaGljcy5nZXRNb25zdGVyQ29uc3RyYWludChsb2NhdGlvbi5pZCwgc3Bhd24ubW9uc3RlcklkKTtcbiAgICAgICAgICBjb25zdHJhaW50ID0gY29uc3RyYWludC5tZWV0KGMsIHRydWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJlcG9ydC5wdXNoKGBJbml0aWFsIHBhc3M6ICR7Y29uc3RyYWludC5maXhlZC5tYXAocz0+cy5zaXplPEluZmluaXR5PydbJytbLi4uc10uam9pbignLCAnKSsnXSc6J2FsbCcpfWApO1xuXG4gICAgICBjb25zdCBjbGFzc2VzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICAgIGNvbnN0IHRyeUFkZE1vbnN0ZXIgPSAobTogTW9uc3RlckNvbnN0cmFpbnQpID0+IHtcbiAgICAgICAgY29uc3QgbW9uc3RlciA9IGxvY2F0aW9uLnJvbS5vYmplY3RzW20uaWRdIGFzIE1vbnN0ZXI7XG4gICAgICAgIGlmIChtb25zdGVyLm1vbnN0ZXJDbGFzcykge1xuICAgICAgICAgIGNvbnN0IHJlcHJlc2VudGF0aXZlID0gY2xhc3Nlcy5nZXQobW9uc3Rlci5tb25zdGVyQ2xhc3MpO1xuICAgICAgICAgIGlmIChyZXByZXNlbnRhdGl2ZSAhPSBudWxsICYmIHJlcHJlc2VudGF0aXZlICE9PSBtLmlkKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmx5ZXIgPSBGTFlFUlMuaGFzKG0uaWQpO1xuICAgICAgICBjb25zdCBtb3RoID0gTU9USFNfQU5EX0JBVFMuaGFzKG0uaWQpO1xuICAgICAgICBpZiAoZmx5ZXIpIHtcbiAgICAgICAgICAvLyBUT0RPIC0gYWRkIGEgc21hbGwgcHJvYmFiaWxpdHkgb2YgYWRkaW5nIGl0IGFueXdheSwgbWF5YmVcbiAgICAgICAgICAvLyBiYXNlZCBvbiB0aGUgbWFwIGFyZWE/ICAyNSBzZWVtcyBhIGdvb2QgdGhyZXNob2xkLlxuICAgICAgICAgIGlmICghZmx5ZXJzKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgLS1mbHllcnM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYyA9IGdyYXBoaWNzLmdldE1vbnN0ZXJDb25zdHJhaW50KGxvY2F0aW9uLmlkLCBtLmlkKTtcbiAgICAgICAgbGV0IG1lZXQgPSBjb25zdHJhaW50LnRyeU1lZXQoYyk7XG4gICAgICAgIGlmICghbWVldCAmJiBjb25zdHJhaW50LnBhbDIuc2l6ZSA8IEluZmluaXR5ICYmIGNvbnN0cmFpbnQucGFsMy5zaXplIDwgSW5maW5pdHkpIHtcbiAgICAgICAgICBpZiAodGhpcy5mbGFncy5zaHVmZmxlU3ByaXRlUGFsZXR0ZXMoKSkge1xuICAgICAgICAgICAgbWVldCA9IGNvbnN0cmFpbnQudHJ5TWVldChjLCB0cnVlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFtZWV0KSByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgLy8gRmlndXJlIG91dCBlYXJseSBpZiB0aGUgbW9uc3RlciBpcyBwbGFjZWFibGUuXG4gICAgICAgIGxldCBwb3M6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKG1vbnN0ZXJQbGFjZXIpIHtcbiAgICAgICAgICBjb25zdCBtb25zdGVyID0gbG9jYXRpb24ucm9tLm9iamVjdHNbbS5pZF07XG4gICAgICAgICAgaWYgKCEobW9uc3RlciBpbnN0YW5jZW9mIE1vbnN0ZXIpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYG5vbi1tb25zdGVyOiAke21vbnN0ZXJ9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHBvcyA9IG1vbnN0ZXJQbGFjZXIobW9uc3Rlcik7XG4gICAgICAgICAgaWYgKHBvcyA9PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICByZXBvcnQucHVzaChgICBBZGRpbmcgJHttLmlkLnRvU3RyaW5nKDE2KX06ICR7bWVldH1gKTtcbiAgICAgICAgY29uc3RyYWludCA9IG1lZXQ7XG5cbiAgICAgICAgLy8gUGljayB0aGUgc2xvdCBvbmx5IGFmdGVyIHdlIGtub3cgZm9yIHN1cmUgdGhhdCBpdCB3aWxsIGZpdC5cbiAgICAgICAgaWYgKG1vbnN0ZXIubW9uc3RlckNsYXNzKSBjbGFzc2VzLnNldChtb25zdGVyLm1vbnN0ZXJDbGFzcywgbS5pZClcbiAgICAgICAgbGV0IGVsaWdpYmxlID0gMDtcbiAgICAgICAgaWYgKGZseWVyIHx8IG1vdGgpIHtcbiAgICAgICAgICAvLyBsb29rIGZvciBhIGZseWVyIHNsb3QgaWYgcG9zc2libGUuXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzbG90cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNsb3RzW2ldIGluIG5vbkZseWVycykge1xuICAgICAgICAgICAgICBlbGlnaWJsZSA9IGk7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBQcmVmZXIgbm9uLWZseWVyIHNsb3RzLCBidXQgYWRqdXN0IGlmIHdlIGdldCBhIGZseWVyLlxuICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2xvdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzbG90c1tpXSBpbiBub25GbHllcnMpIGNvbnRpbnVlO1xuICAgICAgICAgICAgZWxpZ2libGUgPSBpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgICh0aGlzLnJlcG9ydFtgbW9uLSR7bS5pZC50b1N0cmluZygxNil9YF0gPSB0aGlzLnJlcG9ydFtgbW9uLSR7bS5pZC50b1N0cmluZygxNil9YF0gfHwgW10pXG4gICAgICAgICAgICAucHVzaCgnJCcgKyBsb2NhdGlvbi5pZC50b1N0cmluZygxNikpO1xuICAgICAgICBjb25zdCBzbG90ID0gc2xvdHNbZWxpZ2libGVdO1xuICAgICAgICBjb25zdCBzcGF3biA9IGxvY2F0aW9uLnNwYXduc1tzbG90IC0gMHgwZF07XG4gICAgICAgIGlmIChtb25zdGVyUGxhY2VyKSB7IC8vIHBvcyA9PSBudWxsIHJldHVybmVkIGZhbHNlIGVhcmxpZXJcbiAgICAgICAgICBzcGF3bi5zY3JlZW4gPSBwb3MhID4+PiA4O1xuICAgICAgICAgIHNwYXduLnRpbGUgPSBwb3MhICYgMHhmZjtcbiAgICAgICAgfSBlbHNlIGlmIChzbG90IGluIG5vbkZseWVycykge1xuICAgICAgICAgIHNwYXduLnkgKz0gbm9uRmx5ZXJzW3Nsb3RdWzBdICogMTY7XG4gICAgICAgICAgc3Bhd24ueCArPSBub25GbHllcnNbc2xvdF1bMV0gKiAxNjtcbiAgICAgICAgfVxuICAgICAgICBzcGF3bi5tb25zdGVySWQgPSBtLmlkO1xuICAgICAgICByZXBvcnQucHVzaChgICAgIHNsb3QgJHtzbG90LnRvU3RyaW5nKDE2KX06ICR7c3Bhd259YCk7XG5cbiAgICAgICAgLy8gVE9ETyAtIGFueXRoaW5nIGVsc2UgbmVlZCBzcGxpY2luZz9cblxuICAgICAgICBzbG90cy5zcGxpY2UoZWxpZ2libGUsIDEpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH07XG5cbiAgICAgIC8vIEZvciBlYWNoIGxvY2F0aW9uLi4uLiB0cnkgdG8gZmlsbCB1cCB0aGUgc2xvdHNcbiAgICAgIGNvbnN0IG1vbnN0ZXJQbGFjZXIgPVxuICAgICAgICAgIHNsb3RzLmxlbmd0aCAmJiB0aGlzLmZsYWdzLnJhbmRvbWl6ZU1hcHMoKSA/XG4gICAgICAgICAgICAgIGxvY2F0aW9uLm1vbnN0ZXJQbGFjZXIocmFuZG9tKSA6IG51bGw7XG5cbiAgICAgIGlmIChmbHllcnMgJiYgc2xvdHMubGVuZ3RoKSB7XG4gICAgICAgIC8vIGxvb2sgZm9yIGFuIGVsaWdpYmxlIGZseWVyIGluIHRoZSBmaXJzdCA0MC4gIElmIGl0J3MgdGhlcmUsIGFkZCBpdCBmaXJzdC5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbig0MCwgdGhpcy5tb25zdGVycy5sZW5ndGgpOyBpKyspIHtcbiAgICAgICAgICBpZiAoRkxZRVJTLmhhcyh0aGlzLm1vbnN0ZXJzW2ldLmlkKSkge1xuICAgICAgICAgICAgaWYgKHRyeUFkZE1vbnN0ZXIodGhpcy5tb25zdGVyc1tpXSkpIHtcbiAgICAgICAgICAgICAgdGhpcy5tb25zdGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIHJhbmRvbS5zaHVmZmxlKHRoaXMubW9uc3RlcnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gbWF5YmUgYWRkZWQgYSBzaW5nbGUgZmx5ZXIsIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBydW4gb3V0LiAgTm93IGp1c3Qgd29yayBub3JtYWxseVxuXG4gICAgICAgIC8vIGRlY2lkZSBpZiB3ZSdyZSBnb2luZyB0byBhZGQgYW55IGZseWVycy5cblxuICAgICAgICAvLyBhbHNvIGNvbnNpZGVyIGFsbG93aW5nIGEgc2luZ2xlIHJhbmRvbSBmbHllciB0byBiZSBhZGRlZCBvdXQgb2YgYmFuZCBpZlxuICAgICAgICAvLyB0aGUgc2l6ZSBvZiB0aGUgbWFwIGV4Y2VlZHMgMjU/XG5cbiAgICAgICAgLy8gcHJvYmFibHkgZG9uJ3QgYWRkIGZseWVycyB0byB1c2VkP1xuXG4gICAgICB9XG5cbiAgICAgIC8vIGl0ZXJhdGUgb3ZlciBtb25zdGVycyB1bnRpbCB3ZSBmaW5kIG9uZSB0aGF0J3MgYWxsb3dlZC4uLlxuICAgICAgLy8gTk9URTogZmlsbCB0aGUgbm9uLWZseWVyIHNsb3RzIGZpcnN0IChleGNlcHQgaWYgd2UgcGljayBhIGZseWVyPz8pXG4gICAgICAvLyAgIC0gbWF5IG5lZWQgdG8gd2VpZ2h0IGZseWVycyBzbGlnaHRseSBoaWdoZXIgb3IgZmlsbCB0aGVtIGRpZmZlcmVudGx5P1xuICAgICAgLy8gICAgIG90aGVyd2lzZSB3ZSdsbCBsaWtlbHkgbm90IGdldCB0aGVtIHdoZW4gd2UncmUgYWxsb3dlZC4uLj9cbiAgICAgIC8vICAgLSBvciBqdXN0IGRvIHRoZSBub24tZmx5ZXIgKmxvY2F0aW9ucyogZmlyc3Q/XG4gICAgICAvLyAtIG9yIGp1c3QgZmlsbCB1cCBmbHllcnMgdW50aWwgd2UgcnVuIG91dC4uLiAxMDAlIGNoYW5jZSBvZiBmaXJzdCBmbHllcixcbiAgICAgIC8vICAgNTAlIGNoYW5jZSBvZiBnZXR0aW5nIGEgc2Vjb25kIGZseWVyIGlmIGFsbG93ZWQuLi5cbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5tb25zdGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIXNsb3RzLmxlbmd0aCkgYnJlYWs7XG4gICAgICAgIGlmICh0cnlBZGRNb25zdGVyKHRoaXMubW9uc3RlcnNbaV0pKSB7XG4gICAgICAgICAgY29uc3QgW3VzZWRdID0gdGhpcy5tb25zdGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgaWYgKCFGTFlFUlMuaGFzKHVzZWQuaWQpKSB0aGlzLnVzZWQucHVzaCh1c2VkKTtcbiAgICAgICAgICBpLS07XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gYmFja3VwIGxpc3RcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy51c2VkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICghc2xvdHMubGVuZ3RoKSBicmVhaztcbiAgICAgICAgaWYgKHRyeUFkZE1vbnN0ZXIodGhpcy51c2VkW2ldKSkge1xuICAgICAgICAgIHRoaXMudXNlZC5wdXNoKC4uLnRoaXMudXNlZC5zcGxpY2UoaSwgMSkpO1xuICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgY29uc3RyYWludC5maXgobG9jYXRpb24sIHJhbmRvbSk7XG5cbiAgICAgIGlmIChzbG90cy5sZW5ndGgpIHtcbiAgICAgICAgY29uc29sZS5lcnJvci8qcmVwb3J0LnB1c2gqLyhgRmFpbGVkIHRvIGZpbGwgbG9jYXRpb24gJHtsb2NhdGlvbi5pZC50b1N0cmluZygxNil9OiAke3Nsb3RzLmxlbmd0aH0gcmVtYWluaW5nYCk7XG4gICAgICAgIGZvciAoY29uc3Qgc2xvdCBvZiBzbG90cykge1xuICAgICAgICAgIGNvbnN0IHNwYXduID0gbG9jYXRpb24uc3Bhd25zW3Nsb3QgLSAweDBkXTtcbiAgICAgICAgICBzcGF3bi54ID0gc3Bhd24ueSA9IDA7XG4gICAgICAgICAgc3Bhd24uaWQgPSAweGIwO1xuICAgICAgICAgIHNwYXduLmRhdGFbMF0gPSAweGZlOyAvLyBpbmRpY2F0ZSB1bnVzZWRcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChjb25zdCBzcGF3biBvZiBsb2NhdGlvbi5zcGF3bnMpIHtcbiAgICAgICAgZ3JhcGhpY3MuY29uZmlndXJlKGxvY2F0aW9uLCBzcGF3bik7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IEZMWUVSUzogU2V0PG51bWJlcj4gPSBuZXcgU2V0KFsweDU5LCAweDVjLCAweDZlLCAweDZmLCAweDgxLCAweDhhLCAweGEzLCAweGM0XSk7XG5jb25zdCBNT1RIU19BTkRfQkFUUzogU2V0PG51bWJlcj4gPSBuZXcgU2V0KFsweDU1LCAvKiBzd2FtcCBwbGFudCAqLyAweDVkLCAweDdjLCAweGJjLCAweGMxXSk7XG4vLyBjb25zdCBTV0lNTUVSUzogU2V0PG51bWJlcj4gPSBuZXcgU2V0KFsweDc1LCAweDc2XSk7XG4vLyBjb25zdCBTVEFUSU9OQVJZOiBTZXQ8bnVtYmVyPiA9IG5ldyBTZXQoWzB4NzcsIDB4ODddKTsgIC8vIGtyYWtlbiwgc29yY2Vyb3JcblxuaW50ZXJmYWNlIE1vbnN0ZXJBZGp1c3RtZW50IHtcbiAgbWF4Rmx5ZXJzPzogbnVtYmVyO1xuICBza2lwPzogYm9vbGVhbjtcbiAgdG93ZXI/OiBib29sZWFuO1xuICBmaXhlZFNsb3RzPzoge3BhdDA/OiBudW1iZXIsIHBhdDE/OiBudW1iZXIsIHBhbDI/OiBudW1iZXIsIHBhbDM/OiBudW1iZXJ9O1xuICBub25GbHllcnM/OiB7W2lkOiBudW1iZXJdOiBbbnVtYmVyLCBudW1iZXJdfTtcbn1cbmNvbnN0IE1PTlNURVJfQURKVVNUTUVOVFM6IHtbbG9jOiBudW1iZXJdOiBNb25zdGVyQWRqdXN0bWVudH0gPSB7XG4gIFsweDAzXTogeyAvLyBWYWxsZXkgb2YgV2luZFxuICAgIGZpeGVkU2xvdHM6IHtcbiAgICAgIHBhdDE6IDB4NjAsIC8vIHJlcXVpcmVkIGJ5IHdpbmRtaWxsXG4gICAgfSxcbiAgICBtYXhGbHllcnM6IDIsXG4gIH0sXG4gIFsweDA3XTogeyAvLyBTZWFsZWQgQ2F2ZSA0XG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgwZl06IFswLCAtM10sICAvLyBiYXRcbiAgICAgIFsweDEwXTogWy0xMCwgMF0sIC8vIGJhdFxuICAgICAgWzB4MTFdOiBbMCwgNF0sICAgLy8gYmF0XG4gICAgfSxcbiAgfSxcbiAgWzB4MTRdOiB7IC8vIENvcmRlbCBXZXN0XG4gICAgbWF4Rmx5ZXJzOiAyLFxuICB9LFxuICBbMHgxNV06IHsgLy8gQ29yZGVsIEVhc3RcbiAgICBtYXhGbHllcnM6IDIsXG4gIH0sXG4gIFsweDFhXTogeyAvLyBTd2FtcFxuICAgIC8vIHNraXA6ICdhZGQnLFxuICAgIGZpeGVkU2xvdHM6IHtcbiAgICAgIHBhbDM6IDB4MjMsXG4gICAgICBwYXQxOiAweDRmLFxuICAgIH0sXG4gICAgbWF4Rmx5ZXJzOiAyLFxuICAgIG5vbkZseWVyczogeyAvLyBUT0RPIC0gbWlnaHQgYmUgbmljZSB0byBrZWVwIHB1ZmZzIHdvcmtpbmc/XG4gICAgICBbMHgxMF06IFs0LCAwXSxcbiAgICAgIFsweDExXTogWzUsIDBdLFxuICAgICAgWzB4MTJdOiBbNCwgMF0sXG4gICAgICBbMHgxM106IFs1LCAwXSxcbiAgICAgIFsweDE0XTogWzQsIDBdLFxuICAgICAgWzB4MTVdOiBbNCwgMF0sXG4gICAgfSxcbiAgfSxcbiAgWzB4MWJdOiB7IC8vIEFtYXpvbmVzXG4gICAgLy8gUmFuZG9tIGJsdWUgc2xpbWUgc2hvdWxkIGJlIGlnbm9yZWRcbiAgICBza2lwOiB0cnVlLFxuICB9LFxuICBbMHgyMF06IHsgLy8gTXQgU2FicmUgV2VzdCBMb3dlclxuICAgIG1heEZseWVyczogMSxcbiAgfSxcbiAgWzB4MjFdOiB7IC8vIE10IFNhYnJlIFdlc3QgVXBwZXJcbiAgICBmaXhlZFNsb3RzOiB7XG4gICAgICBwYXQxOiAweDUwLFxuICAgICAgLy8gcGFsMjogMHgwNiwgLy8gbWlnaHQgYmUgZmluZSB0byBjaGFuZ2UgdG9ybmVsJ3MgY29sb3IuLi5cbiAgICB9LFxuICAgIG1heEZseWVyczogMSxcbiAgfSxcbiAgWzB4MjddOiB7IC8vIE10IFNhYnJlIFdlc3QgQ2F2ZSA3XG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgwZF06IFswLCAweDEwXSwgLy8gcmFuZG9tIGVuZW15IHN0dWNrIGluIHdhbGxcbiAgICB9LFxuICB9LFxuICBbMHgyOF06IHsgLy8gTXQgU2FicmUgTm9ydGggTWFpblxuICAgIG1heEZseWVyczogMSxcbiAgfSxcbiAgWzB4MjldOiB7IC8vIE10IFNhYnJlIE5vcnRoIE1pZGRsZVxuICAgIG1heEZseWVyczogMSxcbiAgfSxcbiAgWzB4MmJdOiB7IC8vIE10IFNhYnJlIE5vcnRoIENhdmUgMlxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTRdOiBbMHgyMCwgLThdLCAvLyBiYXRcbiAgICB9LFxuICB9LFxuICBbMHg0MF06IHsgLy8gV2F0ZXJmYWxsIFZhbGxleSBOb3J0aFxuICAgIG1heEZseWVyczogMixcbiAgICBub25GbHllcnM6IHtcbiAgICAgIFsweDEzXTogWzEyLCAtMHgxMF0sIC8vIG1lZHVzYSBoZWFkXG4gICAgfSxcbiAgfSxcbiAgWzB4NDFdOiB7IC8vIFdhdGVyZmFsbCBWYWxsZXkgU291dGhcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxNV06IFswLCAtNl0sIC8vIG1lZHVzYSBoZWFkXG4gICAgfSxcbiAgfSxcbiAgWzB4NDJdOiB7IC8vIExpbWUgVHJlZSBWYWxsZXlcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgwZF06IFswLCA4XSwgLy8gZXZpbCBiaXJkXG4gICAgICBbMHgwZV06IFstOCwgOF0sIC8vIGV2aWwgYmlyZFxuICAgIH0sXG4gIH0sXG4gIFsweDQ3XTogeyAvLyBLaXJpc2EgTWVhZG93XG4gICAgbWF4Rmx5ZXJzOiAxLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MGRdOiBbLTgsIC04XSxcbiAgICB9LFxuICB9LFxuICBbMHg0YV06IHsgLy8gRm9nIExhbXAgQ2F2ZSAzXG4gICAgbWF4Rmx5ZXJzOiAxLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MGVdOiBbNCwgMF0sICAvLyBiYXRcbiAgICAgIFsweDBmXTogWzAsIC0zXSwgLy8gYmF0XG4gICAgICBbMHgxMF06IFswLCA0XSwgIC8vIGJhdFxuICAgIH0sXG4gIH0sXG4gIFsweDRjXTogeyAvLyBGb2cgTGFtcCBDYXZlIDRcbiAgICAvLyBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDRkXTogeyAvLyBGb2cgTGFtcCBDYXZlIDVcbiAgICBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDRlXTogeyAvLyBGb2cgTGFtcCBDYXZlIDZcbiAgICBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDRmXTogeyAvLyBGb2cgTGFtcCBDYXZlIDdcbiAgICAvLyBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDU3XTogeyAvLyBXYXRlcmZhbGwgQ2F2ZSA0XG4gICAgZml4ZWRTbG90czoge1xuICAgICAgcGF0MTogMHg0ZCxcbiAgICB9LFxuICB9LFxuICBbMHg1OV06IHsgLy8gVG93ZXIgRmxvb3IgMVxuICAgIC8vIHNraXA6IHRydWUsXG4gICAgdG93ZXI6IHRydWUsXG4gIH0sXG4gIFsweDVhXTogeyAvLyBUb3dlciBGbG9vciAyXG4gICAgLy8gc2tpcDogdHJ1ZSxcbiAgICB0b3dlcjogdHJ1ZSxcbiAgfSxcbiAgWzB4NWJdOiB7IC8vIFRvd2VyIEZsb29yIDNcbiAgICAvLyBza2lwOiB0cnVlLFxuICAgIHRvd2VyOiB0cnVlLFxuICB9LFxuICBbMHg2MF06IHsgLy8gQW5ncnkgU2VhXG4gICAgZml4ZWRTbG90czoge1xuICAgICAgcGFsMzogMHgwOCxcbiAgICAgIHBhdDE6IDB4NTIsIC8vIChhcyBvcHBvc2VkIHRvIHBhdDApXG4gICAgfSxcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgc2tpcDogdHJ1ZSwgLy8gbm90IHN1cmUgaG93IHRvIHJhbmRvbWl6ZSB0aGVzZSB3ZWxsXG4gIH0sXG4gIFsweDY0XTogeyAvLyBVbmRlcmdyb3VuZCBDaGFubmVsXG4gICAgZml4ZWRTbG90czoge1xuICAgICAgcGFsMzogMHgwOCxcbiAgICAgIHBhdDE6IDB4NTIsIC8vIChhcyBvcHBvc2VkIHRvIHBhdDApXG4gICAgfSxcbiAgICBza2lwOiB0cnVlLFxuICB9LFxuICBbMHg2OF06IHsgLy8gRXZpbCBTcGlyaXQgSXNsYW5kIDFcbiAgICBmaXhlZFNsb3RzOiB7XG4gICAgICBwYWwzOiAweDA4LFxuICAgICAgcGF0MTogMHg1MiwgLy8gKGFzIG9wcG9zZWQgdG8gcGF0MClcbiAgICB9LFxuICAgIHNraXA6IHRydWUsXG4gIH0sXG4gIFsweDY5XTogeyAvLyBFdmlsIFNwaXJpdCBJc2xhbmQgMlxuICAgIG1heEZseWVyczogMSxcbiAgICBub25GbHllcnM6IHtcbiAgICAgIFsweDE3XTogWzQsIDZdLCAgLy8gbWVkdXNhIGhlYWRcbiAgICB9LFxuICB9LFxuICBbMHg2YV06IHsgLy8gRXZpbCBTcGlyaXQgSXNsYW5kIDNcbiAgICBtYXhGbHllcnM6IDEsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxNV06IFswLCAweDE4XSwgIC8vIG1lZHVzYSBoZWFkXG4gICAgfSxcbiAgfSxcbiAgWzB4NmNdOiB7IC8vIFNhYmVyYSBQYWxhY2UgMVxuICAgIG1heEZseWVyczogMSxcbiAgICBub25GbHllcnM6IHtcbiAgICAgIFsweDE3XTogWzAsIDB4MThdLCAvLyBldmlsIGJpcmRcbiAgICB9LFxuICB9LFxuICBbMHg2ZF06IHsgLy8gU2FiZXJhIFBhbGFjZSAyXG4gICAgbWF4Rmx5ZXJzOiAxLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTFdOiBbMHgxMCwgMF0sIC8vIG1vdGhcbiAgICAgIFsweDFiXTogWzAsIDBdLCAgICAvLyBtb3RoIC0gb2sgYWxyZWFkeVxuICAgICAgWzB4MWNdOiBbNiwgMF0sICAgIC8vIG1vdGhcbiAgICB9LFxuICB9LFxuICBbMHg3OF06IHsgLy8gR29hIFZhbGxleVxuICAgIG1heEZseWVyczogMSxcbiAgICBub25GbHllcnM6IHtcbiAgICAgIFsweDE2XTogWy04LCAtOF0sIC8vIGV2aWwgYmlyZFxuICAgIH0sXG4gIH0sXG4gIFsweDdjXTogeyAvLyBNdCBIeWRyYVxuICAgIG1heEZseWVyczogMSxcbiAgICBub25GbHllcnM6IHtcbiAgICAgIFsweDE1XTogWy0weDI3LCAweDU0XSwgLy8gZXZpbCBiaXJkXG4gICAgfSxcbiAgfSxcbiAgWzB4ODRdOiB7IC8vIE10IEh5ZHJhIENhdmUgN1xuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTJdOiBbMCwgLTRdLFxuICAgICAgWzB4MTNdOiBbMCwgNF0sXG4gICAgICBbMHgxNF06IFstNiwgMF0sXG4gICAgICBbMHgxNV06IFsxNCwgMTJdLFxuICAgIH0sXG4gIH0sXG4gIFsweDg4XTogeyAvLyBTdHl4IDFcbiAgICBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDg5XTogeyAvLyBTdHl4IDJcbiAgICBtYXhGbHllcnM6IDEsXG4gIH0sXG4gIFsweDhhXTogeyAvLyBTdHl4IDFcbiAgICBtYXhGbHllcnM6IDEsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgwZF06IFs3LCAwXSwgLy8gbW90aFxuICAgICAgWzB4MGVdOiBbMCwgMF0sIC8vIG1vdGggLSBva1xuICAgICAgWzB4MGZdOiBbNywgM10sIC8vIG1vdGhcbiAgICAgIFsweDEwXTogWzAsIDZdLCAvLyBtb3RoXG4gICAgICBbMHgxMV06IFsxMSwgLTB4MTBdLCAvLyBtb3RoXG4gICAgfSxcbiAgfSxcbiAgWzB4OGZdOiB7IC8vIEdvYSBGb3J0cmVzcyAtIE9hc2lzIENhdmUgRW50cmFuY2VcbiAgICBza2lwOiB0cnVlLFxuICB9LFxuICBbMHg5MF06IHsgLy8gRGVzZXJ0IDFcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxNF06IFstMHhiLCAtM10sIC8vIGJvbWJlciBiaXJkXG4gICAgICBbMHgxNV06IFswLCAweDEwXSwgIC8vIGJvbWJlciBiaXJkXG4gICAgfSxcbiAgfSxcbiAgWzB4OTFdOiB7IC8vIE9hc2lzIENhdmVcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxOF06IFswLCAxNF0sICAgIC8vIGluc2VjdFxuICAgICAgWzB4MTldOiBbNCwgLTB4MTBdLCAvLyBpbnNlY3RcbiAgICB9LFxuICB9LFxuICBbMHg5OF06IHsgLy8gRGVzZXJ0IDJcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxNF06IFstNiwgNl0sICAgIC8vIGRldmlsXG4gICAgICBbMHgxNV06IFswLCAtMHgxMF0sIC8vIGRldmlsXG4gICAgfSxcbiAgfSxcbiAgWzB4OWVdOiB7IC8vIFB5cmFtaWQgRnJvbnQgLSBNYWluXG4gICAgbWF4Rmx5ZXJzOiAyLFxuICB9LFxuICBbMHhhMl06IHsgLy8gUHlyYW1pZCBCYWNrIC0gQnJhbmNoXG4gICAgbWF4Rmx5ZXJzOiAxLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTJdOiBbMCwgMTFdLCAvLyBtb3RoXG4gICAgICBbMHgxM106IFs2LCAwXSwgIC8vIG1vdGhcbiAgICB9LFxuICB9LFxuICBbMHhhNV06IHsgLy8gUHlyYW1pZCBCYWNrIC0gSGFsbCAyXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxN106IFs2LCA2XSwgICAvLyBtb3RoXG4gICAgICBbMHgxOF06IFstNiwgMF0sICAvLyBtb3RoXG4gICAgICBbMHgxOV06IFstMSwgLTddLCAvLyBtb3RoXG4gICAgfSxcbiAgfSxcbiAgWzB4YTZdOiB7IC8vIERyYXlnb24gMlxuICAgIC8vIEhhcyBhIGZldyBibHVlIHNsaW1lcyB0aGF0IGFyZW4ndCByZWFsIGFuZCBzaG91bGQgYmUgaWdub3JlZC5cbiAgICBza2lwOiB0cnVlLFxuICB9LFxuICBbMHhhOF06IHsgLy8gR29hIEZvcnRyZXNzIC0gRW50cmFuY2VcbiAgICBza2lwOiB0cnVlLFxuICB9LFxuICBbMHhhOV06IHsgLy8gR29hIEZvcnRyZXNzIC0gS2VsYmVzcXVlXG4gICAgbWF4Rmx5ZXJzOiAyLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTZdOiBbMHgxYSwgLTB4MTBdLCAvLyBkZXZpbFxuICAgICAgWzB4MTddOiBbMCwgMHgyMF0sICAgICAvLyBkZXZpbFxuICAgIH0sXG4gIH0sXG4gIFsweGFiXTogeyAvLyBHb2EgRm9ydHJlc3MgLSBTYWJlcmFcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgwZF06IFsxLCAwXSwgIC8vIGluc2VjdFxuICAgICAgWzB4MGVdOiBbMiwgLTJdLCAvLyBpbnNlY3RcbiAgICB9LFxuICB9LFxuXG4gIFsweGFkXTogeyAvLyBHb2EgRm9ydHJlc3MgLSBNYWRvIDFcbiAgICBtYXhGbHllcnM6IDIsXG4gICAgbm9uRmx5ZXJzOiB7XG4gICAgICBbMHgxOF06IFswLCA4XSwgIC8vIGRldmlsXG4gICAgICBbMHgxOV06IFswLCAtOF0sIC8vIGRldmlsXG4gICAgfSxcbiAgfSxcbiAgWzB4YWZdOiB7IC8vIEdvYSBGb3J0cmVzcyAtIE1hZG8gM1xuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MGRdOiBbMCwgMF0sICAvLyBtb3RoIC0gb2tcbiAgICAgIFsweDBlXTogWzAsIDBdLCAgLy8gYnJva2VuIC0gYnV0IHJlcGxhY2U/XG4gICAgICBbMHgxM106IFsweDNiLCAtMHgyNl0sIC8vIHNoYWRvdyAtIGVtYmVkZGVkIGluIHdhbGxcbiAgICAgIC8vIFRPRE8gLSAweDBlIGdsaXRjaGVkLCBkb24ndCByYW5kb21pemVcbiAgICB9LFxuICB9LFxuICBbMHhiNF06IHsgLy8gR29hIEZvcnRyZXNzIC0gS2FybWluZSA1XG4gICAgbWF4Rmx5ZXJzOiAyLFxuICAgIG5vbkZseWVyczoge1xuICAgICAgWzB4MTFdOiBbNiwgMF0sICAvLyBtb3RoXG4gICAgICBbMHgxMl06IFswLCA2XSwgIC8vIG1vdGhcbiAgICB9LFxuICB9LFxuICBbMHhkN106IHsgLy8gUG9ydG9hIFBhbGFjZSAtIEVudHJ5XG4gICAgLy8gVGhlcmUncyBhIHJhbmRvbSBzbGltZSBpbiB0aGlzIHJvb20gdGhhdCB3b3VsZCBjYXVzZSBnbGl0Y2hlc1xuICAgIHNraXA6IHRydWUsXG4gIH0sXG59O1xuXG5jb25zdCBVTlRPVUNIRURfTU9OU1RFUlM6IHtbaWQ6IG51bWJlcl06IGJvb2xlYW59ID0geyAvLyBub3QgeWV0ICsweDUwIGluIHRoZXNlIGtleXNcbiAgWzB4N2VdOiB0cnVlLCAvLyB2ZXJ0aWNhbCBwbGF0Zm9ybVxuICBbMHg3Zl06IHRydWUsIC8vIGhvcml6b250YWwgcGxhdGZvcm1cbiAgWzB4ODNdOiB0cnVlLCAvLyBnbGl0Y2ggaW4gJDdjIChoeWRyYSlcbiAgWzB4OGRdOiB0cnVlLCAvLyBnbGl0Y2ggaW4gbG9jYXRpb24gJGFiIChzYWJlcmEgMilcbiAgWzB4OGVdOiB0cnVlLCAvLyBicm9rZW4/LCBidXQgc2l0cyBvbiB0b3Agb2YgaXJvbiB3YWxsXG4gIFsweDhmXTogdHJ1ZSwgLy8gc2hvb3Rpbmcgc3RhdHVlXG4gIFsweDlmXTogdHJ1ZSwgLy8gdmVydGljYWwgcGxhdGZvcm1cbiAgLy8gWzB4YTFdOiB0cnVlLCAvLyB3aGl0ZSB0b3dlciByb2JvdHNcbiAgWzB4YTZdOiB0cnVlLCAvLyBnbGl0Y2ggaW4gbG9jYXRpb24gJGFmIChtYWRvIDIpXG59O1xuXG5jb25zdCBzaHVmZmxlUmFuZG9tTnVtYmVycyA9IChyb206IFVpbnQ4QXJyYXksIHJhbmRvbTogUmFuZG9tKSA9PiB7XG4gIGNvbnN0IHRhYmxlID0gcm9tLnN1YmFycmF5KDB4MzU3ZTQgKyAweDEwLCAweDM1ODI0ICsgMHgxMCk7XG4gIHJhbmRvbS5zaHVmZmxlKHRhYmxlKTtcbn07XG4iXX0=