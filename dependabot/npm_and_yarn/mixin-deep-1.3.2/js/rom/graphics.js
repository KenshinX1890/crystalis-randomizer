import { DefaultMap } from '../util.js';
import { ACTION_SCRIPTS, Monster } from './monster.js';
import { Constraint } from './constraint.js';
export class Graphics {
    constructor(rom) {
        this.rom = rom;
        this.monsterConstraints = new Map();
        this.npcConstraints = new Map();
        this.allSpritePalettes = new Set();
        const allSpawns = new DefaultMap(() => []);
        for (const l of rom.locations) {
            if (!l.used)
                continue;
            for (let i = 0; i < l.spawns.length; i++) {
                const s = l.spawns[i];
                if (!s.used)
                    continue;
                if (s.isMonster()) {
                    allSpawns.get(s.monsterId).push([l, i, s]);
                }
                else if (s.isNpc()) {
                    allSpawns.get(~s.id).push([l, i, s]);
                }
            }
        }
        for (const [m, spawns] of allSpawns) {
            if (m < 0) {
                const metasprite = rom.metasprites[rom.npcs[~m].data[3]];
                if (!metasprite)
                    throw new Error(`bad NPC: ${~m}`);
                let constraint = this.computeConstraint([rom.npcs[~m].data[3]], spawns, true);
                if (~m === 0x5f)
                    constraint = constraint.ignorePalette();
                this.npcConstraints.set(~m, constraint);
            }
            else {
                let constraint = Constraint.ALL;
                const parent = this.rom.objects[m];
                if (!(parent instanceof Monster)) {
                    throw new Error(`expected monster: ${parent} from ${spawns}`);
                }
                for (const obj of allObjects(rom, parent)) {
                    const action = ACTION_SCRIPTS.get(obj.action);
                    const metaspriteFn = action && action.metasprites || (() => [obj.metasprite]);
                    const child = this.computeConstraint(metaspriteFn(obj), spawns, obj.id === m);
                    const meet = constraint.meet(child);
                    if (!meet)
                        throw new Error(`Bad meet for ${m} with ${obj.id}`);
                    if (meet)
                        constraint = meet;
                }
                this.monsterConstraints.set(parent.id, constraint);
                parent.constraint = constraint;
            }
        }
    }
    getMonsterConstraint(locationId, monsterId) {
        const c = this.monsterConstraints.get(monsterId) || Constraint.NONE;
        if ((locationId & 0x58) === 0x58)
            return c;
        const m = this.rom.objects[monsterId].goldDrop;
        if (!m)
            return c;
        return c.meet(Constraint.COIN) || Constraint.NONE;
    }
    shufflePalettes(random) {
        const pal = [...this.allSpritePalettes];
        for (const [k, c] of this.monsterConstraints) {
            this.monsterConstraints.set(k, c.shufflePalette(random, pal));
        }
        for (const [k, c] of this.npcConstraints) {
            this.npcConstraints.set(k, c.shufflePalette(random, pal));
        }
    }
    configure(location, spawn) {
        if (!spawn.used)
            return;
        const c = spawn.isMonster() ? this.monsterConstraints.get(spawn.monsterId) :
            spawn.isNpc() ? this.npcConstraints.get(spawn.id) :
                spawn.isChest() ? (spawn.id < 0x70 ? Constraint.TREASURE_CHEST :
                    Constraint.MIMIC) :
                    undefined;
        if (!c)
            return;
        if (c.shift === 3 || c.float.length >= 2) {
            throw new Error(`don't know what to do with two floats`);
        }
        else if (!c.float.length) {
            spawn.patternBank = Number(c.shift === 2);
        }
        else if (c.float[0].has(location.spritePatterns[0])) {
            spawn.patternBank = 0;
        }
        else if (c.float[0].has(location.spritePatterns[1])) {
            spawn.patternBank = 1;
        }
        else if (spawn.isMonster()) {
            throw new Error(`no matching pattern bank`);
        }
    }
    computeConstraint(metaspriteIds, spawns, shiftable) {
        const patterns = new Set();
        const palettes = new Set();
        for (const metasprite of metaspriteIds.map(s => this.rom.metasprites[s])) {
            for (const p of metasprite.palettes()) {
                palettes.add(p);
            }
            for (const p of metasprite.patternBanks()) {
                patterns.add(p);
            }
        }
        shiftable = shiftable && patterns.size == 1 && [...patterns][0] === 2;
        const locs = new Map();
        for (const [l, , spawn] of spawns) {
            locs.set(spawn.patternBank && shiftable ? ~l.id : l.id, spawn);
        }
        let child = undefined;
        for (let [l, spawn] of locs) {
            const loc = this.rom.locations[l < 0 ? ~l : l];
            for (const pal of palettes) {
                if (pal > 1)
                    this.allSpritePalettes.add(loc.spritePalettes[pal - 2]);
            }
            const c = Constraint.fromSpawn(palettes, patterns, loc, spawn, shiftable);
            child = child ? child.join(c) : c;
            if (!shiftable && spawn.patternBank)
                child = child.shifted();
        }
        if (!child)
            throw new Error(`Expected child to appear`);
        return child;
    }
}
function* allObjects(rom, parent) {
    yield parent;
    const repl = parent.spawnedReplacement();
    if (repl)
        yield* allObjects(rom, repl);
    const child = parent.spawnedChild();
    if (child)
        yield* allObjects(rom, child);
    if (parent.id === 0x50)
        yield rom.objects[0x5f];
    if (parent.id === 0x53)
        yield rom.objects[0x69];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JhcGhpY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvanMvcm9tL2dyYXBoaWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFFdEMsT0FBTyxFQUFDLGNBQWMsRUFBRSxPQUFPLEVBQUMsTUFBTSxjQUFjLENBQUM7QUFDckQsT0FBTyxFQUFDLFVBQVUsRUFBQyxNQUFNLGlCQUFpQixDQUFDO0FBUTNDLE1BQU0sT0FBTyxRQUFRO0lBT25CLFlBQXFCLEdBQVE7UUFBUixRQUFHLEdBQUgsR0FBRyxDQUFLO1FBTDdCLHVCQUFrQixHQUFHLElBQUksR0FBRyxFQUFzQixDQUFDO1FBQ25ELG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQXNCLENBQUM7UUFFL0Msc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUtwQyxNQUFNLFNBQVMsR0FDWCxJQUFJLFVBQVUsQ0FBb0QsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFaEYsS0FBSyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsU0FBUyxFQUFFO1lBQzdCLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFBRSxTQUFTO1lBQ3RCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDeEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJO29CQUFFLFNBQVM7Z0JBQ3RCLElBQUksQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFO29CQUNqQixTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFF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QUFVLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBTXpDLElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxJQUFJO1FBQUUsTUFBTSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBWSxDQUFDO0lBQzNELElBQUksTUFBTSxDQUFDLEVBQUUsS0FBSyxJQUFJO1FBQUUsTUFBTSxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBWSxDQUFDO0FBQzdELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1JvbX0gZnJvbSAnLi4vcm9tLmpzJztcbmltcG9ydCB7RGVmYXVsdE1hcH0gZnJvbSAnLi4vdXRpbC5qcyc7XG5pbXBvcnQge0xvY2F0aW9uLCBTcGF3bn0gZnJvbSAnLi9sb2NhdGlvbi5qcyc7XG5pbXBvcnQge0FDVElPTl9TQ1JJUFRTLCBNb25zdGVyfSBmcm9tICcuL21vbnN0ZXIuanMnO1xuaW1wb3J0IHtDb25zdHJhaW50fSBmcm9tICcuL2NvbnN0cmFpbnQuanMnO1xuaW1wb3J0IHtSYW5kb219IGZyb20gJy4uL3JhbmRvbS5qcyc7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLy8gVGhpcyBhY3R1YWxseSBhcHBlYXJzIHRvIGJlIG1vcmUgb2YgYSBHcmFwaGljc0NvbnN0cmFpbnRzIGNsYXNzP1xuLy8gICAtIG1heWJlIGRvbid0IHN0b3JlIHRoZSBjb25zdHJhaW50cyBvbiBNb25zdGVyP1xuXG5leHBvcnQgY2xhc3MgR3JhcGhpY3Mge1xuXG4gIG1vbnN0ZXJDb25zdHJhaW50cyA9IG5ldyBNYXA8bnVtYmVyLCBDb25zdHJhaW50PigpO1xuICBucGNDb25zdHJhaW50cyA9IG5ldyBNYXA8bnVtYmVyLCBDb25zdHJhaW50PigpO1xuXG4gIGFsbFNwcml0ZVBhbGV0dGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgcm9tOiBSb20pIHtcbiAgICAvLyBJdGVyYXRlIG92ZXIgbG9jYXRpb25zL3NwYXducyB0byBidWlsZCBtdWx0aW1hcCBvZiB3aGVyZSBtb25zdGVycyBhcHBlYXIuXG4gICAgLy8gUG9zdGl2ZSBrZXlzIGFyZSBtb25zdGVycywgbmVnYXRpdmUga2V5cyBhcmUgTlBDcy5cbiAgICBjb25zdCBhbGxTcGF3bnMgPVxuICAgICAgICBuZXcgRGVmYXVsdE1hcDxudW1iZXIsIEFycmF5PHJlYWRvbmx5IFtMb2NhdGlvbiwgbnVtYmVyLCBTcGF3bl0+PigoKSA9PiBbXSk7XG5cbiAgICBmb3IgKGNvbnN0IGwgb2Ygcm9tLmxvY2F0aW9ucykge1xuICAgICAgaWYgKCFsLnVzZWQpIGNvbnRpbnVlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsLnNwYXducy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBzID0gbC5zcGF3bnNbaV07XG4gICAgICAgIGlmICghcy51c2VkKSBjb250aW51ZTtcbiAgICAgICAgaWYgKHMuaXNNb25zdGVyKCkpIHtcbiAgICAgICAgICBhbGxTcGF3bnMuZ2V0KHMubW9uc3RlcklkKS5wdXNoKFtsLCBpLCBzXSk7XG4gICAgICAgIH0gZWxzZSBpZiAocy5pc05wYygpKSB7XG4gICAgICAgICAgYWxsU3Bhd25zLmdldCh+cy5pZCkucHVzaChbbCwgaSwgc10pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEZvciBlYWNoIG1vbnN0ZXIsIGRldGVybWluZSB3aGljaCBwYXR0ZXJucyBhbmQgcGFsZXR0ZXMgYXJlIHVzZWQuXG4gICAgZm9yIChjb25zdCBbbSwgc3Bhd25zXSBvZiBhbGxTcGF3bnMpIHtcbiAgICAgIC8vIFRPRE8gLSBmb2xkIGludG8gcGF0Y2guc2h1ZmZsZU1vbnN0ZXJzXG4gICAgICAvL2lmIChtID09PSAwKSBjb250aW51ZTsgLy8gdXNlZCB0byBzdXBwcmVzcyBidWdneSBzdHJheSBzcGF3bnNcbiAgICAgIGlmIChtIDwgMCkgeyAvLyBOUENcbiAgICAgICAgY29uc3QgbWV0YXNwcml0ZSA9IHJvbS5tZXRhc3ByaXRlc1tyb20ubnBjc1t+bV0uZGF0YVszXV07XG4gICAgICAgIGlmICghbWV0YXNwcml0ZSkgdGhyb3cgbmV3IEVycm9yKGBiYWQgTlBDOiAke35tfWApO1xuICAgICAgICBsZXQgY29uc3RyYWludCA9IHRoaXMuY29tcHV0ZUNvbnN0cmFpbnQoW3JvbS5ucGNzW35tXS5kYXRhWzNdXSwgc3Bhd25zLCB0cnVlKTtcbiAgICAgICAgLy8gVE9ETyAtIGJldHRlciB3YXkgc3RyZWFtbGluZSB0aGlzLi4uP1xuICAgICAgICBpZiAofm0gPT09IDB4NWYpIGNvbnN0cmFpbnQgPSBjb25zdHJhaW50Lmlnbm9yZVBhbGV0dGUoKTtcbiAgICAgICAgdGhpcy5ucGNDb25zdHJhaW50cy5zZXQofm0sIGNvbnN0cmFpbnQpO1xuICAgICAgfSBlbHNlIHsgLy8gbW9uc3RlclxuICAgICAgICBsZXQgY29uc3RyYWludCA9IENvbnN0cmFpbnQuQUxMO1xuICAgICAgICBjb25zdCBwYXJlbnQgPSB0aGlzLnJvbS5vYmplY3RzW21dO1xuICAgICAgICBpZiAoIShwYXJlbnQgaW5zdGFuY2VvZiBNb25zdGVyKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgZXhwZWN0ZWQgbW9uc3RlcjogJHtwYXJlbnR9IGZyb20gJHtzcGF3bnN9YCk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBvYmogb2YgYWxsT2JqZWN0cyhyb20sIHBhcmVudCkpIHtcbiAgICAgICAgICBjb25zdCBhY3Rpb24gPSBBQ1RJT05fU0NSSVBUUy5nZXQob2JqLmFjdGlvbik7XG4gICAgICAgICAgY29uc3QgbWV0YXNwcml0ZUZuOiAobTogTW9uc3RlcikgPT4gcmVhZG9ubHkgbnVtYmVyW10gPVxuICAgICAgICAgICAgICBhY3Rpb24gJiYgYWN0aW9uLm1ldGFzcHJpdGVzIHx8ICgoKSA9PiBbb2JqLm1ldGFzcHJpdGVdKTtcbiAgICAgICAgICBjb25zdCBjaGlsZCA9IHRoaXMuY29tcHV0ZUNvbnN0cmFpbnQobWV0YXNwcml0ZUZuKG9iaiksIHNwYXducywgb2JqLmlkID09PSBtKTtcbiAgICAgICAgICBjb25zdCBtZWV0ID0gY29uc3RyYWludC5tZWV0KGNoaWxkKTtcbiAgICAgICAgICBpZiAoIW1lZXQpIHRocm93IG5ldyBFcnJvcihgQmFkIG1lZXQgZm9yICR7bX0gd2l0aCAke29iai5pZH1gKTtcbiAgICAgICAgICBpZiAobWVldCkgY29uc3RyYWludCA9IG1lZXQ7XG4gICAgICAgICAgLy8gVE9ETyAtIGVsc2UgZXJyb3I/IHdhcm4/XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5tb25zdGVyQ29uc3RyYWludHMuc2V0KHBhcmVudC5pZCwgY29uc3RyYWludCk7XG4gICAgICAgIHBhcmVudC5jb25zdHJhaW50ID0gY29uc3RyYWludDsgIC8vIGZvciBkZWJ1Z2dpbmdcbiAgICAgIH1cbiAgICB9ICAgIFxuICB9XG5cbiAgZ2V0TW9uc3RlckNvbnN0cmFpbnQobG9jYXRpb25JZDogbnVtYmVyLCBtb25zdGVySWQ6IG51bWJlcik6IENvbnN0cmFpbnQge1xuICAgIGNvbnN0IGMgPSB0aGlzLm1vbnN0ZXJDb25zdHJhaW50cy5nZXQobW9uc3RlcklkKSB8fCBDb25zdHJhaW50Lk5PTkU7XG4gICAgaWYgKChsb2NhdGlvbklkICYgMHg1OCkgPT09IDB4NTgpIHJldHVybiBjO1xuICAgIGNvbnN0IG0gPSB0aGlzLnJvbS5vYmplY3RzW21vbnN0ZXJJZF0uZ29sZERyb3A7XG4gICAgaWYgKCFtKSByZXR1cm4gYztcbiAgICByZXR1cm4gYy5tZWV0KENvbnN0cmFpbnQuQ09JTikgfHwgQ29uc3RyYWludC5OT05FO1xuICB9XG5cbiAgc2h1ZmZsZVBhbGV0dGVzKHJhbmRvbTogUmFuZG9tKTogdm9pZCB7XG4gICAgY29uc3QgcGFsID0gWy4uLnRoaXMuYWxsU3ByaXRlUGFsZXR0ZXNdO1xuICAgIGZvciAoY29uc3QgW2ssIGNdIG9mIHRoaXMubW9uc3RlckNvbnN0cmFpbnRzKSB7XG4gICAgICB0aGlzLm1vbnN0ZXJDb25zdHJhaW50cy5zZXQoaywgYy5zaHVmZmxlUGFsZXR0ZShyYW5kb20sIHBhbCkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrLCBjXSBvZiB0aGlzLm5wY0NvbnN0cmFpbnRzKSB7XG4gICAgICB0aGlzLm5wY0NvbnN0cmFpbnRzLnNldChrLCBjLnNodWZmbGVQYWxldHRlKHJhbmRvbSwgcGFsKSk7XG4gICAgfVxuICB9XG5cbiAgY29uZmlndXJlKGxvY2F0aW9uOiBMb2NhdGlvbiwgc3Bhd246IFNwYXduKSB7XG4gICAgaWYgKCFzcGF3bi51c2VkKSByZXR1cm47XG4gICAgY29uc3QgYyA9IHNwYXduLmlzTW9uc3RlcigpID8gdGhpcy5tb25zdGVyQ29uc3RyYWludHMuZ2V0KHNwYXduLm1vbnN0ZXJJZCkgOlxuICAgICAgICBzcGF3bi5pc05wYygpID8gdGhpcy5ucGNDb25zdHJhaW50cy5nZXQoc3Bhd24uaWQpIDpcbiAgICAgICAgc3Bhd24uaXNDaGVzdCgpID8gKHNwYXduLmlkIDwgMHg3MCA/IENvbnN0cmFpbnQuVFJFQVNVUkVfQ0hFU1QgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgQ29uc3RyYWludC5NSU1JQykgOlxuICAgICAgICB1bmRlZmluZWQ7XG4gICAgaWYgKCFjKSByZXR1cm47XG4gICAgaWYgKGMuc2hpZnQgPT09IDMgfHwgYy5mbG9hdC5sZW5ndGggPj0gMikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBkb24ndCBrbm93IHdoYXQgdG8gZG8gd2l0aCB0d28gZmxvYXRzYCk7XG4gICAgfSBlbHNlIGlmICghYy5mbG9hdC5sZW5ndGgpIHtcbiAgICAgIHNwYXduLnBhdHRlcm5CYW5rID0gTnVtYmVyKGMuc2hpZnQgPT09IDIpO1xuICAgIH0gZWxzZSBpZiAoYy5mbG9hdFswXS5oYXMobG9jYXRpb24uc3ByaXRlUGF0dGVybnNbMF0pKSB7XG4gICAgICBzcGF3bi5wYXR0ZXJuQmFuayA9IDA7XG4gICAgfSBlbHNlIGlmIChjLmZsb2F0WzBdLmhhcyhsb2NhdGlvbi5zcHJpdGVQYXR0ZXJuc1sxXSkpIHtcbiAgICAgIHNwYXduLnBhdHRlcm5CYW5rID0gMTtcbiAgICB9IGVsc2UgaWYgKHNwYXduLmlzTW9uc3RlcigpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYG5vIG1hdGNoaW5nIHBhdHRlcm4gYmFua2ApO1xuICAgIH1cbiAgfVxuXG4gIGNvbXB1dGVDb25zdHJhaW50KG1ldGFzcHJpdGVJZHM6IHJlYWRvbmx5IG51bWJlcltdLFxuICAgICAgICAgICAgICAgICAgICBzcGF3bnM6IFNwYXducyxcbiAgICAgICAgICAgICAgICAgICAgc2hpZnRhYmxlOiBib29sZWFuKTogQ29uc3RyYWludCB7XG5cbiAgICBjb25zdCBwYXR0ZXJucyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICAgIGNvbnN0IHBhbGV0dGVzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgZm9yIChjb25zdCBtZXRhc3ByaXRlIG9mIG1ldGFzcHJpdGVJZHMubWFwKHMgPT4gdGhpcy5yb20ubWV0YXNwcml0ZXNbc10pKSB7XG4gICAgICAvLyBXaGljaCBwYWxldHRlIGFuZCBwYXR0ZXJuIGJhbmtzIGFyZSByZWZlcmVuY2VkP1xuICAgICAgZm9yIChjb25zdCBwIG9mIG1ldGFzcHJpdGUucGFsZXR0ZXMoKSkge1xuICAgICAgICBwYWxldHRlcy5hZGQocCk7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IHAgb2YgbWV0YXNwcml0ZS5wYXR0ZXJuQmFua3MoKSkge1xuICAgICAgICBwYXR0ZXJucy5hZGQocCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gb2JqLnVzZWRQYWxldHRlcyA9IFsuLi5wYWxldHRlc107XG4gICAgLy8gb2JqLnVzZWRQYXR0ZXJucyA9IFsuLi5wYXR0ZXJuc107XG5cbiAgICAvLyBJZiBvbmx5IHRoaXJkLWJhbmsgcGF0dGVybnMgYXJlIHVzZWQsIHRoZW4gdGhlIG1ldGFzcHJpdGUgY2FuIGJlXG4gICAgLy8gc2hpZnRlZCB0byBmb3VydGggYmFuayB3aGVuIG5lY2Vzc2FyeS4gIFRoaXMgaXMgb25seSB0cnVlIGZvciBOUENcbiAgICAvLyBzcGF3bnMuICBBZCBob2Mgc3Bhd25zIGNhbm5vdCBiZSBzaGlmdGVkICh5ZXQ/KS5cbiAgICBzaGlmdGFibGUgPSBzaGlmdGFibGUgJiYgcGF0dGVybnMuc2l6ZSA9PSAxICYmIFsuLi5wYXR0ZXJuc11bMF0gPT09IDI7XG5cbiAgICAvLyBJZiB0aGUgc3Bhd24gc2V0cyBwYXR0ZXJuQmFuayB0aGVuIHdlIG5lZWQgdG8gaW5jcmVtZW50IGVhY2ggcGF0dGVybi5cbiAgICAvLyBXZSBoYXZlIHRoZSBmcmVlZG9tIHRvIHNldCB0aGlzIHRvIGVpdGhlciwgZGVwZW5kaW5nLlxuICAgIGNvbnN0IGxvY3MgPSBuZXcgTWFwPG51bWJlciwgU3Bhd24+KCk7XG4gICAgZm9yIChjb25zdCBbbCwgLCBzcGF3bl0gb2Ygc3Bhd25zKSB7XG4gICAgICBsb2NzLnNldChzcGF3bi5wYXR0ZXJuQmFuayAmJiBzaGlmdGFibGUgPyB+bC5pZCA6IGwuaWQsIHNwYXduKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPIC0gQ29uc3RyYWludEJ1aWxkZXJcbiAgICAvLyAgIC0tIGtlZXBzIHRyYWNrIG9ubHkgb2YgcmVsZXZhbnQgZmFjdG9ycywgaW4gYSBqb2luLlxuICAgIC8vICAgICAgLS0+IG5vIG1lZXRpbmcgaW52b2x2ZWQhXG4gICAgbGV0IGNoaWxkID0gdW5kZWZpbmVkO1xuXG4gICAgZm9yIChsZXQgW2wsIHNwYXduXSBvZiBsb2NzKSB7XG4gICAgICBjb25zdCBsb2MgPSB0aGlzLnJvbS5sb2NhdGlvbnNbbCA8IDAgPyB+bCA6IGxdO1xuICAgICAgZm9yIChjb25zdCBwYWwgb2YgcGFsZXR0ZXMpIHtcbiAgICAgICAgaWYgKHBhbCA+IDEpIHRoaXMuYWxsU3ByaXRlUGFsZXR0ZXMuYWRkKGxvYy5zcHJpdGVQYWxldHRlc1twYWwgLSAyXSk7XG4gICAgICB9XG4gICAgICBjb25zdCBjID0gQ29uc3RyYWludC5mcm9tU3Bhd24ocGFsZXR0ZXMsIHBhdHRlcm5zLCBsb2MsIHNwYXduLCBzaGlmdGFibGUpO1xuICAgICAgY2hpbGQgPSBjaGlsZCA/IGNoaWxkLmpvaW4oYykgOiBjO1xuICAgICAgaWYgKCFzaGlmdGFibGUgJiYgc3Bhd24ucGF0dGVybkJhbmspIGNoaWxkID0gY2hpbGQuc2hpZnRlZCgpO1xuXG4gICAgICAvLyAtLS0gaGFuZGxlIHNoaWZ0cyBiZXR0ZXIuLi4/IHN1cHBvc2UgZS5nLiBtdWx0aXBsZSBwYWwyJ3NcbiAgICAgIC8vICAgIC0+IHdlIHdhbnQgdG8gam9pbiB0aGVtIC0gd2lsbCBoYXZlIG11bHRpcGxlIHNoaWZ0YWJsZXMuLi5cbiAgICAgIC8vY29uc3RyYWludCA9IGNvbnN0cmFpbnQuXG4gICAgfVxuXG4gICAgLy8gSWYgd2UncmUgc2hpZnRhYmxlLCBzYXZlIHRoZSBzZXQgb2YgcG9zc2libGUgc2hpZnQgYmFua3NcbiAgICBpZiAoIWNoaWxkKSB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGNoaWxkIHRvIGFwcGVhcmApO1xuICAgIC8vIGlmIChjaGlsZC5mbG9hdC5sZW5ndGggPT09IDEpIHtcbiAgICAvLyAgIHBhcmVudC5zaGlmdFBhdHRlcm5zID0gbmV3IFNldChjaGlsZC5mbG9hdFswXSk7XG4gICAgLy8gfVxuICAgIHJldHVybiBjaGlsZDtcbiAgfVxufVxuXG5mdW5jdGlvbiogYWxsT2JqZWN0cyhyb206IFJvbSwgcGFyZW50OiBNb25zdGVyKTogSXRlcmFibGU8TW9uc3Rlcj4ge1xuICB5aWVsZCBwYXJlbnQ7XG4gIGNvbnN0IHJlcGwgPSBwYXJlbnQuc3Bhd25lZFJlcGxhY2VtZW50KCk7XG4gIGlmIChyZXBsKSB5aWVsZCogYWxsT2JqZWN0cyhyb20sIHJlcGwpO1xuICBjb25zdCBjaGlsZCA9IHBhcmVudC5zcGF3bmVkQ2hpbGQoKTtcbiAgaWYgKGNoaWxkKSB5aWVsZCogYWxsT2JqZWN0cyhyb20sIGNoaWxkKTtcbiAgLy8gVE9ETyAtIHRoZXNlIGRvbid0IG1ha2Ugc2Vuc2UgdG8gcHV0IGluIHNwYXduZWRSZXBsYWNlbWVudCBiZWNhdXNlXG4gIC8vIHdlIGRvbid0IHdhbnQgdG8gb3Zlci1pbmZsYXRlIHJlZCBzbGltZXMgZHVlIHRvIGdpYW50IHJlZCBzbGltZXMnXG4gIC8vIGRpZmZpY3VsdHksIHNpbmNlIG1vc3QgZm9sa3Mgd2lsbCBuZXZlciBoYXZlIHRvIGRlYWwgd2l0aCB0aGF0LlxuICAvLyBCdXQgd2UgZG8gbmVlZCB0byBtYWtlIHN1cmUgdGhhdCB0aGV5IGdldCBcInVuLWZsb2F0ZWRcIiBzaW5jZSB0aGVcbiAgLy8gcmVwbGFjZW1lbnQgc3Bhd24gd2lsbCBub3Qgc2hhcmUgdGhlIHNhbWUgMzgwOjIwIChmb3Igbm93KS5cbiAgaWYgKHBhcmVudC5pZCA9PT0gMHg1MCkgeWllbGQgcm9tLm9iamVjdHNbMHg1Zl0gYXMgTW9uc3RlcjsgLy8gYmx1ZSBzbGltZVxuICBpZiAocGFyZW50LmlkID09PSAweDUzKSB5aWVsZCByb20ub2JqZWN0c1sweDY5XSBhcyBNb25zdGVyOyAvLyByZWQgc2xpbWVcbn1cblxudHlwZSBTcGF3bnMgPSBSZWFkb25seUFycmF5PHJlYWRvbmx5IFtMb2NhdGlvbiwgbnVtYmVyLCBTcGF3bl0+O1xuIl19