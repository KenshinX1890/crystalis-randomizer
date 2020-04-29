import { Monogrid } from './monogrid.js';
import { Metalocation } from '../rom/metalocation.js';
import { CaveShuffle } from './cave.js';
import { seq } from '../rom/util.js';
import { ScreenFix } from '../rom/screenfix.js';
export class SwampShuffle extends CaveShuffle {
    build(h = this.pickHeight(), w = this.pickWidth()) {
        var _a, _b, _c;
        const rom = this.orig.rom;
        const g = new Monogrid(h, w);
        g.fill();
        const arenaY = h * w < 28 ? 0 : this.random.nextInt(h - 1);
        const arenaX = this.random.nextInt(w);
        const fixed = new Set();
        function del(y, x) {
            g.delete2(y, x);
            fixed.add(y * g.w + x);
        }
        function isDoor(type) {
            return !type.startsWith('edge');
        }
        fixed.add(arenaY * g.w + arenaX);
        if (arenaX)
            del(arenaY, arenaX - 1);
        if (arenaX < g.w - 1)
            del(arenaY, arenaX + 1);
        if (arenaY) {
            del(arenaY - 1, arenaX);
            if (arenaX)
                del(arenaY - 1, arenaX - 1);
            if (arenaX < g.w - 1)
                del(arenaY - 1, arenaX + 1);
        }
        for (const i of fixed) {
            g.fixed.add(i);
        }
        const edgePos = new Set();
        for (let dir = 0; dir < 4; dir++) {
            const max = dir & 1 ? h : w;
            const nums = this.random.shuffle(seq(max));
            const opp = dir & 2 ? max : 0;
            let count = (_b = (_a = this.params.edges) === null || _a === void 0 ? void 0 : _a[dir]) !== null && _b !== void 0 ? _b : 0;
            while (count && nums.length) {
                const y = dir & 1 ? nums.pop() : opp;
                const x = dir & 1 ? opp : nums.pop();
                const i = y * g.w + x;
                if (!g.data[i] || g.fixed.has(i))
                    continue;
                g.addEdge(y, x, dir);
                edgePos.add(y << 4 | x);
                count--;
            }
            if (count)
                return { ok: false, fail: `could not add all edges: ${dir} ${count}\n${g.toGrid('c').show()}\n${g.data}` };
        }
        let deleted = 0;
        const target = g.h * g.w * (this.random.next() * 0.15 + 0.4);
        for (const posDir of this.random.ishuffle(seq(g.data.length << 2))) {
            const i = posDir >>> 2;
            const dir = posDir & 3;
            if (!g.isBorder(i, dir) && g.deleteEdge(i, dir)) {
                if (++deleted >= target)
                    break;
            }
        }
        const allocd = new Set();
        const unallocd = new Set();
        const plain = [];
        const doors = [];
        let arena;
        for (const s of this.orig.tileset) {
            if (s.hasFeature('arena')) {
                arena = s;
                continue;
            }
            else if (s.hasFeature('empty')) {
                plain[0] = s;
                continue;
            }
            const edgeIndex = s.edgeIndex('s');
            if (edgeIndex == null)
                throw new Error(`bad edges`);
            const hasDoor = (_c = s.data.exits) === null || _c === void 0 ? void 0 : _c.some(e => isDoor(e.type));
            (hasDoor ? doors : plain)[edgeIndex] = s;
            (s.sid < 0 ? unallocd : allocd).add(s.sid);
        }
        if (!arena)
            throw new Error(`never found arena`);
        const consolidate = g.consolidate(this.random, allocd.size);
        const used = new Set(consolidate.map(e => plain[e].sid));
        if (!used.size)
            return { ok: false, fail: `consolidate failed` };
        const newlyUsed = [...unallocd].filter(e => used.has(e));
        const newlyUnused = [...allocd].filter(e => !used.has(e));
        if (newlyUsed.length > newlyUnused.length)
            throw new Error(`out of space`);
        if (newlyUsed.length) {
            let unusedId = -1;
            while (rom.metascreens.getById(unusedId).length)
                unusedId--;
            const origUnusedId = unusedId;
            for (let i = 0; i < newlyUsed.length; i++) {
                rom.metascreens.renumber(newlyUnused[i], unusedId);
                rom.metascreens.renumber(newlyUsed[i], newlyUnused[i]);
                unusedId = newlyUsed[i];
            }
            rom.metascreens.renumber(origUnusedId, newlyUsed[newlyUsed.length - 1]);
        }
        const meta = new Metalocation(this.orig.id, this.orig.tileset, h, w);
        for (let y = 0; y < g.h; y++) {
            for (let x = 0; x < g.w; x++) {
                const isArena = y === arenaY && x === arenaX;
                meta.set(y << 4 | x, isArena ? arena : plain[g.data[y * g.w + x]]);
            }
        }
        let doorCount = [...this.orig.exits()].filter(e => isDoor(e[1])).length;
        for (const pos of this.random.ishuffle(meta.allPos())) {
            if (!doorCount)
                break;
            if (edgePos.has(pos))
                continue;
            const x = pos & 0xf;
            const y = pos >>> 4;
            const door = doors[g.data[y * g.w + x]];
            if (!door)
                continue;
            meta.set(pos, door);
            doorCount--;
        }
        if (doorCount)
            return { ok: false, fail: `could not place all doors` };
        return { ok: true, value: meta };
    }
}
export function addSwampDoors(rom) {
    const { swamp } = rom.metatilesets;
    const $ = rom.metascreens;
    const tiles = [
        [0x03, 0xda, 0xac],
        [0x04, 0xe4, 0xaa],
        [0x05, 0xe5, 0xaa],
        [0x06, 0xe6, 0xaa],
        [0x07, 0xe7, 0xaa],
        [0x08, 0xf0, 0xaa],
        [0x09, 0xf1, 0xaa],
        [0x0a, 0xf2, 0xaa],
        [0x0b, 0xf3, 0xaa],
        [0x0c, 0xdc, 0xaa],
        [0x0d, 0xdd, 0xaa],
    ];
    for (const [tile, src, alt] of tiles) {
        swamp.getTile(tile).copyFrom(src).setAlternative(alt);
    }
    $.swampEmpty.screen.set2d(0x00, [
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xa8, 0xcc],
        [0xd2, 0xcc],
        [0xd2, 0xcc],
        [0xd2, 0xcc],
        [0xd2, 0xe2],
        [0xe2, 0xc8],
    ]);
    $.swampE.screen.set2d(0x4c, [
        [0x08, 0x09],
        [0x0c, 0x0b],
        [0x03, 0x03],
    ]);
    $.swampWSE.screen.set2d(0x25, [
        [, , 0x04],
        [0x08, 0x09, 0x05],
        [, 0x0a, 0x06],
        [, 0x0b, 0x07],
        [, 0x03, 0x03],
    ]);
    $.swampW.screen.set2d(0x24, [
        [0x04],
        [],
        [0x06],
        [0x07, 0x0d],
        [0x03, 0x03],
    ]);
    $.swampWS.screen.set2d(0x47, [
        [0x08, 0x09],
        [0x0c, 0x0b],
        [0x03, 0x03],
    ]);
    $.registerFix(ScreenFix.SwampDoors, 0);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dhbXAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvanMvbWF6ZS9zd2FtcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxZQUFZLEVBQU8sTUFBTSx3QkFBd0IsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRXhDLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUdyQyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFaEQsTUFBTSxPQUFPLFlBQWEsU0FBUSxXQUFXO0lBRTNDLEtBQUssQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFOztRQUMvQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUMxQixNQUFNLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0IsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRVQsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzNELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDaEMsU0FBUyxHQUFHLENBQUMsQ0FBUyxFQUFFLENBQVM7WUFDL0IsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxD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QUksQ0FBQztRQUNsQixDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ2xCLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7UUFDbEIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNsQixDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO0tBQ25CLENBQUM7SUFFRixLQUFLLE1BQU0sQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLEtBQUssRUFBRTtRQUNwQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7S0FFdkQ7SUFHRCxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFO1FBQzlCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztLQUNiLENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDMUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO0tBQ2IsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtRQUM1QixDQUFLLEFBQUosRUFBVSxBQUFMLEVBQU8sSUFBSSxDQUFDO1FBQ2xCLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7UUFDbEIsQ0FBSyxBQUFKLEVBQU0sSUFBSSxFQUFFLElBQUksQ0FBQztRQUNsQixDQUFLLEFBQUosRUFBTSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ2xCLENBQUssQUFBSixFQUFNLElBQUksRUFBRSxJQUFJLENBQUM7S0FDbkIsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtRQUMxQixDQUFDLElBQUksQ0FBTztRQUNaLEVBQVk7UUFDWixDQUFDLElBQUksQ0FBTztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztRQUNaLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztLQUNiLENBQUMsQ0FBQztJQUVILENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUU7UUFDM0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO0tBQ2IsQ0FBQyxDQUFDO0lBRUgsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBbUIsQ0FBQztBQUMzRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTW9ub2dyaWQgfSBmcm9tICcuL21vbm9ncmlkLmpzJztcbmltcG9ydCB7IE1ldGFsb2NhdGlvbiwgUG9zIH0gZnJvbSAnLi4vcm9tL21ldGFsb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYXZlU2h1ZmZsZSB9IGZyb20gJy4vY2F2ZS5qcyc7XG5pbXBvcnQgeyBSZXN1bHQgfSBmcm9tICcuL21hemUuanMnO1xuaW1wb3J0IHsgc2VxIH0gZnJvbSAnLi4vcm9tL3V0aWwuanMnO1xuaW1wb3J0IHsgTWV0YXNjcmVlbiB9IGZyb20gJy4uL3JvbS9tZXRhc2NyZWVuLmpzJztcbmltcG9ydCB7IFJvbSB9IGZyb20gJy4uL3JvbS5qcyc7XG5pbXBvcnQgeyBTY3JlZW5GaXggfSBmcm9tICcuLi9yb20vc2NyZWVuZml4LmpzJztcblxuZXhwb3J0IGNsYXNzIFN3YW1wU2h1ZmZsZSBleHRlbmRzIENhdmVTaHVmZmxlIHtcblxuICBidWlsZChoID0gdGhpcy5waWNrSGVpZ2h0KCksIHcgPSB0aGlzLnBpY2tXaWR0aCgpKTogUmVzdWx0PE1ldGFsb2NhdGlvbj4ge1xuICAgIGNvbnN0IHJvbSA9IHRoaXMub3JpZy5yb207XG4gICAgY29uc3QgZyA9IG5ldyBNb25vZ3JpZChoLCB3KTtcbiAgICBnLmZpbGwoKTtcbiAgICAvLyBBZGQgYXJlbmEgKFRPRE8gLSBjb25zaWRlciBjb25kaXRpb24gKHRoaXMucmFuZG9tLm5leHRJbnQoNCkpXG4gICAgY29uc3QgYXJlbmFZID0gaCAqIHcgPCAyOCA/IDAgOiB0aGlzLnJhbmRvbS5uZXh0SW50KGggLSAxKTtcbiAgICBjb25zdCBhcmVuYVggPSB0aGlzLnJhbmRvbS5uZXh0SW50KHcpO1xuICAgIGNvbnN0IGZpeGVkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgZnVuY3Rpb24gZGVsKHk6IG51bWJlciwgeDogbnVtYmVyKSB7XG4gICAgICBnLmRlbGV0ZTIoeSwgeCk7XG4gICAgICBmaXhlZC5hZGQoeSAqIGcudyArIHgpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBpc0Rvb3IodHlwZTogc3RyaW5nKSB7XG4gICAgICByZXR1cm4gIXR5cGUuc3RhcnRzV2l0aCgnZWRnZScpO1xuICAgIH1cbiAgICBmaXhlZC5hZGQoYXJlbmFZICogZy53ICsgYXJlbmFYKTtcbiAgICBpZiAoYXJlbmFYKSBkZWwoYXJlbmFZLCBhcmVuYVggLSAxKTtcbiAgICBpZiAoYXJlbmFYIDwgZy53IC0gMSkgZGVsKGFyZW5hWSwgYXJlbmFYICsgMSk7XG4gICAgaWYgKGFyZW5hWSkge1xuICAgICAgZGVsKGFyZW5hWSAtIDEsIGFyZW5hWCk7XG4gICAgICBpZiAoYXJlbmFYKSBkZWwoYXJlbmFZIC0gMSwgYXJlbmFYIC0gMSk7XG4gICAgICBpZiAoYXJlbmFYIDwgZy53IC0gMSkgZGVsKGFyZW5hWSAtIDEsIGFyZW5hWCArIDEpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGkgb2YgZml4ZWQpIHtcbiAgICAgIGcuZml4ZWQuYWRkKGkpO1xuICAgIH1cblxuICAgIC8vIEFkZCBlZGdlIGV4aXRzLlxuICAgIGNvbnN0IGVkZ2VQb3MgPSBuZXcgU2V0PFBvcz4oKTtcbiAgICBmb3IgKGxldCBkaXIgPSAwOyBkaXIgPCA0OyBkaXIrKykge1xuICAgICAgY29uc3QgbWF4ID0gZGlyICYgMSA/IGggOiB3O1xuICAgICAgY29uc3QgbnVtcyA9IHRoaXMucmFuZG9tLnNodWZmbGUoc2VxKG1heCkpO1xuICAgICAgY29uc3Qgb3BwID0gZGlyICYgMiA/IG1heCA6IDA7XG4gICAgICBsZXQgY291bnQgPSB0aGlzLnBhcmFtcy5lZGdlcz8uW2Rpcl0gPz8gMDtcbiAgICAgIHdoaWxlIChjb3VudCAmJiBudW1zLmxlbmd0aCkge1xuICAgICAgICBjb25zdCB5ID0gZGlyICYgMSA/IG51bXMucG9wKCkhIDogb3BwO1xuICAgICAgICBjb25zdCB4ID0gZGlyICYgMSA/IG9wcCA6IG51bXMucG9wKCkhO1xuICAgICAgICBjb25zdCBpID0geSAqIGcudyArIHg7XG4gICAgICAgIGlmICghZy5kYXRhW2ldIHx8IGcuZml4ZWQuaGFzKGkpKSBjb250aW51ZTtcbiAgICAgICAgZy5hZGRFZGdlKHksIHgsIGRpcik7XG4gICAgICAgIGVkZ2VQb3MuYWRkKHkgPDwgNCB8IHgpO1xuICAgICAgICBjb3VudC0tO1xuICAgICAgfVxuICAgICAgaWYgKGNvdW50KSByZXR1cm4ge29rOiBmYWxzZSwgZmFpbDogYGNvdWxkIG5vdCBhZGQgYWxsIGVkZ2VzOiAke2Rpcn0gJHtjb3VudH1cXG4ke2cudG9HcmlkKCdjJykuc2hvdygpfVxcbiR7Zy5kYXRhfWB9O1xuICAgIH1cbiAgICAvL2NvbnNvbGUubG9nKGcudG9HcmlkKCdjJykuc2hvdygpKTsgLy8gVE9ETyAtIHdoeSBpcyBlZGdlIGV4aXQgZGlzYXBwZWFyaW5nPyE/XG5cbiAgICAvLyBEZWxldGUgZWRnZXNcbiAgICAvLyBOT1RFOiBtYXkgd2FudCBtdWx0aXBsZSBwYXNzZXMgYmVjYXVzZSBlYXJsaWVyIGRlbGV0ZXNcbiAgICAvLyBjb3VsZCBlbmFibGUgbGF0ZXIgZGVsZXRlcz9cbiAgICAvLyBTaG9vdCBmb3IgZGVsZXRpbmcgYW55d2hlcmUgZnJvbSAwLjQqaCp3IHRvIDAuNTUqaCp3IG9mIHRoZSBlZGdlcy5cbiAgICBsZXQgZGVsZXRlZCA9IDA7XG4gICAgY29uc3QgdGFyZ2V0ID0gZy5oICogZy53ICogKHRoaXMucmFuZG9tLm5leHQoKSAqIDAuMTUgKyAwLjQpO1xuICAgIGZvciAoY29uc3QgcG9zRGlyIG9mIHRoaXMucmFuZG9tLmlzaHVmZmxlKHNlcShnLmRhdGEubGVuZ3RoIDw8IDIpKSkge1xuICAgICAgY29uc3QgaSA9IHBvc0RpciA+Pj4gMjtcbiAgICAgIGNvbnN0IGRpciA9IHBvc0RpciAmIDM7XG4gICAgICBpZiAoIWcuaXNCb3JkZXIoaSwgZGlyKSAmJiBnLmRlbGV0ZUVkZ2UoaSwgZGlyKSkge1xuICAgICAgICBpZiAoKytkZWxldGVkID49IHRhcmdldCkgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ29uc29saWRhdGUuICBUT0RPIC0gcmVjb2duaXplIGNvcnJlY3QgY291bnQhXG4gICAgLy8gTk9URTogcm9tLm1vdmVTY3JlZW5zKCkgY291bGQgaGF2ZSBiZWVuIHVzZWQgdG8gbW92ZSB0aGUgc3dhbXAgdG9cbiAgICAvLyBhIG1vcmUgZnJlZSBwbGFuZS4gIElmIHNvLCB3ZSBkb24ndCBuZWVkIHRvIGNvbnNvbGlkYXRlIGF0IGFsbFxuICAgIC8vIGFuZCBhbGwgdGhlIHNjcmVlbnMnIHNpZHMgd2lsbCBiZSBwb3NpdGl2ZS4gIEZpbmQgb3V0IGhvdyBtYW55XG4gICAgLy8gbm9uLWVtcHR5LCBub24tYXJlbmEgc2NyZWVucyBpbiB0aGUgdGlsZXNldCBoYXZlIGRpZmZlcmVudCBwb3NpdGl2ZVxuICAgIC8vIG9yIG5lZ2F0aXZlIElEcywgYW5kIGdyb3VwIHRoZSBub24tZG9vciBvbmVzIGJ5IGVkZ2UgcHJvZmlsZS5cbiAgICBjb25zdCBhbGxvY2QgPSBuZXcgU2V0PG51bWJlcj4oKTtcbiAgICBjb25zdCB1bmFsbG9jZCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGNvbnN0IHBsYWluOiBNZXRhc2NyZWVuW10gPSBbXTtcbiAgICBjb25zdCBkb29yczogTWV0YXNjcmVlbltdID0gW107XG4gICAgbGV0IGFyZW5hOiBNZXRhc2NyZWVufHVuZGVmaW5lZDtcbiAgICBmb3IgKGNvbnN0IHMgb2YgdGhpcy5vcmlnLnRpbGVzZXQpIHtcbiAgICAgIGlmIChzLmhhc0ZlYXR1cmUoJ2FyZW5hJykpIHtcbiAgICAgICAgYXJlbmEgPSBzO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH0gZWxzZSBpZiAocy5oYXNGZWF0dXJlKCdlbXB0eScpKSB7XG4gICAgICAgIHBsYWluWzBdID0gcztcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBlZGdlSW5kZXggPSBzLmVkZ2VJbmRleCgncycpO1xuICAgICAgaWYgKGVkZ2VJbmRleCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoYGJhZCBlZGdlc2ApO1xuICAgICAgY29uc3QgaGFzRG9vciA9IHMuZGF0YS5leGl0cz8uc29tZShlID0+IGlzRG9vcihlLnR5cGUpKTtcbiAgICAgIChoYXNEb29yID8gZG9vcnMgOiBwbGFpbilbZWRnZUluZGV4XSA9IHM7XG4gICAgICAocy5zaWQgPCAwID8gdW5hbGxvY2QgOiBhbGxvY2QpLmFkZChzLnNpZCk7XG4gICAgfVxuICAgIGlmICghYXJlbmEpIHRocm93IG5ldyBFcnJvcihgbmV2ZXIgZm91bmQgYXJlbmFgKTtcblxuICAgIGNvbnN0IGNvbnNvbGlkYXRlID0gZy5jb25zb2xpZGF0ZSh0aGlzLnJhbmRvbSwgYWxsb2NkLnNpemUpO1xuICAgIGNvbnN0IHVzZWQgPSBuZXcgU2V0KGNvbnNvbGlkYXRlLm1hcChlID0+IHBsYWluW2VdLnNpZCkpO1xuICAgIGlmICghdXNlZC5zaXplKSByZXR1cm4ge29rOiBmYWxzZSwgZmFpbDogYGNvbnNvbGlkYXRlIGZhaWxlZGB9O1xuICAgIGNvbnN0IG5ld2x5VXNlZCA9IFsuLi51bmFsbG9jZF0uZmlsdGVyKGUgPT4gdXNlZC5oYXMoZSkpO1xuICAgIGNvbnN0IG5ld2x5VW51c2VkID0gWy4uLmFsbG9jZF0uZmlsdGVyKGUgPT4gIXVzZWQuaGFzKGUpKTtcbiAgICBpZiAobmV3bHlVc2VkLmxlbmd0aCA+IG5ld2x5VW51c2VkLmxlbmd0aCkgdGhyb3cgbmV3IEVycm9yKGBvdXQgb2Ygc3BhY2VgKTtcblxuICAgIGlmIChuZXdseVVzZWQubGVuZ3RoKSB7XG4gICAgICAvLyBGaW5kIGFuIGF2YWlsYWJsZSBzaWQgdG8gc3dhcCBvdXQgd2l0aC4gIEN5Y2xlIGV2ZXJ5dGhpbmcgdGhyb3VnaC5cbiAgICAgIGxldCB1bnVzZWRJZCA9IC0xO1xuICAgICAgd2hpbGUgKHJvbS5tZXRhc2NyZWVucy5nZXRCeUlkKHVudXNlZElkKS5sZW5ndGgpIHVudXNlZElkLS07XG4gICAgICBjb25zdCBvcmlnVW51c2VkSWQgPSB1bnVzZWRJZDtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgbmV3bHlVc2VkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHJvbS5tZXRhc2NyZWVucy5yZW51bWJlcihuZXdseVVudXNlZFtpXSwgdW51c2VkSWQpO1xuICAgICAgICByb20ubWV0YXNjcmVlbnMucmVudW1iZXIobmV3bHlVc2VkW2ldLCBuZXdseVVudXNlZFtpXSk7XG4gICAgICAgIHVudXNlZElkID0gbmV3bHlVc2VkW2ldO1xuICAgICAgfVxuICAgICAgcm9tLm1ldGFzY3JlZW5zLnJlbnVtYmVyKG9yaWdVbnVzZWRJZCwgbmV3bHlVc2VkW25ld2x5VXNlZC5sZW5ndGggLSAxXSk7XG4gICAgfVxuXG4gICAgY29uc3QgbWV0YSA9IG5ldyBNZXRhbG9jYXRpb24odGhpcy5vcmlnLmlkLCB0aGlzLm9yaWcudGlsZXNldCwgaCwgdyk7XG4gICAgZm9yIChsZXQgeSA9IDA7IHkgPCBnLmg7IHkrKykge1xuICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCBnLnc7IHgrKykge1xuICAgICAgICBjb25zdCBpc0FyZW5hID0geSA9PT0gYXJlbmFZICYmIHggPT09IGFyZW5hWDtcbiAgICAgICAgbWV0YS5zZXQoeSA8PCA0IHwgeCwgaXNBcmVuYSA/IGFyZW5hIDogcGxhaW5bZy5kYXRhW3kgKiBnLncgKyB4XV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFBpY2sgYSBsb2NhdGlvbiBmb3IgdGhlIGRvb3IocykuXG4gICAgbGV0IGRvb3JDb3VudCA9IFsuLi50aGlzLm9yaWcuZXhpdHMoKV0uZmlsdGVyKGUgPT4gaXNEb29yKGVbMV0pKS5sZW5ndGg7XG4gICAgZm9yIChjb25zdCBwb3Mgb2YgdGhpcy5yYW5kb20uaXNodWZmbGUobWV0YS5hbGxQb3MoKSkpIHtcbiAgICAgIGlmICghZG9vckNvdW50KSBicmVhaztcbiAgICAgIGlmIChlZGdlUG9zLmhhcyhwb3MpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHggPSBwb3MgJiAweGY7XG4gICAgICBjb25zdCB5ID0gcG9zID4+PiA0O1xuICAgICAgY29uc3QgZG9vciA9IGRvb3JzW2cuZGF0YVt5ICogZy53ICsgeF1dO1xuICAgICAgaWYgKCFkb29yKSBjb250aW51ZTtcbiAgICAgIG1ldGEuc2V0KHBvcywgZG9vcik7XG4gICAgICBkb29yQ291bnQtLTtcbiAgICB9XG4gICAgaWYgKGRvb3JDb3VudCkgcmV0dXJuIHtvazogZmFsc2UsIGZhaWw6IGBjb3VsZCBub3QgcGxhY2UgYWxsIGRvb3JzYH07XG4gICAgcmV0dXJuIHtvazogdHJ1ZSwgdmFsdWU6IG1ldGF9O1xuICB9XG59XG5cbi8qKiBBcHBseSB0aGUgU2NyZWVuRml4LlN3YW1wRG9vcnMuICovXG5leHBvcnQgZnVuY3Rpb24gYWRkU3dhbXBEb29ycyhyb206IFJvbSkge1xuICBjb25zdCB7c3dhbXB9ID0gcm9tLm1ldGF0aWxlc2V0cztcbiAgY29uc3QgJCA9IHJvbS5tZXRhc2NyZWVucztcblxuICAvLyBNYWtlIGEgaGFuZGZ1bCBvZiByZW1vdmFibGUgdGlsZXMgLSBkZWZhdWx0cyB0byBDTE9TRUQhXG4gIGNvbnN0IHRpbGVzID0gW1xuICAgIFsweDAzLCAweGRhLCAweGFjXSxcbiAgICBbMHgwNCwgMHhlNCwgMHhhYV0sXG4gICAgWzB4MDUsIDB4ZTUsIDB4YWFdLFxuICAgIFsweDA2LCAweGU2LCAweGFhXSxcbiAgICBbMHgwNywgMHhlNywgMHhhYV0sXG4gICAgWzB4MDgsIDB4ZjAsIDB4YWFdLFxuICAgIFsweDA5LCAweGYxLCAweGFhXSxcbiAgICBbMHgwYSwgMHhmMiwgMHhhYV0sXG4gICAgWzB4MGIsIDB4ZjMsIDB4YWFdLFxuICAgIFsweDBjLCAweGRjLCAweGFhXSxcbiAgICBbMHgwZCwgMHhkZCwgMHhhYV0sXG4gIF07XG4gIC8vY29uc3Qgc2NyZWVucyA9IFsuLi5zd2FtcF0uZmlsdGVyKHMgPT4gcy5zaWQgPj0gMCk7XG4gIGZvciAoY29uc3QgW3RpbGUsIHNyYywgYWx0XSBvZiB0aWxlcykge1xuICAgIHN3YW1wLmdldFRpbGUodGlsZSkuY29weUZyb20oc3JjKS5zZXRBbHRlcm5hdGl2ZShhbHQpO1xuICAgICAgLy8ucmVwbGFjZUluKC4uLnNjcmVlbnMpO1xuICB9XG5cbiAgLy8gRml4IGEgZmV3IHNjcmVlbnMuXG4gICQuc3dhbXBFbXB0eS5zY3JlZW4uc2V0MmQoMHgwMCwgWyAvLyBhZGQgbGVmdCBjb2x1bW5cbiAgICBbMHhhOCwgMHhjY10sIC8vIDBcbiAgICBbMHhhOCwgMHhjY10sXG4gICAgWzB4YTgsIDB4Y2NdLFxuICAgIFsweGE4LCAweGNjXSxcbiAgICBbMHhhOCwgMHhjY10sXG4gICAgWzB4YTgsIDB4Y2NdLFxuICAgIFsweGE4LCAweGNjXSxcbiAgICBbMHhhOCwgMHhjY10sXG4gICAgWzB4YTgsIDB4Y2NdLFxuICAgIFsweGQyLCAweGNjXSwgLy8gOVxuICAgIFsweGQyLCAweGNjXSxcbiAgICBbMHhkMiwgMHhjY10sXG4gICAgWzB4ZDIsIDB4ZTJdLCAvLyBjXG4gICAgWzB4ZTIsIDB4YzhdLCAvLyBkXG4gIF0pO1xuXG4gICQuc3dhbXBFLnNjcmVlbi5zZXQyZCgweDRjLCBbIC8vIGFkZCBvcHRpb25hbCBkb29yXG4gICAgWzB4MDgsIDB4MDldLCAvLyBmMCBmMVxuICAgIFsweDBjLCAweDBiXSwgLy8gZGMgZjNcbiAgICBbMHgwMywgMHgwM10sIC8vIGRhIGRhXG4gIF0pO1xuXG4gICQuc3dhbXBXU0Uuc2NyZWVuLnNldDJkKDB4MjUsIFsgLy8gYWRkIGFuIG9wdGlvbmFsIGRvb3JcbiAgICBbICAgICwgICAgICwgMHgwNF0sIC8vICAgICAgIGU0XG4gICAgWzB4MDgsIDB4MDksIDB4MDVdLCAvLyBmMCBmMSBlNVxuICAgIFsgICAgLCAweDBhLCAweDA2XSwgLy8gICAgZjIgZTZcbiAgICBbICAgICwgMHgwYiwgMHgwN10sIC8vICAgIGYzIGU3XG4gICAgWyAgICAsIDB4MDMsIDB4MDNdLCAvLyAgICBkYSBkYVxuICBdKTtcblxuICAkLnN3YW1wVy5zY3JlZW4uc2V0MmQoMHgyNCwgWyAvLyBhZGQgb3B0aW9uYWwgZG9vclxuICAgIFsweDA0ICAgICAgXSwgLy8gZTRcbiAgICBbICAgICAgICAgIF0sIC8vXG4gICAgWzB4MDYgICAgICBdLCAvLyBlNlxuICAgIFsweDA3LCAweDBkXSwgLy8gZTcgZGRcbiAgICBbMHgwMywgMHgwM10sIC8vIGRhIGRhXG4gIF0pO1xuXG4gICQuc3dhbXBXUy5zY3JlZW4uc2V0MmQoMHg0NywgWyAvLyBleGlzdGluZyBkb29yIG9wdGlvbmFsXG4gICAgWzB4MDgsIDB4MDldLCAvLyBmMCBmMVxuICAgIFsweDBjLCAweDBiXSwgLy8gZGMgZjNcbiAgICBbMHgwMywgMHgwM10sIC8vIGRhIGRhXG4gIF0pO1xuXG4gICQucmVnaXN0ZXJGaXgoU2NyZWVuRml4LlN3YW1wRG9vcnMsIDAgLyogdW51c2VkIHNlZWQgKi8pO1xufVxuIl19