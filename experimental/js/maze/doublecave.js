import { CaveShuffle } from './cave.js';
import { coordToPos } from './grid.js';
import { iters } from '../util.js';
import { OK } from './maze.js';
export class BridgeCaveShuffle {
    constructor(overpass, underpass, reverse = false) {
        this.overpass = overpass;
        this.underpass = underpass;
        this.under = this.makeUnder(underpass, overpass, reverse);
        this.over = this.makeOver(overpass, this.under, reverse);
    }
    makeUnder(underpass, overpass, reverse) {
        return new UnderpassShuffle(underpass, overpass, reverse);
    }
    makeOver(overpass, under, reverse) {
        return new OverpassShuffle(overpass, under, reverse);
    }
    shuffle(random) {
        while (this.under.attempts < this.under.maxAttempts) {
            this.under.finished = undefined;
            this.under.shuffle(random);
            if (!this.under.finished)
                return;
            this.over.maxAttempts = this.under.attempts;
            this.over.shuffle(random);
            if (this.over.finished) {
                this.over.actuallyFinish();
                this.under.actuallyFinish();
                return;
            }
        }
    }
}
class DoubleShuffle extends CaveShuffle {
    finish(meta) {
        this.finished = meta;
    }
    actuallyFinish() {
        super.finish(this.finished);
    }
}
class OverpassShuffle extends DoubleShuffle {
    constructor(location, under, reverse) {
        super(location);
        this.location = location;
        this.under = under;
        this.reverse = reverse;
    }
    init() {
        this.under.downStairs = [];
    }
    actualFinish() {
        for (const [up, down] of iters.zip(this.under.upStairs, this.under.downStairs)) {
            this.finished.attach(down, this.under.finished, up);
        }
    }
    addEarlyFeatures(a) {
        const result = super.addEarlyFeatures(a);
        if (!result.ok)
            return result;
        let xMin = 16;
        let xMax = 0;
        let yMin = 16;
        let yMax = 0;
        let bridge = 1;
        for (const pos of [...this.under.underBridges,
            -1,
            ...this.under.upStairs]) {
            if (pos === -1) {
                bridge = 0;
                continue;
            }
            const y = pos >>> 4;
            const x = pos & 0xf;
            xMin = Math.min(x, xMin);
            xMax = Math.max(x, xMax);
            yMin = Math.min(y - bridge, yMin);
            yMax = Math.max(y + bridge, yMax);
        }
        OUTER: for (let attempt = 0; attempt < 10; attempt++) {
            const mods = [];
            const x = this.random.nextInt(a.w - (xMax - xMin)) + xMin;
            const y = this.random.nextInt(a.h - (yMax - yMin)) + yMin;
            const delta = (y - yMin) << 4 + (x - xMin);
            for (const bridge of this.under.underBridges) {
                const pos = bridge + delta;
                const sy = pos >>> 4;
                const sx = pos & 0xf;
                const c = (sy << 12 | sx << 4 | 0x808);
                if (a.grid.get(c) !== 'c')
                    continue OUTER;
                mods.push([c, 'b']);
                mods.push([c - 8, '']);
                mods.push([c + 8, '']);
            }
            for (const stair of this.under.upStairsEffective) {
                const pos = stair + delta;
                const sy = pos >>> 4;
                const sx = pos & 0xf;
                const c = (sy << 12 | sx << 4 | 0x808);
                if (a.grid.get(c) !== 'c')
                    continue OUTER;
                mods.push([c, this.reverse ? '<' : '>']);
                mods.push([c + (this.reverse ? -0x800 : 0x800), '']);
                const stairMods = this.addEarlyStair(a, c, this.reverse ? '<' : '>');
                if (!stairMods.length)
                    continue OUTER;
                mods.push(...stairMods);
            }
            for (const [c, v] of mods) {
                if (v)
                    a.fixed.add(c);
                if (v === '<' || v === '>') {
                    this.under.downStairs.push(coordToPos(c));
                }
                a.grid.set(c, v);
            }
            return OK;
        }
        return { ok: false, fail: 'add fixed stairs with early features' };
    }
    addStairs(a, up = 0, down = 0) {
        if (this.reverse) {
            return super.addStairs(a, up - this.under.upStairs.length, down);
        }
        return super.addStairs(a, up, down - this.under.upStairs.length);
    }
    addOverpasses() {
        return true;
    }
    reportFailure() { }
}
class UnderpassShuffle extends DoubleShuffle {
    constructor(loc, overpass, reverse) {
        super(loc);
        this.loc = loc;
        this.overpass = overpass;
        this.reverse = reverse;
        this.underBridges = [];
        this.upStairs = [];
        this.upStairsEffective = [];
        this.downStairs = [];
    }
    init() {
        this.underBridges = [];
        this.upStairs = [];
        this.upStairsEffective = [];
    }
    finish(newMeta) {
        const upStair = this.reverse ? 'stair:down' : 'stair:up';
        for (const pos of newMeta.allPos()) {
            const scr = newMeta.get(pos);
            if (scr.hasFeature('underpass'))
                this.underBridges.push(pos);
            if (scr.hasFeature(upStair)) {
                let delta = 0;
                for (const exit of scr.data.exits) {
                    if (exit.type === 'stair:up' && exit.entrance < 0x8000)
                        delta = -16;
                    if (exit.type === 'stair:down' && exit.entrance > 0x8000)
                        delta = 16;
                }
                this.upStairsEffective.push(pos + delta);
                this.upStairs.push(pos);
            }
        }
        if (!this.underBridges.length) {
            throw new Error(`Expected bridge in ${this.loc}\n${newMeta.show()}`);
        }
        if (!this.upStairs.length) {
            throw new Error(`Expected stair in ${this.loc}\n${newMeta.show()}`);
        }
        let stairsLen = 0;
        for (const [, type, [dest]] of this.orig.exits()) {
            if (type === upStair && (dest >>> 8) === this.overpass.id)
                stairsLen++;
        }
        this.upStairs = this.random.shuffle(this.upStairs).slice(0, stairsLen);
        super.finish(newMeta);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG91YmxlY2F2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9qcy9tYXplL2RvdWJsZWNhdmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFzQixXQUFXLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDNUQsT0FBTyxFQUFhLFVBQVUsRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUlsRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ25DLE9BQU8sRUFBVSxFQUFFLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFTdkMsTUFBTSxPQUFPLGlCQUFpQjtJQUc1QixZQUFxQixRQUFrQixFQUFXLFNBQW1CLEVBQ3pELE9BQU8sR0FBRyxLQUFLO1FBRE4sYUFBUSxHQUFSLFFBQVEsQ0FBVTtRQUFXLGNBQVMsR0FBVCxTQUFTLENBQVU7UUFFbkUsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDMUQsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxTQUFTLENBQUMsU0FBbUIsRUFBRSxRQUFrQixFQUFFLE9BQWdCO1FBQ2pFLE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxRQUFRLENBQUMsUUFBa0IsRUFBRSxLQUF1QixFQUFFLE9BQWdCO1FBQ3BFLE9BQU8sSUFBSSxlQUFlLENBQUMsUUFBUSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsT0FBTyxDQUFDLE1BQWM7UUFDcEIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FB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QUFLLEdBQUc7b0JBQUUsU0FBUyxLQUFLLENBQUM7Z0JBQzFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDcEIsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFjLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDcEMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFjLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQzthQUNyQztZQUNELEtBQUssTUFBTSxLQUFLLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsTUFBTSxHQUFHLEdBQUcsS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFDMUIsTUFBTSxFQUFFLEdBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQztnQkFDckIsTUFBTSxFQUFFLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztnQkFDckIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFjLENBQUM7Z0JBQ3BELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRztvQkFBRSxTQUFTLEtBQUssQ0FBQztnQkFDMUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFjLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFNbEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFF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R0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUV2RSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLENBQUM7Q0FJRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENhdmVTaHVmZmxlQXR0ZW1wdCwgQ2F2ZVNodWZmbGUgfSBmcm9tICcuL2NhdmUuanMnO1xuaW1wb3J0IHsgR3JpZENvb3JkLCBjb29yZFRvUG9zIH0gZnJvbSAnLi9ncmlkLmpzJztcbmltcG9ydCB7IFJhbmRvbSB9IGZyb20gJy4uL3JhbmRvbS5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uL3JvbS9sb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3MsIE1ldGFsb2NhdGlvbiB9IGZyb20gJy4uL3JvbS9tZXRhbG9jYXRpb24uanMnO1xuaW1wb3J0IHsgaXRlcnMgfSBmcm9tICcuLi91dGlsLmpzJztcbmltcG9ydCB7IFJlc3VsdCwgT0sgfSBmcm9tICcuL21hemUuanMnO1xuXG4vLyBCYXNpYyBpZGVhOiBPdmVycGFzcyBydW5zIHVuZGVycGFzcyBmaXJzdC5cbi8vIFVuZGVycGFzcyBzYXZlcyBpdHMgcmVzdWx0LCBpcyByZWFkIGJ5IG92ZXJwYXNzIGF0dGVtcHQuXG4vLyBUT0RPIC0gdGhlIGN1cnJlbnQgc2V0dXAgaXMgTyhuXjIpIGF0dGVtcHRzOyB3ZSBjb3VsZCBzd2l0Y2ggdG8gYW5cbi8vICAgICAgICBpbnRlcnNlY3Rpb24gd2hlcmUgYm90aCBhdHRlbXB0cyBuZWVkIHRvIHBhc3MgYXQgdGhlIHNhbWUgdGltZS5cblxudHlwZSBBID0gQ2F2ZVNodWZmbGVBdHRlbXB0O1xuXG5leHBvcnQgY2xhc3MgQnJpZGdlQ2F2ZVNodWZmbGUge1xuICBvdmVyOiBPdmVycGFzc1NodWZmbGU7XG4gIHVuZGVyOiBVbmRlcnBhc3NTaHVmZmxlO1xuICBjb25zdHJ1Y3RvcihyZWFkb25seSBvdmVycGFzczogTG9jYXRpb24sIHJlYWRvbmx5IHVuZGVycGFzczogTG9jYXRpb24sXG4gICAgICAgICAgICAgIHJldmVyc2UgPSBmYWxzZSkge1xuICAgIHRoaXMudW5kZXIgPSB0aGlzLm1ha2VVbmRlcih1bmRlcnBhc3MsIG92ZXJwYXNzLCByZXZlcnNlKTtcbiAgICB0aGlzLm92ZXIgPSB0aGlzLm1ha2VPdmVyKG92ZXJwYXNzLCB0aGlzLnVuZGVyLCByZXZlcnNlKTtcbiAgfVxuXG4gIG1ha2VVbmRlcih1bmRlcnBhc3M6IExvY2F0aW9uLCBvdmVycGFzczogTG9jYXRpb24sIHJldmVyc2U6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gbmV3IFVuZGVycGFzc1NodWZmbGUodW5kZXJwYXNzLCBvdmVycGFzcywgcmV2ZXJzZSk7XG4gIH1cblxuICBtYWtlT3ZlcihvdmVycGFzczogTG9jYXRpb24sIHVuZGVyOiBVbmRlcnBhc3NTaHVmZmxlLCByZXZlcnNlOiBib29sZWFuKSB7XG4gICAgcmV0dXJuIG5ldyBPdmVycGFzc1NodWZmbGUob3ZlcnBhc3MsIHVuZGVyLCByZXZlcnNlKTtcbiAgfVxuXG4gIHNodWZmbGUocmFuZG9tOiBSYW5kb20pIHtcbiAgICB3aGlsZSAodGhpcy51bmRlci5hdHRlbXB0cyA8IHRoaXMudW5kZXIubWF4QXR0ZW1wdHMpIHtcbiAgICAgIHRoaXMudW5kZXIuZmluaXNoZWQgPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLnVuZGVyLnNodWZmbGUocmFuZG9tKTtcbiAgICAgIGlmICghdGhpcy51bmRlci5maW5pc2hlZCkgcmV0dXJuOyAvLyBubyBkaWNlXG4gICAgICB0aGlzLm92ZXIubWF4QXR0ZW1wdHMgPSB0aGlzLnVuZGVyLmF0dGVtcHRzO1xuICAgICAgdGhpcy5vdmVyLnNodWZmbGUocmFuZG9tKTtcbiAgICAgIGlmICh0aGlzLm92ZXIuZmluaXNoZWQpIHtcbiAgICAgICAgdGhpcy5vdmVyLmFjdHVhbGx5RmluaXNoKCk7XG4gICAgICAgIHRoaXMudW5kZXIuYWN0dWFsbHlGaW5pc2goKTtcbiAgICAgICAgcmV0dXJuOyAvLyBzdWNjZXNzXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIERvdWJsZVNodWZmbGUgZXh0ZW5kcyBDYXZlU2h1ZmZsZSB7XG4gIGZpbmlzaGVkPzogTWV0YWxvY2F0aW9uO1xuICBmaW5pc2gobWV0YTogTWV0YWxvY2F0aW9uKSB7XG4gICAgdGhpcy5maW5pc2hlZCA9IG1ldGE7XG4gIH1cbiAgYWN0dWFsbHlGaW5pc2goKSB7XG4gICAgc3VwZXIuZmluaXNoKHRoaXMuZmluaXNoZWQhKTtcbiAgfVxufVxuXG5jbGFzcyBPdmVycGFzc1NodWZmbGUgZXh0ZW5kcyBEb3VibGVTaHVmZmxlIHtcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSBsb2NhdGlvbjogTG9jYXRpb24sIHJlYWRvbmx5IHVuZGVyOiBVbmRlcnBhc3NTaHVmZmxlLFxuICAgICAgICAgICAgICByZWFkb25seSByZXZlcnNlOiBib29sZWFuKSB7IHN1cGVyKGxvY2F0aW9uKTsgfVxuXG4gIGluaXQoKSB7XG4gICAgLy8gc3RhcnQgZnJlc2hcbiAgICB0aGlzLnVuZGVyLmRvd25TdGFpcnMgPSBbXTtcbiAgfVxuXG4gIGFjdHVhbEZpbmlzaCgpIHtcbiAgICAvLyBBdHRhY2ggdGhlIHN0YWlycy4gIG5ld01ldGEgaXMgdGhlIG92ZXJwYXNzLlxuICAgIGZvciAoY29uc3QgW3VwLCBkb3duXSBvZiBpdGVycy56aXAodGhpcy51bmRlci51cFN0YWlycyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudW5kZXIuZG93blN0YWlycykpIHtcbiAgICAgIHRoaXMuZmluaXNoZWQhLmF0dGFjaChkb3duLCB0aGlzLnVuZGVyLmZpbmlzaGVkISwgdXApO1xuICAgIH1cbiAgfVxuXG4gIGFkZEVhcmx5RmVhdHVyZXMoYTogQSk6IFJlc3VsdDx2b2lkPiB7XG4gICAgY29uc3QgcmVzdWx0ID0gc3VwZXIuYWRkRWFybHlGZWF0dXJlcyhhKTtcbiAgICBpZiAoIXJlc3VsdC5vaykgcmV0dXJuIHJlc3VsdDtcbi8vaWYodGhpcy5wYXJhbXMuaWQ9PT01KWRlYnVnZ2VyO1xuICAgIC8vIEZpbmQgdGhlIGJyaWRnZSB0aGF0IHdhcyBhZGRlZC5cbiAgICBsZXQgeE1pbiA9IDE2O1xuICAgIGxldCB4TWF4ID0gMFxuICAgIGxldCB5TWluID0gMTY7XG4gICAgbGV0IHlNYXggPSAwO1xuXG4gICAgLy8gQnJhY2tldCB0aGUgd2hvbGUgdGhpbmcgdG8gZW5zdXJlIHRoZSBwbGFjZW1lbnRzIGFyZSBldmVuIGZlYXNpYmxlLlxuICAgIGxldCBicmlkZ2UgPSAxO1xuICAgIGZvciAoY29uc3QgcG9zIG9mIFsuLi50aGlzLnVuZGVyLnVuZGVyQnJpZGdlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgLTEsXG4gICAgICAgICAgICAgICAgICAgICAgIC4uLnRoaXMudW5kZXIudXBTdGFpcnNdKSB7XG4gICAgICBpZiAocG9zID09PSAtMSkge1xuICAgICAgICBicmlkZ2UgPSAwO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHkgPSBwb3MgPj4+IDQ7XG4gICAgICBjb25zdCB4ID0gcG9zICYgMHhmO1xuICAgICAgeE1pbiA9IE1hdGgubWluKHgsIHhNaW4pO1xuICAgICAgeE1heCA9IE1hdGgubWF4KHgsIHhNYXgpO1xuICAgICAgeU1pbiA9IE1hdGgubWluKHkgLSBicmlkZ2UsIHlNaW4pO1xuICAgICAgeU1heCA9IE1hdGgubWF4KHkgKyBicmlkZ2UsIHlNYXgpO1xuICAgIH1cblxuICAgIE9VVEVSOlxuICAgIGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgMTA7IGF0dGVtcHQrKykge1xuICAgICAgY29uc3QgbW9kczogQXJyYXk8W0dyaWRDb29yZCwgc3RyaW5nXT4gPSBbXTtcbiAgICAgIGNvbnN0IHggPSB0aGlzLnJhbmRvbS5uZXh0SW50KGEudyAtICh4TWF4IC0geE1pbikpICsgeE1pbjtcbiAgICAgIGNvbnN0IHkgPSB0aGlzLnJhbmRvbS5uZXh0SW50KGEuaCAtICh5TWF4IC0geU1pbikpICsgeU1pbjtcbiAgICAgIGNvbnN0IGRlbHRhID0gKHkgLSB5TWluKSA8PCA0ICsgKHggLSB4TWluKTtcbiAgICAgIGZvciAoY29uc3QgYnJpZGdlIG9mIHRoaXMudW5kZXIudW5kZXJCcmlkZ2VzKSB7XG4gICAgICAgIGNvbnN0IHBvcyA9IGJyaWRnZSArIGRlbHRhO1xuICAgICAgICBjb25zdCBzeSA9IHBvcyA+Pj4gNDtcbiAgICAgICAgY29uc3Qgc3ggPSBwb3MgJiAweGY7XG4gICAgICAgIGNvbnN0IGMgPSAoc3kgPDwgMTIgfCBzeCA8PCA0IHwgMHg4MDgpIGFzIEdyaWRDb29yZDtcbiAgICAgICAgaWYgKGEuZ3JpZC5nZXQoYykgIT09ICdjJykgY29udGludWUgT1VURVI7IC8vIG91dCBvZiBib3VuZHMuXG4gICAgICAgIG1vZHMucHVzaChbYywgJ2InXSk7XG4gICAgICAgIG1vZHMucHVzaChbYyAtIDggYXMgR3JpZENvb3JkLCAnJ10pO1xuICAgICAgICBtb2RzLnB1c2goW2MgKyA4IGFzIEdyaWRDb29yZCwgJyddKTtcbiAgICAgIH1cbiAgICAgIGZvciAoY29uc3Qgc3RhaXIgb2YgdGhpcy51bmRlci51cFN0YWlyc0VmZmVjdGl2ZSkge1xuICAgICAgICBjb25zdCBwb3MgPSBzdGFpciArIGRlbHRhO1xuICAgICAgICBjb25zdCBzeSA9IHBvcyA+Pj4gNDtcbiAgICAgICAgY29uc3Qgc3ggPSBwb3MgJiAweGY7XG4gICAgICAgIGNvbnN0IGMgPSAoc3kgPDwgMTIgfCBzeCA8PCA0IHwgMHg4MDgpIGFzIEdyaWRDb29yZDtcbiAgICAgICAgaWYgKGEuZ3JpZC5nZXQoYykgIT09ICdjJykgY29udGludWUgT1VURVI7XG4gICAgICAgIG1vZHMucHVzaChbYywgdGhpcy5yZXZlcnNlID8gJzwnIDogJz4nXSk7XG4gICAgICAgIG1vZHMucHVzaChbYyArICh0aGlzLnJldmVyc2UgPyAtMHg4MDAgOiAweDgwMCkgYXMgR3JpZENvb3JkLCAnJ10pO1xuICAgICAgICAvLyBQaWNrIGEgc2luZ2xlIGRpcmVjdGlvbiBmb3IgdGhlIHN0YWlyLlxuICAgICAgICAvLyBOT1RFOiBpZiB3ZSBkZWxldGUgdGhlbiB3ZSBmb3JnZXQgdG8gemVybyBpdCBvdXQuLi5cbiAgICAgICAgLy8gQnV0IGl0IHdvdWxkIHN0aWxsIGJlIG5pY2UgdG8gXCJwb2ludFwiIHRoZW0gaW4gdGhlIGVhc3kgZGlyZWN0aW9uP1xuICAgICAgICAvLyBpZiAodGhpcy5kZWx0YSA8IC0xNikgbmVpZ2hib3JzLnNwbGljZSgyLCAxKTtcbiAgICAgICAgLy8gaWYgKCh0aGlzLmRlbHRhICYgMHhmKSA8IDgpIG5laWdoYm9ycy5zcGxpY2UoMSwgMSk7XG4gICAgICAgIGNvbnN0IHN0YWlyTW9kcyA9IHRoaXMuYWRkRWFybHlTdGFpcihhLCBjLCB0aGlzLnJldmVyc2UgPyAnPCcgOiAnPicpO1xuICAgICAgICBpZiAoIXN0YWlyTW9kcy5sZW5ndGgpIGNvbnRpbnVlIE9VVEVSO1xuICAgICAgICBtb2RzLnB1c2goLi4uc3RhaXJNb2RzKTtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBbYywgdl0gb2YgbW9kcykge1xuICAgICAgICBpZiAodikgYS5maXhlZC5hZGQoYyk7XG4gICAgICAgIGlmICh2ID09PSAnPCcgfHwgdiA9PT0gJz4nKSB7XG4gICAgICAgICAgdGhpcy51bmRlci5kb3duU3RhaXJzLnB1c2goY29vcmRUb1BvcyhjKSk7XG4gICAgICAgIH1cbiAgICAgICAgYS5ncmlkLnNldChjLCB2KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBPSztcbiAgICB9XG4gICAgcmV0dXJuIHtvazogZmFsc2UsIGZhaWw6ICdhZGQgZml4ZWQgc3RhaXJzIHdpdGggZWFybHkgZmVhdHVyZXMnfTtcbiAgfVxuXG4gIGFkZFN0YWlycyhhOiBBLCB1cCA9IDAsIGRvd24gPSAwKTogUmVzdWx0PHZvaWQ+IHtcbiAgICBpZiAodGhpcy5yZXZlcnNlKSB7XG4gICAgICByZXR1cm4gc3VwZXIuYWRkU3RhaXJzKGEsIHVwIC0gdGhpcy51bmRlci51cFN0YWlycy5sZW5ndGgsIGRvd24pO1xuICAgIH1cbiAgICByZXR1cm4gc3VwZXIuYWRkU3RhaXJzKGEsIHVwLCBkb3duIC0gdGhpcy51bmRlci51cFN0YWlycy5sZW5ndGgpO1xuICB9XG5cbiAgYWRkT3ZlcnBhc3NlcygpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIC8vIEV4cGVjdGVkIHRvIGhhdmUgc2V2ZXJhbCBmYWlsdXJlc1xuICByZXBvcnRGYWlsdXJlKCkge31cbn1cblxuY2xhc3MgVW5kZXJwYXNzU2h1ZmZsZSBleHRlbmRzIERvdWJsZVNodWZmbGUge1xuXG4gIC8vIFRoZXNlIGFyZSBmaWxsZWQgaW4gYnkgdGhpcy5maW5pc2hcbiAgdW5kZXJCcmlkZ2VzOiBQb3NbXSA9IFtdO1xuICB1cFN0YWlyczogUG9zW10gPSBbXTtcbiAgdXBTdGFpcnNFZmZlY3RpdmU6IFBvc1tdID0gW107IC8vIGZvciBtYXRjaGluZyBwdXJwb3Nlcywgc2hpZnQgc29tZSBzdGFpcnMuXG4gIC8vIFRoZXNlIGFyZSBmaWxsZWQgaW4gYnkgT3ZlcnBhc3NTaHVmZmxlQXR0ZW1wdFxuICBkb3duU3RhaXJzOiBQb3NbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGxvYzogTG9jYXRpb24sIHJlYWRvbmx5IG92ZXJwYXNzOiBMb2NhdGlvbixcbiAgICAgICAgICAgICAgcmVhZG9ubHkgcmV2ZXJzZTogYm9vbGVhbikgeyBzdXBlcihsb2MpOyB9XG5cbiAgaW5pdCgpIHtcbiAgICB0aGlzLnVuZGVyQnJpZGdlcyA9IFtdO1xuICAgIHRoaXMudXBTdGFpcnMgPSBbXTtcbiAgICB0aGlzLnVwU3RhaXJzRWZmZWN0aXZlID0gW107XG4gIH1cblxuICBmaW5pc2gobmV3TWV0YTogTWV0YWxvY2F0aW9uKSB7XG4gICAgY29uc3QgdXBTdGFpciA9IHRoaXMucmV2ZXJzZSA/ICdzdGFpcjpkb3duJyA6ICdzdGFpcjp1cCc7XG4gICAgZm9yIChjb25zdCBwb3Mgb2YgbmV3TWV0YS5hbGxQb3MoKSkge1xuICAgICAgY29uc3Qgc2NyID0gbmV3TWV0YS5nZXQocG9zKTtcbiAgICAgIGlmIChzY3IuaGFzRmVhdHVyZSgndW5kZXJwYXNzJykpIHRoaXMudW5kZXJCcmlkZ2VzLnB1c2gocG9zKTtcbiAgICAgIGlmIChzY3IuaGFzRmVhdHVyZSh1cFN0YWlyKSkge1xuICAgICAgICBsZXQgZGVsdGEgPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IGV4aXQgb2Ygc2NyLmRhdGEuZXhpdHMhKSB7XG4gICAgICAgICAgLy8gXCJFZmZlY3RpdmVcIiBwb3MgaXMgc2hpZnRlZCB1cCBvciBkb3duIG9uZSBmb3Igbm9uLWRvdWJsZSBzdGFpcnNcbiAgICAgICAgICBpZiAoZXhpdC50eXBlID09PSAnc3RhaXI6dXAnICYmIGV4aXQuZW50cmFuY2UgPCAweDgwMDApIGRlbHRhID0gLTE2O1xuICAgICAgICAgIGlmIChleGl0LnR5cGUgPT09ICdzdGFpcjpkb3duJyAmJiBleGl0LmVudHJhbmNlID4gMHg4MDAwKSBkZWx0YSA9IDE2O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBTdGFpcnNFZmZlY3RpdmUucHVzaChwb3MgKyBkZWx0YSk7XG4gICAgICAgIHRoaXMudXBTdGFpcnMucHVzaChwb3MpO1xuICAgICAgfVxuICAgICAgLy8gY29uc3QgZXhpdCA9IG5ld01ldGEuZ2V0RXhpdChwb3MsICdzdGFpcjp1cCcpO1xuICAgICAgLy8gaWYgKChleGl0ICYmIChleGl0WzBdID4+PiA4KSkgPT09IHRoaXMub3ZlcnBhc3MuaWQpIHN0YWlyID0gcG9zO1xuICAgIH1cbiAgICAvLyBodHRwOi8vbG9jYWxob3N0OjgwODIvI2ZsYWdzPURzRXJzR3RSb3N0V20mc2VlZD1iNjNjNGIwMiZkZWJ1Z1xuICAgIGlmICghdGhpcy51bmRlckJyaWRnZXMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGJyaWRnZSBpbiAke3RoaXMubG9jfVxcbiR7bmV3TWV0YS5zaG93KCl9YCk7XG4gICAgfVxuICAgIGlmICghdGhpcy51cFN0YWlycy5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgc3RhaXIgaW4gJHt0aGlzLmxvY31cXG4ke25ld01ldGEuc2hvdygpfWApO1xuICAgIH1cblxuICAgIGxldCBzdGFpcnNMZW4gPSAwO1xuICAgIGZvciAoY29uc3QgWywgdHlwZSwgW2Rlc3RdXSBvZiB0aGlzLm9yaWcuZXhpdHMoKSkge1xuICAgICAgaWYgKHR5cGUgPT09IHVwU3RhaXIgJiYgKGRlc3QgPj4+IDgpID09PSB0aGlzLm92ZXJwYXNzLmlkKSBzdGFpcnNMZW4rKztcbiAgICB9XG4gICAgdGhpcy51cFN0YWlycyA9IHRoaXMucmFuZG9tLnNodWZmbGUodGhpcy51cFN0YWlycykuc2xpY2UoMCwgc3RhaXJzTGVuKTtcblxuICAgIHN1cGVyLmZpbmlzaChuZXdNZXRhKTtcbiAgfVxuXG4gIC8vIFRPRE8gLSBjb25zaWRlciBpbnN0ZWFkIHBpY2tFeGl0Rm9yUG9zKHBvczogUG9zLCBvbGRMb2M6IE1ldGFsb2NhdGlvbilcbiAgLy8gdGhhdCB3ZSBjYW4gY2hhbmdlIHRoZSBsb2dpYyBmb3IsIGFuZCBjYWxsIHN1cGVyKCkuXG59XG5cblxuLy8vLyBPVkVSUEFTUzpcbiAgLy8gYWRkRWFybHlGZWF0dXJlc19vbGQoKTogYm9vbGVhbiB7XG4gIC8vICAgaWYgKCFzdXBlci5hZGRFYXJseUZlYXR1cmVzKCkpIHJldHVybiBmYWxzZTtcbiAgLy8gICBsZXQgZGVsdGE6IFBvc3x1bmRlZmluZWQ7XG4gIC8vICAgZm9yIChsZXQgeSA9IDA7IHkgPCB0aGlzLmg7IHkrKykge1xuICAvLyAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLnc7IHgrKykge1xuICAvLyAgICAgICBpZiAodGhpcy5ncmlkLmdldDIoeSArIC41LCB4ICsgLjUpID09PSAnYicpIHtcbiAgLy8gICAgICAgICBkZWx0YSA9ICh5IDw8IDQgfCB4KSBhcyBQb3MgLSB0aGlzLnVuZGVycGFzcy51bmRlckJyaWRnZXNbMF07XG4gIC8vICAgICAgICAgYnJlYWs7XG4gIC8vICAgICAgIH1cbiAgLy8gICAgIH1cbiAgLy8gICAgIGlmIChkZWx0YSAhPSBudWxsKSBicmVhaztcbiAgLy8gICB9XG4gIC8vICAgaWYgKGRlbHRhID09IG51bGwpIHRocm93IG5ldyBFcnJvcihgTmV2ZXIgZm91bmQgdGhlIGZpcnN0IG92ZXJwYXNzYCk7XG5cbiAgLy8gICAvLyBBZGQgdGhlIHJlbWFpbmluZyBicmlkZ2VzIGFuZCBzdGFpcnMuXG4gIC8vICAgZm9yIChjb25zdCBicmlkZ2Ugb2YgdGhpcy51bmRlcnBhc3MudW5kZXJCcmlkZ2VzLnNsaWNlKDEpKSB7XG4gIC8vICAgICBjb25zdCBwb3MgPSBicmlkZ2UgKyBkZWx0YTtcbiAgLy8gICAgIGNvbnN0IHN5ID0gcG9zID4+PiA0O1xuICAvLyAgICAgY29uc3Qgc3ggPSBwb3MgJiAweGY7XG4gIC8vICAgICBjb25zdCBpID0gdGhpcy5ncmlkLmluZGV4MihzeSArIC41LCBzeCArIC41KTtcbiAgLy8gICAgIGlmICh0aGlzLmdyaWQuZGF0YVtpXSAhPT0gJ2MnKSByZXR1cm4gZmFsc2U7IC8vIG91dCBvZiBib3VuZHMuXG4gIC8vICAgICBjb25zdCBjID0gdGhpcy5ncmlkLmNvb3JkKGkpO1xuICAvLyAgICAgdGhpcy5maXhlZC5hZGQoYyk7XG4gIC8vICAgICB0aGlzLmdyaWQuZGF0YVtpXSA9ICdiJztcbiAgLy8gICAgIHRoaXMuZ3JpZC5kYXRhW2kgLSAxXSA9ICcnO1xuICAvLyAgICAgdGhpcy5ncmlkLmRhdGFbaSArIDFdID0gJyc7XG4gIC8vICAgfVxuICAvLyAgIGZvciAoY29uc3Qgc3RhaXIgb2YgdGhpcy51bmRlcnBhc3MudXBTdGFpcnNFZmZlY3RpdmUpIHtcbiAgLy8gICAgIGNvbnN0IHBvcyA9IHN0YWlyICsgZGVsdGE7XG4gIC8vICAgICBjb25zdCBzeSA9IHBvcyA+Pj4gNDtcbiAgLy8gICAgIGNvbnN0IHN4ID0gcG9zICYgMHhmO1xuICAvLyAgICAgY29uc3QgaSA9IHRoaXMuZ3JpZC5pbmRleDIoc3kgKyAuNSwgc3ggKyAuNSk7XG4gIC8vICAgICBpZiAodGhpcy5ncmlkLmRhdGFbaV0gIT09ICdjJykgcmV0dXJuIGZhbHNlO1xuICAvLyAgICAgY29uc3QgYyA9IHRoaXMuZ3JpZC5jb29yZChpKTtcbiAgLy8gICAgIHRoaXMuZml4ZWQuYWRkKGMpO1xuICAvLyAgICAgdGhpcy51bmRlcnBhc3MuZG93blN0YWlycy5wdXNoKGNvb3JkVG9Qb3MoYykpO1xuICAvLyAgICAgdGhpcy5ncmlkLmRhdGFbaV0gPSB0aGlzLnJldmVyc2UgPyAnPCcgOiAnPic7XG4gIC8vICAgICB0aGlzLmdyaWQuZGF0YVtpICsgdGhpcy5ncmlkLnJvd10gPSAnJztcbiAgLy8gICAgIC8vIFBpY2sgYSBzaW5nbGUgZGlyZWN0aW9uIGZvciB0aGUgc3RhaXIuXG4gIC8vICAgICBsZXQgbmVpZ2hib3JzID0gW2MgLSA4LCBjICsgOCwgYyAtIDB4ODAwXSBhcyBHcmlkQ29vcmRbXTtcbiAgLy8gICAgIC8vIE5PVEU6IGlmIHdlIGRlbGV0ZSB0aGVuIHdlIGZvcmdldCB0byB6ZXJvIGl0IG91dC4uLlxuICAvLyAgICAgLy8gaWYgKHRoaXMuZGVsdGEgPCAtMTYpIG5laWdoYm9ycy5zcGxpY2UoMiwgMSk7XG4gIC8vICAgICAvLyBpZiAoKHRoaXMuZGVsdGEgJiAweGYpIDwgOCkgbmVpZ2hib3JzLnNwbGljZSgxLCAxKTtcbiAgLy8gICAgIG5laWdoYm9ycyA9IG5laWdoYm9ycy5maWx0ZXIoYyA9PiB0aGlzLmdyaWQuZ2V0KGMpID09PSAnYycpO1xuICAvLyAgICAgaWYgKCFuZWlnaGJvcnMubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gIC8vICAgICBjb25zdCBrZWVwID0gdGhpcy5yYW5kb20ubmV4dEludChuZWlnaGJvcnMubGVuZ3RoKTtcbiAgLy8gICAgIGZvciAobGV0IGogPSAwOyBqIDwgbmVpZ2hib3JzLmxlbmd0aDsgaisrKSB7XG4gIC8vICAgICAgIGlmIChqICE9PSBrZWVwKSB0aGlzLmdyaWQuc2V0KG5laWdoYm9yc1tqXSwgJycpO1xuICAvLyAgICAgfVxuICAvLyAgIH1cbiAgLy8gICByZXR1cm4gdHJ1ZTtcbiAgLy8gfVxuIl19