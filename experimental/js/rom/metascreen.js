import { featureMask } from './metascreendata.js';
import { DefaultMap } from '../util.js';
export class Metascreen {
    constructor(rom, uid, data) {
        var _a, _b, _c, _d, _e;
        this.rom = rom;
        this.uid = uid;
        this.data = data;
        this._tilesets = new Set();
        this.used = false;
        this.neighbors = [
            new DefaultMap((s) => this._checkNeighbor(s, 0)),
            new DefaultMap((s) => this._checkNeighbor(s, 1)),
        ];
        for (const tileset of Object.values(data.tilesets)) {
            if (!tileset.requires)
                this.used = true;
        }
        let features = 0;
        for (const feature of (_a = data.feature) !== null && _a !== void 0 ? _a : []) {
            const mask = featureMask[feature];
            if (mask != null)
                features |= mask;
        }
        for (const exit of (_b = data.exits) !== null && _b !== void 0 ? _b : []) {
            if (exit.type === 'stair:down' || exit.type === 'stair:up') {
                features |= featureMask[exit.type];
            }
        }
        this._features = features;
        this._isEmpty = Boolean(features & featureMask['empty']);
        this.flag = data.flag;
        const cxn = [[[]], [[]], [[]], [[]]];
        this.connections = cxn;
        for (let i = 0; i < 4; i++) {
            let poiIndex = 0;
            let exitIndex = 0;
            let cur = cxn[i][0];
            for (const term of (_c = this.data.connect) !== null && _c !== void 0 ? _c : '') {
                if (connectionBlocks[i].includes(term)) {
                    cxn[i].push(cur = []);
                    continue;
                }
                let delta;
                if (connectionBlockSet.has(term))
                    continue;
                if (term === 'p') {
                    delta = 0xf0 | poiIndex++;
                }
                else if (term === 'x') {
                    delta = 0xe0 | exitIndex++;
                }
                else {
                    const num = parseInt(term, 16);
                    if (!num)
                        throw new Error(`bad term: '${term}'`);
                    const channel = (num & 3) << (num & 4);
                    const offset = num & 8 ? (num & 4 ? 0x0100 : 0x1000) : 0;
                    delta = channel | offset;
                }
                cur.push(delta);
            }
            while (poiIndex < ((_d = this.data.poi) === null || _d === void 0 ? void 0 : _d.length)) {
                cur.push(0xf0 | poiIndex++);
            }
            while (exitIndex < ((_e = this.data.exits) === null || _e === void 0 ? void 0 : _e.length)) {
                cur.push(0xe0 | exitIndex++);
            }
        }
    }
    get features() {
        return this._features;
    }
    get manual() {
        return Boolean(this._features & manualFeatureMask);
    }
    get counted() {
        return Boolean(this._features & countedFeatureMask);
    }
    hasFeature(feature) {
        return Boolean(this._features & featureMask[feature]);
    }
    hasFeatures(features) {
        return (this._features & features) === features;
    }
    withFeature(feature) {
        throw new Error();
    }
    isEmpty() {
        return this._isEmpty;
    }
    hasStair() {
        return Boolean(this._features & (featureMask['stair:up'] |
            featureMask['stair:down']));
    }
    withObstruction() {
        throw new Error();
    }
    isCompatibleWithTileset(id) {
        for (const tileset of this._tilesets) {
            if (tileset.tilesetId === id)
                return true;
        }
        return false;
    }
    replace(from, to) {
        const { tiles } = this.screen;
        for (let i = 0; i < tiles.length; i++) {
            if (tiles[i] === from)
                tiles[i] = to;
        }
        return this;
    }
    remove() {
        for (const tileset of this.tilesets()) {
            tileset.deleteScreen(this);
        }
    }
    tilesets() {
        const tilesets = [];
        for (const key in this.data.tilesets) {
            tilesets.push(this.rom.metatilesets[key]);
        }
        return tilesets;
    }
    setGridTile(...tile) {
        this.data.tile = tile;
        for (const tileset of this.tilesets()) {
            tileset.invalidate();
        }
    }
    get sid() {
        return this.data.id;
    }
    set sid(sid) {
        if (this.sid === sid)
            return;
        this.rom.metascreens.renumber(this.sid, sid);
    }
    get screen() {
        const { sid, rom: { screens } } = this;
        return sid < 0 ? screens.unallocated[~sid] : screens[sid];
    }
    unsafeSetId(sid) {
        this.data.id = sid;
        for (const tileset of this._tilesets) {
            tileset.invalidate();
        }
    }
    unsafeAddTileset(tileset) {
        this._tilesets.add(tileset);
    }
    unsafeRemoveTileset(tileset) {
        this._tilesets.delete(tileset);
    }
    edgeExits() {
        var _a;
        let mask = 0;
        for (const e of (_a = this.data.exits) !== null && _a !== void 0 ? _a : []) {
            const dir = edgeTypeMap[e.type];
            if (dir != null)
                mask |= (1 << dir);
        }
        return mask;
    }
    edgeIndex(edgeType) {
        var _a;
        let index = 0;
        const edge = (_a = this.data.edges) !== null && _a !== void 0 ? _a : '';
        for (let i = 0; i < 4; i++) {
            if (edge[i] === ' ')
                continue;
            if (edge[i] !== edgeType)
                return undefined;
            index |= (1 << i);
        }
        return index;
    }
    findExitType(tile, single, seamless) {
        var _a, _b;
        for (const exit of (_a = this.data.exits) !== null && _a !== void 0 ? _a : []) {
            if (exit.type.startsWith('seamless') !== seamless)
                continue;
            const t0 = single && exit.type === 'edge:bottom' && tile >= 0xc0 ?
                tile + 0x20 : tile;
            if (exit.exits.includes(t0) || ((_b = exit.allowedExits) !== null && _b !== void 0 ? _b : []).includes(t0)) {
                return exit;
            }
        }
        return undefined;
    }
    findExitByType(type) {
        const exit = this.data.exits.find(e => e.type === type);
        if (!exit)
            throw new Error(`no exit ${type}`);
        return exit;
    }
    findEntranceType(coord, single) {
        var _a, _b;
        for (const exit of (_a = this.data.exits) !== null && _a !== void 0 ? _a : []) {
            if (exit.type.startsWith('seamless'))
                continue;
            const c0 = single && exit.type === 'edge:bottom' && coord >= 0xbf00 ?
                coord + 0x2000 : coord;
            const t0 = (c0 & 0xf0) >> 4 | (c0 & 0xf000) >> 8;
            if (exit.entrance === c0 ||
                exit.exits.includes(t0) || ((_b = exit.allowedExits) !== null && _b !== void 0 ? _b : []).includes(t0)) {
                return exit.type;
            }
        }
        return undefined;
    }
    addCustomFlag(defaultValue) {
        this.flag = defaultValue ? 'custom:true' : 'custom:false';
    }
    checkNeighbor(that, dir) {
        const a = dir & 2 ? this : that;
        const b = dir & 2 ? that : this;
        return a.neighbors[dir & 1].get(b);
    }
    _checkNeighbor(that, dir) {
        const e1 = this.data.edges;
        const e2 = that.data.edges;
        if (e1 && e2) {
            const opp = dir ^ 2;
            if (e1[opp] !== '*' && e1[opp] === e2[dir])
                return true;
        }
        return false;
    }
}
const edgeTypeMap = {
    'edge:top': 0,
    'edge:left': 1,
    'edge:bottom': 2,
    'edge:right': 3,
};
const connectionBlocks = [
    '|:',
    '|:=-',
    '|',
    '|=',
];
const connectionBlockSet = new Set(['|', ':', '-', '=']);
const manualFeatures = new Set([
    'arena', 'portoa1', 'portoa2', 'portoa3', 'lake', 'overpass', 'underpass',
    'lighthouse', 'cabin', 'windmill', 'altar', 'pyramid', 'crypt',
]);
const countedFeatures = new Set([
    'pit', 'spikes', 'bridge', 'wall', 'ramp', 'whirlpool',
]);
const manualFeatureMask = [...manualFeatures].map(f => featureMask[f]).reduce((a, b) => a | b);
const countedFeatureMask = [...countedFeatures].map(f => featureMask[f]).reduce((a, b) => a | b);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0YXNjcmVlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9qcy9yb20vbWV0YXNjcmVlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQ0MsV0FBVyxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFJaEQsT0FBTyxFQUFDLFVBQVUsRUFBQyxNQUFNLFlBQVksQ0FBQztBQUl0QyxNQUFNLE9BQU8sVUFBVTtJQTZCckIsWUFBcUIsR0FBUSxFQUFXLEdBQVEsRUFDM0IsSUFBb0I7O1FBRHBCLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFBVyxRQUFHLEdBQUgsR0FBRyxDQUFLO1FBQzNCLFNBQUksR0FBSixJQUFJLENBQWdCO1FBNUJ4QixjQUFTLEdBQUcsSUFBSSxHQUFHLEVBQWUsQ0FBQztRQWNwRCxTQUFJLEdBQUcsS0FBSyxDQUFDO1FBS0osY0FBUyxHQUFHO1lBQ25CLElBQUksVUFBVSxDQUFzQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDckUsSUFBSSxVQUFVLENBQXNCLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztTQUM3RCxDQUFDO1FBT1QsS0FBSyxNQUFNLE9BQU8sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNsRCxJQUFJLENBQUMsT0FBUSxDQUFDLFFBQVE7Z0JBQUUsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7U0FDMUM7UUFHRCxJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDakIsS0FBSyxNQUFNLE9BQU8sVUFBSSxJQUFJLENBQUMsT0FBTyxtQ0FBSSxFQUFFLEVBQUU7WUFDeEMsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ2xD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RmVhdHVyZSwgTWV0YXNjcmVlbkRhdGEsXG4gICAgICAgIGZlYXR1cmVNYXNrfSBmcm9tICcuL21ldGFzY3JlZW5kYXRhLmpzJztcbmltcG9ydCB7TWV0YXRpbGVzZXQsIE1ldGF0aWxlc2V0c30gZnJvbSAnLi9tZXRhdGlsZXNldC5qcyc7XG5pbXBvcnQge1NjcmVlbn0gZnJvbSAnLi9zY3JlZW4uanMnO1xuaW1wb3J0IHtSb219IGZyb20gJy4uL3JvbS5qcyc7XG5pbXBvcnQge0RlZmF1bHRNYXB9IGZyb20gJy4uL3V0aWwuanMnO1xuXG5leHBvcnQgdHlwZSBVaWQgPSBudW1iZXIgJiB7X191aWRfXzogbmV2ZXJ9O1xuXG5leHBvcnQgY2xhc3MgTWV0YXNjcmVlbiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgX2ZlYXR1cmVzOiBudW1iZXI7IC8vID0gbmV3IFNldDxGZWF0dXJlPigpO1xuICBwcml2YXRlIHJlYWRvbmx5IF90aWxlc2V0cyA9IG5ldyBTZXQ8TWV0YXRpbGVzZXQ+KCk7XG4gIHByaXZhdGUgcmVhZG9ubHkgX2lzRW1wdHk6IGJvb2xlYW47XG4gIC8vIGtleTogYml0c2V0IC0gMSBmb3IgZmxpZ2h0LCAyIGZvciBub0ZsYWdcbiAgLy8gdmFsdWU6IHNlZ21lbnRzLCBlYWNoIGNvbnRhaW5pbmcgYW4gb2Zmc2V0IHRvIGFkZCB0byBwb3M8PDggdG8gZ2V0XG4gIC8vICAgICAgICBjb25uZWN0aW9uIHBvaW50cyAoZS5nLiAwMDAxLCAwMTAxLCAxMDIwLCBldGMpLlxuICByZWFkb25seSBjb25uZWN0aW9uczogUmVhZG9ubHlBcnJheTxSZWFkb25seUFycmF5PFJlYWRvbmx5QXJyYXk8bnVtYmVyPj4+O1xuICAvLyBUT0RPIC0gaXQgbWlnaHQgbWFrZSBzZW5zZSB0byBidWlsZCBpbiAnPD5wJyBpbnRvIHRoZSBjb25uZWN0aW9ucyBzdHJpbmcsXG4gIC8vIGluZGljYXRpbmcgd2hpY2ggcGFydGl0aW9ucyBoYXZlIGV4aXRzIG9yIFBPSSAoaW4gb3JkZXIpLiAgQnV0IHRoZSBBUElcbiAgLy8gZm9yIGV4cG9zaW5nIHRoaXMgaXMgdWdseS4gIEFub3RoZXIgYWx0ZXJuYXRpdmUgd291bGQgYmUgdG8gZGVkaWNhdGVcbiAgLy8gYSBwb3J0aW9uIG9mIFwic3BlY3RydW1cIiB0byBwb2kgYW5kIGV4aXRzLCBlLmcuIFtmMC4uZjNdIGZvciBQT0ksIFtlMC4uZTNdXG4gIC8vIGZvciBleGl0cywgYW5kIHRoZW4gd2UgY2FuIGJ1aWxkIGl0IGRpcmVjdGx5IGludG8gY29ubmVjdGlvbnMsIGFuZCB0aGV5XG4gIC8vIHdpbGwgc2hvdyB1cCBpbiB0aGUgcmVzdWx0cy5cbiAgLy9wb2k6IEFycmF5PHt4OiBudW1iZXIsIHk6IG51bWJlciwgcHJpb3JpdHk6IG51bWJlciwgc2VnbWVudDogbnVtYmVyfT47XG5cbiAgdXNlZCA9IGZhbHNlO1xuXG4gIGZsYWc/OiAnYWx3YXlzJyB8ICdjYWxtJyB8ICdjdXN0b206ZmFsc2UnIHwgJ2N1c3RvbTp0cnVlJztcbiAgbmFtZT86IHN0cmluZztcblxuICByZWFkb25seSBuZWlnaGJvcnMgPSBbXG4gICAgbmV3IERlZmF1bHRNYXA8TWV0YXNjcmVlbiwgYm9vbGVhbj4oKHMpID0+IHRoaXMuX2NoZWNrTmVpZ2hib3IocywgMCkpLFxuICAgIG5ldyBEZWZhdWx0TWFwPE1ldGFzY3JlZW4sIGJvb2xlYW4+KChzKSA9PiB0aGlzLl9jaGVja05laWdoYm9yKHMsIDEpKSxcbiAgXSBhcyBjb25zdDtcblxuICAvL3JlYWRvbmx5IGZlYXR1cmVDb3VudDogUmVhZG9ubHlNYXA8RmVhdHVyZSwgbnVtYmVyPjtcblxuICAvLyBUT0RPIC0gbWFrZSBkYXRhIHByaXZhdGU/XG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHJvbTogUm9tLCByZWFkb25seSB1aWQ6IFVpZCxcbiAgICAgICAgICAgICAgcmVhZG9ubHkgZGF0YTogTWV0YXNjcmVlbkRhdGEpIHtcbiAgICBmb3IgKGNvbnN0IHRpbGVzZXQgb2YgT2JqZWN0LnZhbHVlcyhkYXRhLnRpbGVzZXRzKSkge1xuICAgICAgaWYgKCF0aWxlc2V0IS5yZXF1aXJlcykgdGhpcy51c2VkID0gdHJ1ZTtcbiAgICB9XG4gICAgLy8gbGV0IGZpeGVkID0gZmFsc2U7XG4gICAgLy8gY29uc3QgZmVhdHVyZUNvdW50ID0gbmV3IERlZmF1bHRNYXA8RmVhdHVyZSwgbnVtYmVyPigoKSA9PiAwKTtcbiAgICBsZXQgZmVhdHVyZXMgPSAwO1xuICAgIGZvciAoY29uc3QgZmVhdHVyZSBvZiBkYXRhLmZlYXR1cmUgPz8gW10pIHtcbiAgICAgIGNvbnN0IG1hc2sgPSBmZWF0dXJlTWFza1tmZWF0dXJlXTtcbiAgICAgIGlmIChtYXNrICE9IG51bGwpIGZlYXR1cmVzIHw9IG1hc2s7XG4gICAgICAvLyB0aGlzLl9mZWF0dXJlcy5hZGQoZmVhdHVyZSk7XG4gICAgICAvLyBpZiAoZml4ZWRGZWF0dXJlcy5oYXMoZmVhdHVyZSkpIGZpeGVkID0gdHJ1ZTtcbiAgICAgIC8vIGlmIChmaXhlZENvdW50RmVhdHVyZXMuaGFzKGZlYXR1cmUpKSB7XG4gICAgICAvLyAgIGZlYXR1cmVDb3VudC5zZXQoZmVhdHVyZSwgZmVhdHVyZUNvdW50LmdldChmZWF0dXJlKSArIDEpO1xuICAgICAgLy8gfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IGV4aXQgb2YgZGF0YS5leGl0cyA/PyBbXSkge1xuICAgICAgaWYgKGV4aXQudHlwZSA9PT0gJ3N0YWlyOmRvd24nIHx8IGV4aXQudHlwZSA9PT0gJ3N0YWlyOnVwJykge1xuICAgICAgICBmZWF0dXJlcyB8PSBmZWF0dXJlTWFza1tleGl0LnR5cGVdO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLl9mZWF0dXJlcyA9IGZlYXR1cmVzO1xuICAgIHRoaXMuX2lzRW1wdHkgPSBCb29sZWFuKGZlYXR1cmVzICYgZmVhdHVyZU1hc2tbJ2VtcHR5J10pO1xuICAgIHRoaXMuZmxhZyA9IGRhdGEuZmxhZztcbiAgICAvLyB0aGlzLmZpeGVkID0gZml4ZWQ7XG4gICAgLy8gdGhpcy5mZWF0dXJlQ291bnQgPSBmZWF0dXJlQ291bnQ7XG4gICAgLy8gVE9ETyAtIGJ1aWxkIFwiY29ubmVjdGlvbnNcIiBieSBpdGVyYXRpbmcgb3ZlciAwLi4zLlxuICAgIGNvbnN0IGN4bjogbnVtYmVyW11bXVtdID0gW1tbXV0sIFtbXV0sIFtbXV0sIFtbXV1dO1xuXG4gICAgdGhpcy5jb25uZWN0aW9ucyA9IGN4bjtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgbGV0IHBvaUluZGV4ID0gMDtcbiAgICAgIGxldCBleGl0SW5kZXggPSAwO1xuICAgICAgbGV0IGN1ciA9IGN4bltpXVswXTtcbiAgICAgIGZvciAoY29uc3QgdGVybSBvZiB0aGlzLmRhdGEuY29ubmVjdCA/PyAnJykge1xuICAgICAgICBpZiAoY29ubmVjdGlvbkJsb2Nrc1tpXS5pbmNsdWRlcyh0ZXJtKSkge1xuICAgICAgICAgIGN4bltpXS5wdXNoKGN1ciA9IFtdKTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZGVsdGE7XG4gICAgICAgIGlmIChjb25uZWN0aW9uQmxvY2tTZXQuaGFzKHRlcm0pKSBjb250aW51ZTtcbiAgICAgICAgaWYgKHRlcm0gPT09ICdwJykge1xuICAgICAgICAgIGRlbHRhID0gMHhmMCB8IHBvaUluZGV4Kys7XG4gICAgICAgIH0gZWxzZSBpZiAodGVybSA9PT0gJ3gnKSB7XG4gICAgICAgICAgZGVsdGEgPSAweGUwIHwgZXhpdEluZGV4Kys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgbnVtID0gcGFyc2VJbnQodGVybSwgMTYpO1xuICAgICAgICAgIGlmICghbnVtKSB0aHJvdyBuZXcgRXJyb3IoYGJhZCB0ZXJtOiAnJHt0ZXJtfSdgKTsgLy8gY29udGludWU/Pz9cbiAgICAgICAgICBjb25zdCBjaGFubmVsID0gKG51bSAmIDMpIDw8IChudW0gJiA0KTsgLy8gMDEsIDAyLCAwMywgMTAsIDIwLCBvciAzMFxuICAgICAgICAgIGNvbnN0IG9mZnNldCA9IG51bSAmIDggPyAobnVtICYgNCA/IDB4MDEwMCA6IDB4MTAwMCkgOiAwO1xuICAgICAgICAgIGRlbHRhID0gY2hhbm5lbCB8IG9mZnNldDtcbiAgICAgICAgfVxuICAgICAgICBjdXIucHVzaChkZWx0YSk7XG4gICAgICB9XG4gICAgICB3aGlsZSAocG9pSW5kZXggPCB0aGlzLmRhdGEucG9pPy5sZW5ndGghKSB7XG4gICAgICAgIGN1ci5wdXNoKDB4ZjAgfCBwb2lJbmRleCsrKTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChleGl0SW5kZXggPCB0aGlzLmRhdGEuZXhpdHM/Lmxlbmd0aCEpIHtcbiAgICAgICAgY3VyLnB1c2goMHhlMCB8IGV4aXRJbmRleCsrKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgZmVhdHVyZXMoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fZmVhdHVyZXM7XG4gIH1cblxuICBnZXQgbWFudWFsKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBCb29sZWFuKHRoaXMuX2ZlYXR1cmVzICYgbWFudWFsRmVhdHVyZU1hc2spO1xuICB9XG5cbiAgZ2V0IGNvdW50ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIEJvb2xlYW4odGhpcy5fZmVhdHVyZXMgJiBjb3VudGVkRmVhdHVyZU1hc2spO1xuICB9XG5cbiAgLy8gZmVhdHVyZXMoKTogSXRlcmFibGU8RmVhdHVyZT4ge1xuICAvLyAgIHJldHVybiB0aGlzLl9mZWF0dXJlcy52YWx1ZXMoKTtcbiAgLy8gfVxuXG4gIGhhc0ZlYXR1cmUoZmVhdHVyZTogRmVhdHVyZSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBCb29sZWFuKHRoaXMuX2ZlYXR1cmVzICYgZmVhdHVyZU1hc2tbZmVhdHVyZV0pO1xuICB9XG5cbiAgaGFzRmVhdHVyZXMoZmVhdHVyZXM6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIHJldHVybiAodGhpcy5fZmVhdHVyZXMgJiBmZWF0dXJlcykgPT09IGZlYXR1cmVzO1xuICB9XG5cbiAgLyoqIFJldHVybiBhIG5ldyBtZXRhc2NyZWVuIHdpdGggdGhlIHNhbWUgcHJvZmlsZSBidXQgYW4gZXh0cmEgZmVhdHVyZS4gKi9cbiAgd2l0aEZlYXR1cmUoZmVhdHVyZTogRmVhdHVyZSk6IE1ldGFzY3JlZW5bXSB7XG4gICAgLy8gVE9ETyAtIGluZGV4IHRoaXM/XG4gICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gIH1cblxuICBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9pc0VtcHR5O1xuICB9XG5cbiAgaGFzU3RhaXIoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIEJvb2xlYW4odGhpcy5fZmVhdHVyZXMgJiAoZmVhdHVyZU1hc2tbJ3N0YWlyOnVwJ10gfFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZlYXR1cmVNYXNrWydzdGFpcjpkb3duJ10pKTtcbiAgfVxuXG4gIC8qKiBSZXR1cm4gYSBuZXcgbWV0YXNjcmVlbiB3aXRoIHRoZSBzYW1lIHByb2ZpbGUgYnV0IG1vcmUgb2JzdHJ1Y3RlZC4gKi9cbiAgd2l0aE9ic3RydWN0aW9uKCk6IE1ldGFzY3JlZW5bXSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gIH1cblxuICBpc0NvbXBhdGlibGVXaXRoVGlsZXNldChpZDogbnVtYmVyKSB7XG4gICAgZm9yIChjb25zdCB0aWxlc2V0IG9mIHRoaXMuX3RpbGVzZXRzKSB7XG4gICAgICBpZiAodGlsZXNldC50aWxlc2V0SWQgPT09IGlkKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlcGxhY2Ugb2NjdXJyZW5jZXMgb2YgYSBtZXRhdGlsZSB3aXRoaW4gdGhpcyBzY3JlZW4uXG4gICAqL1xuICByZXBsYWNlKGZyb206IG51bWJlciwgdG86IG51bWJlcik6IE1ldGFzY3JlZW4ge1xuICAgIGNvbnN0IHt0aWxlc30gPSB0aGlzLnNjcmVlbjtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRpbGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAodGlsZXNbaV0gPT09IGZyb20pIHRpbGVzW2ldID0gdG87XG4gICAgfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgcmVtb3ZlKCkge1xuICAgIC8vIFJlbW92ZSBzZWxmIGZyb20gYWxsIG1ldGF0aWxlc2V0cy4gIFVzZWQgYnkgbGFieXJpbnRoVmFyaWFudCB0b1xuICAgIC8vIGVuc3VyZSBpbXBvc3NpYmxlIHZhcmlhbnRzIGFyZW4ndCBhZGRlZCAobm90ZTogd2l0aCBhIGRlZGljYXRlZFxuICAgIC8vIHBhZ2Ugd2UgY291bGQgbWFrZSBtb3JlIGF2YWlsYWJsZSkuXG4gICAgZm9yIChjb25zdCB0aWxlc2V0IG9mIHRoaXMudGlsZXNldHMoKSkge1xuICAgICAgdGlsZXNldC5kZWxldGVTY3JlZW4odGhpcyk7XG4gICAgfVxuICB9XG5cbiAgdGlsZXNldHMoKTogTWV0YXRpbGVzZXRbXSB7XG4gICAgY29uc3QgdGlsZXNldHM6IE1ldGF0aWxlc2V0W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLmRhdGEudGlsZXNldHMpIHtcbiAgICAgIHRpbGVzZXRzLnB1c2goXG4gICAgICAgICAgdGhpcy5yb20ubWV0YXRpbGVzZXRzW2tleSBhcyBrZXlvZiBNZXRhdGlsZXNldHNdIGFzIE1ldGF0aWxlc2V0KTtcbiAgICB9XG4gICAgcmV0dXJuIHRpbGVzZXRzO1xuICB9XG5cbiAgc2V0R3JpZFRpbGUoLi4udGlsZTogc3RyaW5nW10pIHtcbiAgICB0aGlzLmRhdGEudGlsZSA9IHRpbGU7XG4gICAgZm9yIChjb25zdCB0aWxlc2V0IG9mIHRoaXMudGlsZXNldHMoKSkge1xuICAgICAgdGlsZXNldC5pbnZhbGlkYXRlKCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0IHNpZCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmRhdGEuaWQ7XG4gIH1cblxuICBzZXQgc2lkKHNpZDogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMuc2lkID09PSBzaWQpIHJldHVybjtcbiAgICB0aGlzLnJvbS5tZXRhc2NyZWVucy5yZW51bWJlcih0aGlzLnNpZCwgc2lkKTtcbiAgfVxuXG4gIGdldCBzY3JlZW4oKTogU2NyZWVuIHtcbiAgICBjb25zdCB7c2lkLCByb206IHtzY3JlZW5zfX0gPSB0aGlzO1xuICAgIHJldHVybiBzaWQgPCAwID8gc2NyZWVucy51bmFsbG9jYXRlZFt+c2lkXSA6IHNjcmVlbnNbc2lkXTtcbiAgfVxuXG4gIC8vIE9ubHkgTWV0YXNjcmVlbnMucmVudW1iZXIgc2hvdWxkIGNhbGwgdGhpcy5cbiAgdW5zYWZlU2V0SWQoc2lkOiBudW1iZXIpIHtcbiAgICAodGhpcy5kYXRhIGFzIHtpZDogbnVtYmVyfSkuaWQgPSBzaWQ7XG4gICAgZm9yIChjb25zdCB0aWxlc2V0IG9mIHRoaXMuX3RpbGVzZXRzKSB7XG4gICAgICB0aWxlc2V0LmludmFsaWRhdGUoKTtcbiAgICB9XG4gIH1cbiAgLy8gT25seSBNZXRhdGlsZXNldC5hZGRTY3JlZW4gc2hvdWxkIGNhbGwgdGhpcy5cbiAgdW5zYWZlQWRkVGlsZXNldCh0aWxlc2V0OiBNZXRhdGlsZXNldCkge1xuICAgIHRoaXMuX3RpbGVzZXRzLmFkZCh0aWxlc2V0KTtcbiAgfVxuICAvLyBPbmx5IE1ldGF0aWxlc2V0LnJlbW92ZVNjcmVlbiBzaG91bGQgY2FsbCB0aGlzLlxuICB1bnNhZmVSZW1vdmVUaWxlc2V0KHRpbGVzZXQ6IE1ldGF0aWxlc2V0KSB7XG4gICAgdGhpcy5fdGlsZXNldHMuZGVsZXRlKHRpbGVzZXQpO1xuICB9XG5cbiAgLyoqIFJldHVybnMgYSBiaXQgbWFzayBvZiBlZGdlcyB0aGF0IF9jb3VsZF8gZXhpdDogMT1OLCAyPVcsIDQ9UywgOD1FLiAqL1xuICBlZGdlRXhpdHMoKTogbnVtYmVyIHtcbiAgICBsZXQgbWFzayA9IDA7XG4gICAgZm9yIChjb25zdCBlIG9mIHRoaXMuZGF0YS5leGl0cyA/PyBbXSkge1xuICAgICAgY29uc3QgZGlyID0gZWRnZVR5cGVNYXBbZS50eXBlXTtcbiAgICAgIGlmIChkaXIgIT0gbnVsbCkgbWFzayB8PSAoMSA8PCBkaXIpO1xuICAgIH1cbiAgICByZXR1cm4gbWFzaztcbiAgfVxuXG4gIGVkZ2VJbmRleChlZGdlVHlwZTogc3RyaW5nKTogbnVtYmVyfHVuZGVmaW5lZCB7XG4gICAgbGV0IGluZGV4ID0gMDtcbiAgICBjb25zdCBlZGdlID0gdGhpcy5kYXRhLmVkZ2VzID8/ICcnO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICBpZiAoZWRnZVtpXSA9PT0gJyAnKSBjb250aW51ZTtcbiAgICAgIGlmIChlZGdlW2ldICE9PSBlZGdlVHlwZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIGluZGV4IHw9ICgxIDw8IGkpO1xuICAgIH1cbiAgICByZXR1cm4gaW5kZXg7XG4gIH1cblxuICBmaW5kRXhpdFR5cGUodGlsZTogbnVtYmVyLCBzaW5nbGU6IGJvb2xlYW4sXG4gICAgICAgICAgICAgICBzZWFtbGVzczogYm9vbGVhbik6IENvbm5lY3Rpb258dW5kZWZpbmVkIHtcbiAgICBmb3IgKGNvbnN0IGV4aXQgb2YgdGhpcy5kYXRhLmV4aXRzID8/IFtdKSB7XG4gICAgICBpZiAoZXhpdC50eXBlLnN0YXJ0c1dpdGgoJ3NlYW1sZXNzJykgIT09IHNlYW1sZXNzKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHQwID0gc2luZ2xlICYmIGV4aXQudHlwZSA9PT0gJ2VkZ2U6Ym90dG9tJyAmJiB0aWxlID49IDB4YzAgP1xuICAgICAgICAgIHRpbGUgKyAweDIwIDogdGlsZTtcbiAgICAgIGlmIChleGl0LmV4aXRzLmluY2x1ZGVzKHQwKSB8fCAoZXhpdC5hbGxvd2VkRXhpdHMgPz8gW10pLmluY2x1ZGVzKHQwKSkge1xuICAgICAgICByZXR1cm4gZXhpdDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIGZpbmRFeGl0QnlUeXBlKHR5cGU6IENvbm5lY3Rpb25UeXBlKTogQ29ubmVjdGlvbiB7XG4gICAgY29uc3QgZXhpdCA9IHRoaXMuZGF0YS5leGl0cyEuZmluZChlID0+IGUudHlwZSA9PT0gdHlwZSk7XG4gICAgaWYgKCFleGl0KSB0aHJvdyBuZXcgRXJyb3IoYG5vIGV4aXQgJHt0eXBlfWApO1xuICAgIHJldHVybiBleGl0O1xuICB9XG5cbiAgZmluZEVudHJhbmNlVHlwZShjb29yZDogbnVtYmVyLCBzaW5nbGU6IGJvb2xlYW4pOiBDb25uZWN0aW9uVHlwZXx1bmRlZmluZWQge1xuICAgIGZvciAoY29uc3QgZXhpdCBvZiB0aGlzLmRhdGEuZXhpdHMgPz8gW10pIHtcbiAgICAgIGlmIChleGl0LnR5cGUuc3RhcnRzV2l0aCgnc2VhbWxlc3MnKSkgY29udGludWU7XG4gICAgICBjb25zdCBjMCA9IHNpbmdsZSAmJiBleGl0LnR5cGUgPT09ICdlZGdlOmJvdHRvbScgJiYgY29vcmQgPj0gMHhiZjAwID9cbiAgICAgICAgICBjb29yZCArIDB4MjAwMCA6IGNvb3JkO1xuICAgICAgY29uc3QgdDAgPSAoYzAgJiAweGYwKSA+PiA0IHwgKGMwICYgMHhmMDAwKSA+PiA4O1xuICAgICAgaWYgKGV4aXQuZW50cmFuY2UgPT09IGMwIHx8XG4gICAgICAgICAgZXhpdC5leGl0cy5pbmNsdWRlcyh0MCkgfHwgKGV4aXQuYWxsb3dlZEV4aXRzID8/IFtdKS5pbmNsdWRlcyh0MCkpIHtcbiAgICAgICAgcmV0dXJuIGV4aXQudHlwZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIGFkZEN1c3RvbUZsYWcoZGVmYXVsdFZhbHVlOiBib29sZWFuKSB7XG4gICAgdGhpcy5mbGFnID0gZGVmYXVsdFZhbHVlID8gJ2N1c3RvbTp0cnVlJyA6ICdjdXN0b206ZmFsc2UnO1xuXG4gICAgLy8gVE9ETyAtIGZvciBub3csIGN1c3RvbSBmbGFncyBhcmUgc2V0IGJ5IGRlZmF1bHQuXG5cbiAgICAvLyBpZiAoIWZsYWdBbGwpIHJldHVybjtcbiAgICAvLyBmb3IgKGNvbnN0IGxvYyBvZiB0aGlzLnJvbS5sb2NhdGlvbnMpIHtcbiAgICAvLyAgIGlmICghbG9jLnVzZWQpIGNvbnRpbnVlO1xuICAgIC8vICAgZm9yIChjb25zdCBwb3Mgb2YgbG9jLm1ldGEuYWxsUG9zKCkpIHtcbiAgICAvLyAgICAgaWYgKGxvYy5tZXRhLmdldFVpZChwb3MpICE9PSB0aGlzLnVpZCkgY29udGludWU7XG4gICAgLy8gICAgIGxvYy5tZXRhLmN1c3RvbUZsYWdzLnNldChwb3MsIHRoaXMucm9tLmZsYWdzLkFsd2F5c1RydWUpO1xuICAgIC8vICAgfVxuICAgIC8vIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVja3MgaWYgdGhpcyBjYW4gbmVpZ2hib3IgdGhhdCBpbiAnZGlyJyBkaXJlY3Rpb24uXG4gICAqIElmIGRpciBpcyAwLCBjaGVja3MgdGhhdCAndGhhdCcgaXMgYWJvdmUgJ3RoaXMnLlxuICAgKiBJZiBkaXIgaXMgMSwgY2hlY2tzIHRoYXQgJ3RoYXQnIGlzIGxlZnQgb2YgJ3RoaXMnLlxuICAgKiBJZiBkaXIgaXMgMiwgY2hlY2tzIHRoYXQgJ3RoYXQnIGlzIGJlbG93ICd0aGlzJy5cbiAgICogSWYgZGlyIGlzIDMsIGNoZWNrcyB0aGF0ICd0aGF0JyBpcyByaWdodCBvZiAndGhpcycuXG4gICAqL1xuICBjaGVja05laWdoYm9yKHRoYXQ6IE1ldGFzY3JlZW4sIGRpcjogbnVtYmVyKSB7XG4gICAgLy8gY2hlY2s6IDAgLT4gdGhhdFt2ZXJ0XS5nZXQodGhpcykgLT4gdGhpcyBpcyB1bmRlciB0aGF0XG4gICAgY29uc3QgYSA9IGRpciAmIDIgPyB0aGlzIDogdGhhdDtcbiAgICBjb25zdCBiID0gZGlyICYgMiA/IHRoYXQgOiB0aGlzO1xuICAgIHJldHVybiBhLm5laWdoYm9yc1tkaXIgJiAxXS5nZXQoYik7XG4gIH1cblxuICAvKiogQHBhcmFtIGRpciAwIHRvIGNoZWNrIGlmIHRoYXQgaXMgdW5kZXIgdGhpcywgMSBpZiB0aGF0IGlzIHJpZ2h0IG9mIHRoaXMgKi9cbiAgcHJpdmF0ZSBfY2hlY2tOZWlnaGJvcih0aGF0OiBNZXRhc2NyZWVuLCBkaXI6IDB8MSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGUxID0gdGhpcy5kYXRhLmVkZ2VzO1xuICAgIGNvbnN0IGUyID0gdGhhdC5kYXRhLmVkZ2VzO1xuICAgIGlmIChlMSAmJiBlMikge1xuICAgICAgY29uc3Qgb3BwID0gZGlyIF4gMjtcbiAgICAgIGlmIChlMVtvcHBdICE9PSAnKicgJiYgZTFbb3BwXSA9PT0gZTJbZGlyXSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5jb25zdCBlZGdlVHlwZU1hcDoge1tDIGluIENvbm5lY3Rpb25UeXBlXT86IG51bWJlcn0gPSB7XG4gICdlZGdlOnRvcCc6IDAsXG4gICdlZGdlOmxlZnQnOiAxLFxuICAnZWRnZTpib3R0b20nOiAyLFxuICAnZWRnZTpyaWdodCc6IDMsXG59O1xuXG5jb25zdCBjb25uZWN0aW9uQmxvY2tzID0gW1xuICAnfDonLCAvLyBicmVhayB3YWxsLCBmb3JtIGJyaWRnZSwgYnV0IG5vIGZsaWdodFxuICAnfDo9LScsIC8vIG5vIHdhbGxzL2JyaWRnZS9mbGlnaHRcbiAgJ3wnLCAvLyBmbGlnaHQgYW5kIGJyZWFrIHdhbGxzXG4gICd8PScsIC8vIGZsaWdodCBvbmx5XG5dO1xuY29uc3QgY29ubmVjdGlvbkJsb2NrU2V0ID0gbmV3IFNldChbJ3wnLCAnOicsICctJywgJz0nXSk7XG5cbmNvbnN0IG1hbnVhbEZlYXR1cmVzID0gbmV3IFNldDxGZWF0dXJlPihbXG4gICdhcmVuYScsICdwb3J0b2ExJywgJ3BvcnRvYTInLCAncG9ydG9hMycsICdsYWtlJywgJ292ZXJwYXNzJywgJ3VuZGVycGFzcycsXG4gICdsaWdodGhvdXNlJywgJ2NhYmluJywgJ3dpbmRtaWxsJywgJ2FsdGFyJywgJ3B5cmFtaWQnLCAnY3J5cHQnLFxuXSk7XG5jb25zdCBjb3VudGVkRmVhdHVyZXMgPSBuZXcgU2V0PEZlYXR1cmU+KFtcbiAgJ3BpdCcsICdzcGlrZXMnLCAnYnJpZGdlJywgJ3dhbGwnLCAncmFtcCcsICd3aGlybHBvb2wnLFxuXSk7XG5cbmNvbnN0IG1hbnVhbEZlYXR1cmVNYXNrID0gWy4uLm1hbnVhbEZlYXR1cmVzXS5tYXAoXG4gICAgZiA9PiBmZWF0dXJlTWFza1tmXSBhcyBudW1iZXIpLnJlZHVjZSgoYSwgYikgPT4gYSB8IGIpO1xuY29uc3QgY291bnRlZEZlYXR1cmVNYXNrID0gWy4uLmNvdW50ZWRGZWF0dXJlc10ubWFwKFxuICAgIGYgPT4gZmVhdHVyZU1hc2tbZl0gYXMgbnVtYmVyKS5yZWR1Y2UoKGEsIGIpID0+IGEgfCBiKTtcbiJdfQ==