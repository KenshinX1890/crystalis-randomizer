import { DEBUG_MODE_FLAGS } from './flags/debug-mode.js';
import { EASY_MODE_FLAGS } from './flags/easy-mode.js';
import { GLITCH_FIX_FLAGS } from './flags/glitch-fixes.js';
import { GLITCH_FLAGS } from './flags/glitches.js';
import { HARD_MODE_FLAGS } from './flags/hard-mode.js';
import { ITEM_FLAGS } from './flags/items.js';
import { MONSTER_FLAGS } from './flags/monsters.js';
import { ROUTING_FLAGS } from './flags/routing.js';
import { SHOP_FLAGS } from './flags/shops.js';
import { TWEAK_FLAGS } from './flags/tweaks.js';
import { WORLD_FLAGS } from './flags/world.js';
import { UsageError } from './util.js';
const REPEATABLE_FLAGS = new Set(['S']);
export const PRESETS = [
    {
        title: 'Casual',
        descr: `Basic flags for a relatively easy playthrough.`,
        flags: 'Ds Edmrsx Fw Mr Rp Sc Sk Sm Tab',
    },
    {
        title: 'Intermediate',
        descr: `Slightly more challenge than Casual but still approachable.`,
        flags: 'Ds Edms Fsw Gt Mr Ps Rpt Sct Skm Tab',
        default: true,
    },
    {
        title: 'Full Shuffle',
        descr: `Slightly harder than intermediate, with full shuffle and no spoiler log.`,
        flags: 'Em Fsw Gt Mert Ps Rprt Sckmt Tabmp Wtuw',
    },
    {
        title: 'Glitchless',
        descr: `Full shuffle but with no glitches.`,
        flags: 'Em Fcpstw Mert Ps Rprt Sckmt Tab Wtuw',
    },
    {
        title: 'Advanced',
        descr: `A balanced randomization with quite a bit more difficulty.`,
        flags: 'Fsw Gfprt Hbdgw Mert Ps Roprst Sckt Sm Tabmp Wtuw',
    },
    {
        title: 'Ludicrous',
        descr: `Pulls out all the stops, may require superhuman feats.`,
        flags: 'Fs Gcfprtw Hbdgmswxz Mert Ps Roprst Sckmt Tabmp Wtuw',
    },
    {
        title: 'Mattrick',
        descr: 'Not for the faint of heart. Good luck...',
        flags: 'Fcprsw Gt Hbdhwx Mert Ps Ropst Sckmt Tabmp Wtuw',
    },
];
const PRESETS_BY_KEY = {};
for (const { title, flags } of PRESETS) {
    PRESETS_BY_KEY[`@${title.replace(/ /g, '').toLowerCase()}`] = flags;
}
export const FLAGS = [
    ITEM_FLAGS, WORLD_FLAGS, MONSTER_FLAGS, SHOP_FLAGS, HARD_MODE_FLAGS,
    TWEAK_FLAGS, ROUTING_FLAGS, GLITCH_FLAGS, GLITCH_FIX_FLAGS, EASY_MODE_FLAGS,
    DEBUG_MODE_FLAGS
];
export class FlagSet {
    constructor(str = 'RtGftTab') {
        if (str.startsWith('@')) {
            const expanded = PRESETS_BY_KEY[str.toLowerCase()];
            if (!expanded)
                throw new UsageError(`Unknown preset: ${str}`);
            str = expanded;
        }
        this.flags = {};
        str = str.replace(/[^A-Za-z0-9!]/g, '');
        const re = /([A-Z])([a-z0-9!]+)/g;
        let match;
        while ((match = re.exec(str))) {
            const [, key, value] = match;
            const terms = REPEATABLE_FLAGS.has(key) ? [value] : value;
            for (const term of terms) {
                this.set(key + term, true);
            }
        }
    }
    get(category) {
        return this.flags[category] || [];
    }
    set(flag, value) {
        const key = flag[0];
        const term = flag.substring(1);
        if (!value) {
            const filtered = (this.flags[key] || []).filter(t => t !== term);
            if (filtered.length) {
                this.flags[key] = filtered;
            }
            else {
                delete this.flags[key];
            }
            return;
        }
        this.removeConflicts(flag);
        const terms = (this.flags[key] || []).filter(t => t !== term);
        terms.push(term);
        terms.sort();
        this.flags[key] = terms;
    }
    check(flag) {
        const terms = this.flags[flag[0]];
        return !!(terms && (terms.indexOf(flag.substring(1)) >= 0));
    }
    autoEquipBracelet() {
        return this.check('Ta');
    }
    buffDeosPendant() {
        return this.check('Tb');
    }
    leatherBootsGiveSpeed() {
        return this.check('Tb');
    }
    rabbitBootsChargeWhileWalking() {
        return this.check('Tb');
    }
    randomizeMusic() {
        return this.check('Tm');
    }
    shuffleSpritePalettes() {
        return this.check('Tp');
    }
    shuffleMonsters() {
        return this.check('Mr');
    }
    shuffleShops() {
        return this.check('Ps');
    }
    bargainHunting() {
        return this.shuffleShops();
    }
    shuffleTowerMonsters() {
        return this.check('Mt');
    }
    shuffleMonsterElements() {
        return this.check('Me');
    }
    shuffleBossElements() {
        return this.shuffleMonsterElements();
    }
    doubleBuffMedicalHerb() {
        return this.check('Em');
    }
    buffMedicalHerb() {
        return !this.check('Hm');
    }
    decreaseEnemyDamage() {
        return this.check('Ed');
    }
    neverDie() {
        return this.check('Di');
    }
    chargeShotsOnly() {
        return this.check('Hc');
    }
    barrierRequiresCalmSea() {
        return true;
    }
    paralysisRequiresPrisonKey() {
        return true;
    }
    sealedCaveRequiresWindmill() {
        return true;
    }
    connectLimeTreeToLeaf() {
        return this.check('Rp');
    }
    storyMode() {
        return this.check('Rs');
    }
    requireHealedDolphinToRide() {
        return this.check('Rd');
    }
    saharaRabbitsRequireTelepathy() {
        return this.check('Rr');
    }
    teleportOnThunderSword() {
        return this.check('Rt');
    }
    orbsOptional() {
        return this.check('Ro');
    }
    randomizeMaps() {
        return false;
    }
    randomizeTrades() {
        return this.check('Wt');
    }
    unidentifiedItems() {
        return this.check('Wu');
    }
    randomizeWalls() {
        return this.check('Ww');
    }
    guaranteeSword() {
        return this.check('Es');
    }
    guaranteeSwordMagic() {
        return !this.check('Hw');
    }
    guaranteeMatchingSword() {
        return !this.check('Hs');
    }
    guaranteeGasMask() {
        return !this.check('Hg');
    }
    guaranteeBarrier() {
        return !this.check('Hb');
    }
    guaranteeRefresh() {
        return this.check('Er');
    }
    disableSwordChargeGlitch() {
        return this.check('Fc');
    }
    disableTeleportSkip() {
        return this.check('Fp');
    }
    disableRabbitSkip() {
        return this.check('Fr');
    }
    disableShopGlitch() {
        return this.check('Fs');
    }
    disableStatueGlitch() {
        return this.check('Ft');
    }
    assumeSwordChargeGlitch() {
        return this.check('Gc');
    }
    assumeGhettoFlight() {
        return this.check('Gf');
    }
    assumeTeleportSkip() {
        return this.check('Gp');
    }
    assumeRabbitSkip() {
        return this.check('Gr');
    }
    assumeStatueGlitch() {
        return this.check('Gt');
    }
    assumeTriggerGlitch() {
        return false;
    }
    assumeWildWarp() {
        return this.check('Gw');
    }
    nerfWildWarp() {
        return this.check('Fw');
    }
    allowWildWarp() {
        return !this.nerfWildWarp();
    }
    randomizeWildWarp() {
        return this.check('Tw');
    }
    blackoutMode() {
        return this.check('Hz');
    }
    hardcoreMode() {
        return this.check('Hh');
    }
    buffDyna() {
        return this.check('Hd');
    }
    expScalingFactor() {
        return this.check('Hx') ? 0.25 : this.check('Ex') ? 2.5 : 1;
    }
    removeConflicts(flag) {
        const re = this.exclusiveFlags(flag);
        if (!re)
            return;
        for (const key in this.flags) {
            if (!this.flags.hasOwnProperty(key))
                continue;
            const terms = this.flags[key].filter(t => !re.test(key + t));
            if (terms.length) {
                this.flags[key] = terms;
            }
            else {
                delete this.flags[key];
            }
        }
    }
    toStringKey(key) {
        if (REPEATABLE_FLAGS.has(key)) {
            return [...this.flags[key]].sort().map(v => key + v).join(' ');
        }
        return key + [...this.flags[key]].sort().join('');
    }
    exclusiveFlags(flag) {
        if (flag.startsWith('S')) {
            return new RegExp(`S.*[${flag.substring(1)}]`);
        }
        const flagForName = this.getFlagForName(flag);
        if (flagForName == null)
            throw new Error(`Unknown flag: ${flag}`);
        return flagForName.conflict;
    }
    getFlagForName(flag) {
        const matchingFlagSection = FLAGS.find(flagSection => {
            return flag.startsWith(flagSection.prefix);
        });
        return matchingFlagSection
            .flags.find(flagToMatch => flagToMatch.flag === flag);
    }
    toString() {
        const keys = Object.keys(this.flags);
        keys.sort();
        return keys.map(k => this.toStringKey(k)).join(' ');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxhZ3NldC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9qcy9mbGFnc2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxnQkFBZ0IsRUFBQyxNQUFNLHVCQUF1QixDQUFDO0FBQ3ZELE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxzQkFBc0IsQ0FBQztBQUVyRCxPQUFPLEVBQUMsZ0JBQWdCLEVBQUMsTUFBTSx5QkFBeUIsQ0FBQztBQUN6RCxPQUFPLEVBQUMsWUFBWSxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDakQsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLHNCQUFzQixDQUFDO0FBQ3JELE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUM1QyxPQUFPLEVBQUMsYUFBYSxFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDbEQsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLG9CQUFvQixDQUFDO0FBQ2pELE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUM1QyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sbUJBQW1CLENBQUM7QUFDOUMsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLGtCQUFrQixDQUFDO0FBQzdDLE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSxXQUFXLENBQUM7QUFFckMsTUFBTSxnQkFBZ0IsR0FBZ0IsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRXJELE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBYTtJQUMvQjtRQUNFLEtBQUssRUFBRSxRQUFRO1FBRWYsS0FBSyxFQUFFLGdEQUFnRDtRQUN2RCxLQUFLLEVBQUUsaUNBQWlDO0tBQ3pDO0lBQ0Q7UUFDRSxLQUFLLEVBQUUsY0FBYztRQUVyQixLQUFLLEVBQUUsNkRBQTZEO1FBQ3BFLEtBQUssRUFBRSxzQ0FBc0M7UUFFN0MsT0FBTyxFQUFFLElBQUk7S0FDZDtJQUNE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LENBQUMsRUFBRTtZQUN4QixPQUFPLElBQUksTUFBTSxDQUFDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDaEQ7UUFFRCxNQUFNLFdBQVcsR0FBUyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3BELElBQUksV0FBVyxJQUFJLElBQUk7WUFBRSxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQztJQUM5QixDQUFDO0lBRU8sY0FBYyxDQUFDLElBQVk7UUFDakMsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFO1lBQ25ELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUEyQixtQkFBb0I7YUFDMUMsS0FBSyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELFFBQVE7UUFDTixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3RELENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7REVCVUdfTU9ERV9GTEFHU30gZnJvbSAnLi9mbGFncy9kZWJ1Zy1tb2RlLmpzJztcbmltcG9ydCB7RUFTWV9NT0RFX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL2Vhc3ktbW9kZS5qcyc7XG5pbXBvcnQge0ZsYWcsIEZsYWdTZWN0aW9uLCBQcmVzZXR9IGZyb20gJy4vZmxhZ3MvZmxhZy5qcyc7XG5pbXBvcnQge0dMSVRDSF9GSVhfRkxBR1N9IGZyb20gJy4vZmxhZ3MvZ2xpdGNoLWZpeGVzLmpzJztcbmltcG9ydCB7R0xJVENIX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL2dsaXRjaGVzLmpzJztcbmltcG9ydCB7SEFSRF9NT0RFX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL2hhcmQtbW9kZS5qcyc7XG5pbXBvcnQge0lURU1fRkxBR1N9IGZyb20gJy4vZmxhZ3MvaXRlbXMuanMnO1xuaW1wb3J0IHtNT05TVEVSX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL21vbnN0ZXJzLmpzJztcbmltcG9ydCB7Uk9VVElOR19GTEFHU30gZnJvbSAnLi9mbGFncy9yb3V0aW5nLmpzJztcbmltcG9ydCB7U0hPUF9GTEFHU30gZnJvbSAnLi9mbGFncy9zaG9wcy5qcyc7XG5pbXBvcnQge1RXRUFLX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL3R3ZWFrcy5qcyc7XG5pbXBvcnQge1dPUkxEX0ZMQUdTfSBmcm9tICcuL2ZsYWdzL3dvcmxkLmpzJztcbmltcG9ydCB7VXNhZ2VFcnJvcn0gZnJvbSAnLi91dGlsLmpzJztcblxuY29uc3QgUkVQRUFUQUJMRV9GTEFHUzogU2V0PHN0cmluZz4gPSBuZXcgU2V0KFsnUyddKTtcblxuZXhwb3J0IGNvbnN0IFBSRVNFVFM6IFByZXNldFtdID0gW1xuICB7XG4gICAgdGl0bGU6ICdDYXN1YWwnLFxuXG4gICAgZGVzY3I6IGBCYXNpYyBmbGFncyBmb3IgYSByZWxhdGl2ZWx5IGVhc3kgcGxheXRocm91Z2guYCxcbiAgICBmbGFnczogJ0RzIEVkbXJzeCBGdyBNciBScCBTYyBTayBTbSBUYWInLFxuICB9LFxuICB7XG4gICAgdGl0bGU6ICdJbnRlcm1lZGlhdGUnLFxuXG4gICAgZGVzY3I6IGBTbGlnaHRseSBtb3JlIGNoYWxsZW5nZSB0aGFuIENhc3VhbCBidXQgc3RpbGwgYXBwcm9hY2hhYmxlLmAsXG4gICAgZmxhZ3M6ICdEcyBFZG1zIEZzdyBHdCBNciBQcyBScHQgU2N0IFNrbSBUYWInLFxuXG4gICAgZGVmYXVsdDogdHJ1ZSxcbiAgfSxcbiAge1xuICAgIHRpdGxlOiAnRnVsbCBTaHVmZmxlJyxcblxuICAgIGRlc2NyOlxuICAgICAgICBgU2xpZ2h0bHkgaGFyZGVyIHRoYW4gaW50ZXJtZWRpYXRlLCB3aXRoIGZ1bGwgc2h1ZmZsZSBhbmQgbm8gc3BvaWxlciBsb2cuYCxcbiAgICBmbGFnczogJ0VtIEZzdyBHdCBNZXJ0IFBzIFJwcnQgU2NrbXQgVGFibXAgV3R1dycsXG4gIH0sXG4gIHtcbiAgICB0aXRsZTogJ0dsaXRjaGxlc3MnLFxuXG4gICAgZGVzY3I6IGBGdWxsIHNodWZmbGUgYnV0IHdpdGggbm8gZ2xpdGNoZXMuYCxcbiAgICBmbGFnczogJ0VtIEZjcHN0dyBNZXJ0IFBzIFJwcnQgU2NrbXQgVGFiIFd0dXcnLFxuICB9LFxuICB7XG4gICAgLy8gVE9ETzogYWRkICdIdCcgZm9yIG1heGluZyBvdXQgdG93ZXIgc2NhbGluZ1xuICAgIHRpdGxlOiAnQWR2YW5jZWQnLFxuXG4gICAgZGVzY3I6IGBBIGJhbGFuY2VkIHJhbmRvbWl6YXRpb24gd2l0aCBxdWl0ZSBhIGJpdCBtb3JlIGRpZmZpY3VsdHkuYCxcbiAgICBmbGFnczogJ0ZzdyBHZnBydCBIYmRndyBNZXJ0IFBzIFJvcHJzdCBTY2t0IFNtIFRhYm1wIFd0dXcnLFxuICB9LFxuICB7XG4gICAgLy8gVE9ETzogYWRkICdIdCdcbiAgICB0aXRsZTogJ0x1ZGljcm91cycsXG5cbiAgICBkZXNjcjogYFB1bGxzIG91dCBhbGwgdGhlIHN0b3BzLCBtYXkgcmVxdWlyZSBzdXBlcmh1bWFuIGZlYXRzLmAsXG4gICAgZmxhZ3M6ICdGcyBHY2ZwcnR3IEhiZGdtc3d4eiBNZXJ0IFBzIFJvcHJzdCBTY2ttdCBUYWJtcCBXdHV3JyxcbiAgfSxcbiAge1xuICAgIHRpdGxlOiAnTWF0dHJpY2snLFxuXG4gICAgZGVzY3I6ICdOb3QgZm9yIHRoZSBmYWludCBvZiBoZWFydC4gR29vZCBsdWNrLi4uJyxcbiAgICBmbGFnczogJ0ZjcHJzdyBHdCBIYmRod3ggTWVydCBQcyBSb3BzdCBTY2ttdCBUYWJtcCBXdHV3JyxcbiAgfSxcbl07XG5cbi8vIEp1c3QgdGhlIGZsYWdzLCBub3QgdGhlIHdob2xlIGRvY3VtZW50YXRpb24uXG5jb25zdCBQUkVTRVRTX0JZX0tFWToge1trZXk6IHN0cmluZ106IHN0cmluZ30gPSB7fTtcbmZvciAoY29uc3Qge3RpdGxlLCBmbGFnc30gb2YgUFJFU0VUUykge1xuICBQUkVTRVRTX0JZX0tFWVtgQCR7dGl0bGUucmVwbGFjZSgvIC9nLCAnJykudG9Mb3dlckNhc2UoKX1gXSA9IGZsYWdzO1xufVxuXG5leHBvcnQgY29uc3QgRkxBR1M6IEZsYWdTZWN0aW9uW10gPSBbXG4gIElURU1fRkxBR1MsIFdPUkxEX0ZMQUdTLCBNT05TVEVSX0ZMQUdTLCBTSE9QX0ZMQUdTLCBIQVJEX01PREVfRkxBR1MsXG4gIFRXRUFLX0ZMQUdTLCBST1VUSU5HX0ZMQUdTLCBHTElUQ0hfRkxBR1MsIEdMSVRDSF9GSVhfRkxBR1MsIEVBU1lfTU9ERV9GTEFHUyxcbiAgREVCVUdfTU9ERV9GTEFHU1xuXTtcblxuZXhwb3J0IGNsYXNzIEZsYWdTZXQge1xuICBwcml2YXRlIGZsYWdzOiB7W3NlY3Rpb246IHN0cmluZ106IHN0cmluZ1tdfTtcblxuICBjb25zdHJ1Y3RvcihzdHIgPSAnUnRHZnRUYWInKSB7XG4gICAgaWYgKHN0ci5zdGFydHNXaXRoKCdAJykpIHtcbiAgICAgIGNvbnN0IGV4cGFuZGVkID0gUFJFU0VUU19CWV9LRVlbc3RyLnRvTG93ZXJDYXNlKCldO1xuICAgICAgaWYgKCFleHBhbmRlZCkgdGhyb3cgbmV3IFVzYWdlRXJyb3IoYFVua25vd24gcHJlc2V0OiAke3N0cn1gKTtcbiAgICAgIHN0ciA9IGV4cGFuZGVkO1xuICAgIH1cbiAgICB0aGlzLmZsYWdzID0ge307XG4gICAgLy8gcGFyc2UgdGhlIHN0cmluZ1xuICAgIHN0ciA9IHN0ci5yZXBsYWNlKC9bXkEtWmEtejAtOSFdL2csICcnKTtcbiAgICBjb25zdCByZSA9IC8oW0EtWl0pKFthLXowLTkhXSspL2c7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlICgobWF0Y2ggPSByZS5leGVjKHN0cikpKSB7XG4gICAgICBjb25zdCBbLCBrZXksIHZhbHVlXSA9IG1hdGNoO1xuICAgICAgY29uc3QgdGVybXMgPSBSRVBFQVRBQkxFX0ZMQUdTLmhhcyhrZXkpID8gW3ZhbHVlXSA6IHZhbHVlO1xuICAgICAgZm9yIChjb25zdCB0ZXJtIG9mIHRlcm1zKSB7XG4gICAgICAgIHRoaXMuc2V0KGtleSArIHRlcm0sIHRydWUpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldChjYXRlZ29yeTogc3RyaW5nKTogc3RyaW5nW10ge1xuICAgIHJldHVybiB0aGlzLmZsYWdzW2NhdGVnb3J5XSB8fCBbXTtcbiAgfVxuXG4gIHNldChmbGFnOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKSB7XG4gICAgLy8gY2hlY2sgZm9yIGluY29tcGF0aWJsZSBmbGFncy4uLj9cbiAgICBjb25zdCBrZXkgPSBmbGFnWzBdO1xuICAgIGNvbnN0IHRlcm0gPSBmbGFnLnN1YnN0cmluZygxKTsgIC8vIGFzc2VydDogdGVybSBpcyBvbmx5IGxldHRlcnMvbnVtYmVyc1xuICAgIGlmICghdmFsdWUpIHtcbiAgICAgIC8vIEp1c3QgZGVsZXRlIC0gdGhhdCdzIGVhc3kuXG4gICAgICBjb25zdCBmaWx0ZXJlZCA9ICh0aGlzLmZsYWdzW2tleV0gfHwgW10pLmZpbHRlcih0ID0+IHQgIT09IHRlcm0pO1xuICAgICAgaWYgKGZpbHRlcmVkLmxlbmd0aCkge1xuICAgICAgICB0aGlzLmZsYWdzW2tleV0gPSBmaWx0ZXJlZDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmZsYWdzW2tleV07XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIEFjdHVhbGx5IGFkZCB0aGUgZmxhZy5cbiAgICB0aGlzLnJlbW92ZUNvbmZsaWN0cyhmbGFnKTtcbiAgICBjb25zdCB0ZXJtcyA9ICh0aGlzLmZsYWdzW2tleV0gfHwgW10pLmZpbHRlcih0ID0+IHQgIT09IHRlcm0pO1xuICAgIHRlcm1zLnB1c2godGVybSk7XG4gICAgdGVybXMuc29ydCgpO1xuICAgIHRoaXMuZmxhZ3Nba2V5XSA9IHRlcm1zO1xuICB9XG5cbiAgY2hlY2soZmxhZzogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgdGVybXMgPSB0aGlzLmZsYWdzW2ZsYWdbMF1dO1xuICAgIHJldHVybiAhISh0ZXJtcyAmJiAodGVybXMuaW5kZXhPZihmbGFnLnN1YnN0cmluZygxKSkgPj0gMCkpO1xuICB9XG5cbiAgYXV0b0VxdWlwQnJhY2VsZXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ1RhJyk7XG4gIH1cbiAgYnVmZkRlb3NQZW5kYW50KCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdUYicpO1xuICB9XG4gIGxlYXRoZXJCb290c0dpdmVTcGVlZCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnVGInKTtcbiAgfVxuICByYWJiaXRCb290c0NoYXJnZVdoaWxlV2Fsa2luZygpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnVGInKTtcbiAgfVxuICByYW5kb21pemVNdXNpYygpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnVG0nKTtcbiAgfVxuICBzaHVmZmxlU3ByaXRlUGFsZXR0ZXMoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ1RwJyk7XG4gIH1cblxuICBzaHVmZmxlTW9uc3RlcnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ01yJyk7XG4gIH1cbiAgc2h1ZmZsZVNob3BzKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdQcycpO1xuICB9XG4gIGJhcmdhaW5IdW50aW5nKCkge1xuICAgIHJldHVybiB0aGlzLnNodWZmbGVTaG9wcygpO1xuICB9XG5cbiAgc2h1ZmZsZVRvd2VyTW9uc3RlcnMoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ010Jyk7XG4gIH1cbiAgc2h1ZmZsZU1vbnN0ZXJFbGVtZW50cygpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnTWUnKTtcbiAgfVxuICBzaHVmZmxlQm9zc0VsZW1lbnRzKCkge1xuICAgIHJldHVybiB0aGlzLnNodWZmbGVNb25zdGVyRWxlbWVudHMoKTtcbiAgfVxuXG4gIGRvdWJsZUJ1ZmZNZWRpY2FsSGVyYigpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnRW0nKTtcbiAgfVxuICBidWZmTWVkaWNhbEhlcmIoKSB7XG4gICAgcmV0dXJuICF0aGlzLmNoZWNrKCdIbScpO1xuICB9XG4gIGRlY3JlYXNlRW5lbXlEYW1hZ2UoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0VkJyk7XG4gIH1cbiAgbmV2ZXJEaWUoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0RpJyk7XG4gIH1cbiAgY2hhcmdlU2hvdHNPbmx5KCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdIYycpO1xuICB9XG5cbiAgYmFycmllclJlcXVpcmVzQ2FsbVNlYSgpIHtcbiAgICByZXR1cm4gdHJ1ZTsgLy8gdGhpcy5jaGVjaygnUmwnKTtcbiAgfVxuICBwYXJhbHlzaXNSZXF1aXJlc1ByaXNvbktleSgpIHtcbiAgICByZXR1cm4gdHJ1ZTsgLy8gdGhpcy5jaGVjaygnUmwnKTtcbiAgfVxuICBzZWFsZWRDYXZlUmVxdWlyZXNXaW5kbWlsbCgpIHtcbiAgICByZXR1cm4gdHJ1ZTsgLy8gdGhpcy5jaGVjaygnUmwnKTtcbiAgfVxuICBjb25uZWN0TGltZVRyZWVUb0xlYWYoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ1JwJyk7XG4gIH1cbiAgc3RvcnlNb2RlKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdScycpO1xuICB9XG4gIHJlcXVpcmVIZWFsZWREb2xwaGluVG9SaWRlKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdSZCcpO1xuICB9XG4gIHNhaGFyYVJhYmJpdHNSZXF1aXJlVGVsZXBhdGh5KCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdScicpO1xuICB9XG4gIHRlbGVwb3J0T25UaHVuZGVyU3dvcmQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ1J0Jyk7XG4gIH1cbiAgb3Jic09wdGlvbmFsKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdSbycpO1xuICB9XG5cbiAgcmFuZG9taXplTWFwcygpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmFuZG9taXplVHJhZGVzKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdXdCcpO1xuICB9XG4gIHVuaWRlbnRpZmllZEl0ZW1zKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdXdScpO1xuICB9XG4gIHJhbmRvbWl6ZVdhbGxzKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdXdycpO1xuICB9XG5cbiAgZ3VhcmFudGVlU3dvcmQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0VzJyk7XG4gIH1cbiAgZ3VhcmFudGVlU3dvcmRNYWdpYygpIHtcbiAgICByZXR1cm4gIXRoaXMuY2hlY2soJ0h3Jyk7XG4gIH1cbiAgZ3VhcmFudGVlTWF0Y2hpbmdTd29yZCgpIHtcbiAgICByZXR1cm4gIXRoaXMuY2hlY2soJ0hzJyk7XG4gIH1cbiAgZ3VhcmFudGVlR2FzTWFzaygpIHtcbiAgICByZXR1cm4gIXRoaXMuY2hlY2soJ0hnJyk7XG4gIH1cbiAgZ3VhcmFudGVlQmFycmllcigpIHtcbiAgICByZXR1cm4gIXRoaXMuY2hlY2soJ0hiJyk7XG4gIH1cbiAgZ3VhcmFudGVlUmVmcmVzaCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnRXInKTtcbiAgfVxuXG4gIGRpc2FibGVTd29yZENoYXJnZUdsaXRjaCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnRmMnKTtcbiAgfVxuICBkaXNhYmxlVGVsZXBvcnRTa2lwKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdGcCcpO1xuICB9XG4gIGRpc2FibGVSYWJiaXRTa2lwKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdGcicpO1xuICB9XG4gIGRpc2FibGVTaG9wR2xpdGNoKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdGcycpO1xuICB9XG4gIGRpc2FibGVTdGF0dWVHbGl0Y2goKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0Z0Jyk7XG4gIH1cblxuICBhc3N1bWVTd29yZENoYXJnZUdsaXRjaCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnR2MnKTtcbiAgfVxuICBhc3N1bWVHaGV0dG9GbGlnaHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0dmJyk7XG4gIH1cbiAgYXNzdW1lVGVsZXBvcnRTa2lwKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdHcCcpO1xuICB9XG4gIGFzc3VtZVJhYmJpdFNraXAoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0dyJyk7XG4gIH1cbiAgYXNzdW1lU3RhdHVlR2xpdGNoKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdHdCcpO1xuICB9XG4gIGFzc3VtZVRyaWdnZXJHbGl0Y2goKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9ICAvLyBUT0RPIC0gb25seSB3b3JrcyBvbiBsYW5kP1xuICBhc3N1bWVXaWxkV2FycCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnR3cnKTtcbiAgfVxuXG4gIG5lcmZXaWxkV2FycCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnRncnKTtcbiAgfVxuICBhbGxvd1dpbGRXYXJwKCkge1xuICAgIHJldHVybiAhdGhpcy5uZXJmV2lsZFdhcnAoKTtcbiAgfVxuICByYW5kb21pemVXaWxkV2FycCgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnVHcnKTtcbiAgfVxuXG4gIGJsYWNrb3V0TW9kZSgpIHtcbiAgICByZXR1cm4gdGhpcy5jaGVjaygnSHonKTtcbiAgfVxuICBoYXJkY29yZU1vZGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0hoJyk7XG4gIH1cbiAgYnVmZkR5bmEoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2soJ0hkJyk7XG4gIH1cblxuICBleHBTY2FsaW5nRmFjdG9yKCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrKCdIeCcpID8gMC4yNSA6IHRoaXMuY2hlY2soJ0V4JykgPyAyLjUgOiAxO1xuICB9XG5cbiAgLy8gVGhlIGZvbGxvd2luZyBkaWRuJ3QgZW5kIHVwIGdldHRpbmcgdXNlZC5cblxuICAvLyBhbGxvd3MoZmxhZykge1xuICAvLyAgIGNvbnN0IHJlID0gZXhjbHVzaXZlRmxhZ3MoZmxhZyk7XG4gIC8vICAgaWYgKCFyZSkgcmV0dXJuIHRydWU7XG4gIC8vICAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5mbGFncykge1xuICAvLyAgICAgaWYgKHRoaXMuZmxhZ3Nba2V5XS5maW5kKHQgPT4gcmUudGVzdChrZXkgKyB0KSkpIHJldHVybiBmYWxzZTtcbiAgLy8gICB9XG4gIC8vICAgcmV0dXJuIHRydWU7XG4gIC8vIH1cblxuICAvLyBtZXJnZSh0aGF0KSB7XG4gIC8vICAgdGhpcy5mbGFncyA9IHRoYXQuZmxhZ3M7XG4gIC8vIH1cblxuICBwcml2YXRlIHJlbW92ZUNvbmZsaWN0cyhmbGFnOiBzdHJpbmcpIHtcbiAgICAvLyBOT1RFOiB0aGlzIGlzIHNvbWV3aGF0IHJlZHVuZGFudCB3aXRoIHNldChmbGFnLCBmYWxzZSlcbiAgICBjb25zdCByZSA9IHRoaXMuZXhjbHVzaXZlRmxhZ3MoZmxhZyk7XG4gICAgaWYgKCFyZSkgcmV0dXJuO1xuICAgIGZvciAoY29uc3Qga2V5IGluIHRoaXMuZmxhZ3MpIHtcbiAgICAgIGlmICghdGhpcy5mbGFncy5oYXNPd25Qcm9wZXJ0eShrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHRlcm1zID0gdGhpcy5mbGFnc1trZXldLmZpbHRlcih0ID0+ICFyZS50ZXN0KGtleSArIHQpKTtcbiAgICAgIGlmICh0ZXJtcy5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5mbGFnc1trZXldID0gdGVybXM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGUgdGhpcy5mbGFnc1trZXldO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgdG9TdHJpbmdLZXkoa2V5OiBzdHJpbmcpIHtcbiAgICBpZiAoUkVQRUFUQUJMRV9GTEFHUy5oYXMoa2V5KSkge1xuICAgICAgcmV0dXJuIFsuLi50aGlzLmZsYWdzW2tleV1dLnNvcnQoKS5tYXAodiA9PiBrZXkgKyB2KS5qb2luKCcgJyk7XG4gICAgfVxuICAgIHJldHVybiBrZXkgKyBbLi4udGhpcy5mbGFnc1trZXldXS5zb3J0KCkuam9pbignJyk7XG4gIH1cblxuICBwcml2YXRlIGV4Y2x1c2l2ZUZsYWdzKGZsYWc6IHN0cmluZyk6IFJlZ0V4cHx1bmRlZmluZWQge1xuICAgIGlmIChmbGFnLnN0YXJ0c1dpdGgoJ1MnKSkge1xuICAgICAgcmV0dXJuIG5ldyBSZWdFeHAoYFMuKlske2ZsYWcuc3Vic3RyaW5nKDEpfV1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBmbGFnRm9yTmFtZTogRmxhZyA9IHRoaXMuZ2V0RmxhZ0Zvck5hbWUoZmxhZyk7XG4gICAgaWYgKGZsYWdGb3JOYW1lID09IG51bGwpIHRocm93IG5ldyBFcnJvcihgVW5rbm93biBmbGFnOiAke2ZsYWd9YCk7XG4gICAgcmV0dXJuIGZsYWdGb3JOYW1lLmNvbmZsaWN0O1xuICB9XG5cbiAgcHJpdmF0ZSBnZXRGbGFnRm9yTmFtZShmbGFnOiBzdHJpbmcpOiBGbGFnIHtcbiAgICBjb25zdCBtYXRjaGluZ0ZsYWdTZWN0aW9uID0gRkxBR1MuZmluZChmbGFnU2VjdGlvbiA9PiB7XG4gICAgICByZXR1cm4gZmxhZy5zdGFydHNXaXRoKGZsYWdTZWN0aW9uLnByZWZpeCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gPEZsYWc+KDxGbGFnU2VjdGlvbj5tYXRjaGluZ0ZsYWdTZWN0aW9uKVxuICAgICAgICAuZmxhZ3MuZmluZChmbGFnVG9NYXRjaCA9PiBmbGFnVG9NYXRjaC5mbGFnID09PSBmbGFnKTtcbiAgfVxuXG4gIHRvU3RyaW5nKCkge1xuICAgIGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLmZsYWdzKTtcbiAgICBrZXlzLnNvcnQoKTtcbiAgICByZXR1cm4ga2V5cy5tYXAoayA9PiB0aGlzLnRvU3RyaW5nS2V5KGspKS5qb2luKCcgJyk7XG4gIH1cbn1cbiJdfQ==