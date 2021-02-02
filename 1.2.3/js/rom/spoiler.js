export class Spoiler {
    constructor(rom) {
        this.rom = rom;
        this.slots = [];
        this.route = [];
        this.mazes = [];
        this.trades = [];
        this.walls = [];
        this.unidentifiedItems = [];
        this.wildWarps = [];
        this.slotNames = [];
        this.conditionNames = {};
    }
    addCondition(condition, name) {
        this.conditionNames[condition] = name;
    }
    addCheck(condition, deps, item) {
        this.route.push(new Check(this, condition, deps, item));
    }
    addSlot(slot, slotName, item) {
        this.slots[slot] = new Slot(this.rom, slot, slotName, item);
        if (slotName)
            this.slotNames[0x200 | slot] = slotName;
    }
    addMaze(id, name, maze) {
        this.mazes.push({ id, name, maze });
    }
    addTrade(itemId, item, npc) {
        this.trades.push({ itemId, item, npc });
    }
    addUnidentifiedItem(itemId, oldName, newName) {
        this.unidentifiedItems.push({ itemId, oldName, newName });
    }
    addWall(location, oldElement, newElement) {
        this.walls.push({ location, oldElement, newElement });
    }
    addWildWarp(id, name) {
        this.wildWarps.push({ id, name });
    }
    formatCondition(id, item) {
        if (id < 0x200 || id >= 0x280)
            return this.conditionNames[id] || conditionHex(id);
        if (item == null)
            return slotToItem(this.rom, id & 0xff);
        return `${this.slotNames[id] || conditionHex(id)} (${this.formatCondition(item | 0x200)})`;
    }
}
class Check {
    constructor(spoiler, condition, deps, item) {
        this.spoiler = spoiler;
        this.condition = condition;
        this.deps = deps;
        this.item = item;
    }
    toString() {
        return `${this.spoiler.formatCondition(this.condition, this.item)}: [${this.deps.map(d => this.spoiler.formatCondition(d)).join(', ')}]`;
    }
}
function conditionHex(id) {
    return id < 0 ? '~' + ~id.toString(16).padStart(2, '0') : id.toString(16).padStart(3, '0');
}
class Slot {
    constructor(rom, slot, slotName, item) {
        this.slot = slot;
        this.slotName = slotName;
        this.item = item;
        this.itemName = slotToItem(rom, item);
        this.originalItem = slotToItem(rom, slot);
    }
    toString() {
        return `${this.itemName}: ${this.slotName} (${this.originalItem})`;
    }
}
function slotToItem(rom, slot) {
    if (slot >= 0x70)
        return 'Mimic';
    return rom.items[rom.itemGets[slot].itemId].messageName;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3BvaWxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9qcy9yb20vc3BvaWxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFXQSxNQUFNLE9BQU8sT0FBTztJQWVsQixZQUFxQixHQUFRO1FBQVIsUUFBRyxHQUFILEdBQUcsQ0FBSztRQWRwQixVQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ25CLFVBQUssR0FBWSxFQUFFLENBQUM7UUFDcEIsVUFBSyxHQUFXLEVBQUUsQ0FBQztRQUNuQixXQUFNLEdBQVksRUFBRSxDQUFDO1FBQ3JCLFVBQUssR0FBVyxFQUFFLENBQUM7UUFDbkIsc0JBQWlCLEdBQXVCLEVBQUUsQ0FBQztRQUMzQyxjQUFTLEdBQWUsRUFBRSxDQUFDO1FBSzNCLGNBQVMsR0FBMkIsRUFBRSxDQUFDO1FBQ3ZDLG1CQUFjLEdBQTJCLEVBQUUsQ0FBQztJQUVyQixDQUFDO0lBRWpDLFlBQVksQ0FBQyxTQUFpQixFQUFFLElBQVk7UUFDMUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsR0FBRyxJQUFJLENBQUM7SUFDeEMsQ0FBQztJQUVELFFBQVEsQ0FBQyxTQUFpQixFQUFFLElBQXVCLEVBQUUsSUFBYTtRQUNoRSxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFRCxPQUFPLENBQUMsSUFBWSxFQUFFLFFBQWdCLEVBQUUsSUFBWTtRQUNsRCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RCxJQUFJLFFBQVE7WUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxRQUFR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Q0FBUTtRQUNaLGFBQVEsR0FBUixRQUFRLENBQVE7UUFDaEIsU0FBSSxHQUFKLElBQUksQ0FBUTtRQUMvQixJQUFJLENBQUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLFlBQVksR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxRQUFRO1FBRU4sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLEtBQUssSUFBSSxDQUFDLFFBQVEsS0FBSyxJQUFJLENBQUMsWUFBWSxHQUFHLENBQUM7SUFDckUsQ0FBQztDQUNGO0FBRUQsU0FBUyxVQUFVLENBQUMsR0FBUSxFQUFFLElBQVk7SUFDeEMsSUFBSSxJQUFJLElBQUksSUFBSTtRQUFFLE9BQU8sT0FBTyxDQUFDO0lBQ2pDLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLFdBQVcsQ0FBQztBQUMxRCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtSb219IGZyb20gJy4uL3JvbS5qcyc7XG5cbi8qKlxuICogU3RvcmVzIG9yZ2FuaXplZCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgc2h1ZmZsZSwgaW5jbHVkaW5nXG4gKiAgIC0gd2hpY2ggaXRlbXMgYXJlIGluIHdoaWNoIHNsb3RzXG4gKiAgIC0gYSBrbm93bi13b3JraW5nIHJvdXRlIHRocm91Z2ggdGhlIGdhbWVcbiAqICAgLSB3aGljaCBlbmVtaWVzIGFyZSBzaHVmZmxlIHdoZXJlXG4gKiAgIC0gZW5lbXkgdnVsbmVyYWJpbGl0aWVzXG4gKiAgIC0gbG9jYXRpb24gY29ubmVjdGlvbnNcbiAqICAgLSByb3V0ZXMgdG8gZWFjaCBhcmVhXG4gKi9cbmV4cG9ydCBjbGFzcyBTcG9pbGVyIHtcbiAgcmVhZG9ubHkgc2xvdHM6IFNsb3RbXSA9IFtdO1xuICByZWFkb25seSByb3V0ZTogQ2hlY2tbXSA9IFtdO1xuICByZWFkb25seSBtYXplczogTWF6ZVtdID0gW107XG4gIHJlYWRvbmx5IHRyYWRlczogVHJhZGVbXSA9IFtdO1xuICByZWFkb25seSB3YWxsczogV2FsbFtdID0gW107XG4gIHJlYWRvbmx5IHVuaWRlbnRpZmllZEl0ZW1zOiBVbmlkZW50aWZpZWRJdGVtW10gPSBbXTtcbiAgcmVhZG9ubHkgd2lsZFdhcnBzOiBXaWxkV2FycFtdID0gW107XG5cbiAgLy8gVE9ETyAtIHNob3BzLCBib3NzIHdlYWtuZXNzZXNcblxuICAvLyBVc2VkIGZvciBsYXppbHkgZGlzcGxheWluZyByb3V0ZVxuICByZWFkb25seSBzbG90TmFtZXM6IHtbaWQ6IG51bWJlcl06IHN0cmluZ30gPSBbXTtcbiAgcmVhZG9ubHkgY29uZGl0aW9uTmFtZXM6IHtbaWQ6IG51bWJlcl06IHN0cmluZ30gPSB7fTtcblxuICBjb25zdHJ1Y3RvcihyZWFkb25seSByb206IFJvbSkge31cblxuICBhZGRDb25kaXRpb24oY29uZGl0aW9uOiBudW1iZXIsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuY29uZGl0aW9uTmFtZXNbY29uZGl0aW9uXSA9IG5hbWU7XG4gIH1cblxuICBhZGRDaGVjayhjb25kaXRpb246IG51bWJlciwgZGVwczogcmVhZG9ubHkgbnVtYmVyW10sIGl0ZW0/OiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLnJvdXRlLnB1c2gobmV3IENoZWNrKHRoaXMsIGNvbmRpdGlvbiwgZGVwcywgaXRlbSkpO1xuICB9XG5cbiAgYWRkU2xvdChzbG90OiBudW1iZXIsIHNsb3ROYW1lOiBzdHJpbmcsIGl0ZW06IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMuc2xvdHNbc2xvdF0gPSBuZXcgU2xvdCh0aGlzLnJvbSwgc2xvdCwgc2xvdE5hbWUsIGl0ZW0pO1xuICAgIGlmIChzbG90TmFtZSkgdGhpcy5zbG90TmFtZXNbMHgyMDAgfCBzbG90XSA9IHNsb3ROYW1lO1xuICB9XG5cbiAgYWRkTWF6ZShpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcsIG1hemU6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMubWF6ZXMucHVzaCh7aWQsIG5hbWUsIG1hemV9KTtcbiAgfVxuXG4gIGFkZFRyYWRlKGl0ZW1JZDogbnVtYmVyLCBpdGVtOiBzdHJpbmcsIG5wYzogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy50cmFkZXMucHVzaCh7aXRlbUlkLCBpdGVtLCBucGN9KTtcbiAgfVxuXG4gIGFkZFVuaWRlbnRpZmllZEl0ZW0oaXRlbUlkOiBudW1iZXIsIG9sZE5hbWU6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy51bmlkZW50aWZpZWRJdGVtcy5wdXNoKHtpdGVtSWQsIG9sZE5hbWUsIG5ld05hbWV9KTtcbiAgfVxuXG4gIGFkZFdhbGwobG9jYXRpb246IHN0cmluZywgb2xkRWxlbWVudDogbnVtYmVyLCBuZXdFbGVtZW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLndhbGxzLnB1c2goe2xvY2F0aW9uLCBvbGRFbGVtZW50LCBuZXdFbGVtZW50fSk7XG4gIH1cblxuICBhZGRXaWxkV2FycChpZDogbnVtYmVyLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLndpbGRXYXJwcy5wdXNoKHtpZCwgbmFtZX0pO1xuICB9XG5cbiAgZm9ybWF0Q29uZGl0aW9uKGlkOiBudW1iZXIsIGl0ZW0/OiBudW1iZXIpOiBzdHJpbmcge1xuICAgIC8vIE9yZGluYXJ5IHN5bW1ldGljIGNvbmRpdGlvbnNcbiAgICBpZiAoaWQgPCAweDIwMCB8fCBpZCA+PSAweDI4MCkgcmV0dXJuIHRoaXMuY29uZGl0aW9uTmFtZXNbaWRdIHx8IGNvbmRpdGlvbkhleChpZCk7XG4gICAgLy8gRGVwZW5kZW5jeSBpdGVtcyAtIGFsd2F5cyA8IDI0OFxuICAgIGlmIChpdGVtID09IG51bGwpIHJldHVybiBzbG90VG9JdGVtKHRoaXMucm9tLCBpZCAmIDB4ZmYpO1xuICAgIC8vIFNsb3QgLSBwcmludCBib3RoIHNsb3QgYW5kIGl0ZW0gbmFtZVxuICAgIHJldHVybiBgJHt0aGlzLnNsb3ROYW1lc1tpZF0gfHwgY29uZGl0aW9uSGV4KGlkKX0gKCR7dGhpcy5mb3JtYXRDb25kaXRpb24oaXRlbSB8IDB4MjAwKX0pYDtcbiAgfVxufVxuXG5pbnRlcmZhY2UgTWF6ZSB7XG4gIGlkOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbiAgbWF6ZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgVHJhZGUge1xuICBpdGVtSWQ6IG51bWJlcjtcbiAgaXRlbTogc3RyaW5nO1xuICBucGM6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFVuaWRlbnRpZmllZEl0ZW0ge1xuICBpdGVtSWQ6IG51bWJlcjtcbiAgb2xkTmFtZTogc3RyaW5nO1xuICBuZXdOYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBXYWxsIHtcbiAgbG9jYXRpb246IHN0cmluZztcbiAgb2xkRWxlbWVudDogbnVtYmVyO1xuICBuZXdFbGVtZW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBXaWxkV2FycCB7XG4gIGlkOiBudW1iZXI7XG4gIG5hbWU6IHN0cmluZztcbn1cblxuY2xhc3MgQ2hlY2sge1xuICBjb25zdHJ1Y3RvcihyZWFkb25seSBzcG9pbGVyOiBTcG9pbGVyLFxuICAgICAgICAgICAgICByZWFkb25seSBjb25kaXRpb246IG51bWJlcixcbiAgICAgICAgICAgICAgcmVhZG9ubHkgZGVwczogcmVhZG9ubHkgbnVtYmVyW10sXG4gICAgICAgICAgICAgIHJlYWRvbmx5IGl0ZW06IG51bWJlciB8IHVuZGVmaW5lZCkge31cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLnNwb2lsZXIuZm9ybWF0Q29uZGl0aW9uKHRoaXMuY29uZGl0aW9uLCB0aGlzLml0ZW0pfTogWyR7XG4gICAgICAgICAgICB0aGlzLmRlcHMubWFwKGQgPT4gdGhpcy5zcG9pbGVyLmZvcm1hdENvbmRpdGlvbihkKSkuam9pbignLCAnKX1dYDtcbiAgfVxufVxuXG5mdW5jdGlvbiBjb25kaXRpb25IZXgoaWQ6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBpZCA8IDAgPyAnficgKyB+aWQudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDIsICcwJykgOiBpZC50b1N0cmluZygxNikucGFkU3RhcnQoMywgJzAnKTtcbn1cblxuY2xhc3MgU2xvdCB7XG4gIHJlYWRvbmx5IGl0ZW1OYW1lOiBzdHJpbmc7XG4gIHJlYWRvbmx5IG9yaWdpbmFsSXRlbTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHJvbTogUm9tLFxuICAgICAgICAgICAgICByZWFkb25seSBzbG90OiBudW1iZXIsXG4gICAgICAgICAgICAgIHJlYWRvbmx5IHNsb3ROYW1lOiBzdHJpbmcsXG4gICAgICAgICAgICAgIHJlYWRvbmx5IGl0ZW06IG51bWJlcikge1xuICAgIHRoaXMuaXRlbU5hbWUgPSBzbG90VG9JdGVtKHJvbSwgaXRlbSk7XG4gICAgdGhpcy5vcmlnaW5hbEl0ZW0gPSBzbG90VG9JdGVtKHJvbSwgc2xvdCk7XG4gIH1cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIC8vIEZpZ3VyZSBvdXQgdGhlIG5hbWUgb2YgdGhlIHNsb3QsIHRoZSBvcmlnaW5hbCBpdGVtLCBldGNcbiAgICByZXR1cm4gYCR7dGhpcy5pdGVtTmFtZX06ICR7dGhpcy5zbG90TmFtZX0gKCR7dGhpcy5vcmlnaW5hbEl0ZW19KWA7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2xvdFRvSXRlbShyb206IFJvbSwgc2xvdDogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKHNsb3QgPj0gMHg3MCkgcmV0dXJuICdNaW1pYyc7XG4gIHJldHVybiByb20uaXRlbXNbcm9tLml0ZW1HZXRzW3Nsb3RdLml0ZW1JZF0ubWVzc2FnZU5hbWU7XG59XG4iXX0=