import { hex } from './util.js';
export class Entity {
    constructor(rom, id) {
        this.rom = rom;
        this.id = id;
    }
    write(writer) { }
    toString() {
        return `${this.constructor.name} $${hex(this.id)}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2pzL3JvbS9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBRUEsT0FBTyxFQUFDLEdBQUcsRUFBQyxNQUFNLFdBQVcsQ0FBQztBQUk5QixNQUFNLE9BQU8sTUFBTTtJQUNqQixZQUFxQixHQUFRLEVBQVcsRUFBVTtRQUE3QixRQUFHLEdBQUgsR0FBRyxDQUFLO1FBQVcsT0FBRSxHQUFGLEVBQUUsQ0FBUTtJQUFHLENBQUM7SUFFdEQsS0FBSyxDQUFDLE1BQWMsSUFBRyxDQUFDO0lBRXhCLFFBQVE7UUFDTixPQUFPLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO0lBQ3JELENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEJhc2UgY2xhc3MgZm9yIGFsbCB0aGUgZGlmZmVyZW50IGVudGl0eSB0eXBlcy5cblxuaW1wb3J0IHtoZXh9IGZyb20gJy4vdXRpbC5qcyc7XG5pbXBvcnQge1dyaXRlcn0gZnJvbSAnLi93cml0ZXIuanMnO1xuaW1wb3J0IHtSb219IGZyb20gJy4uL3JvbS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFbnRpdHkge1xuICBjb25zdHJ1Y3RvcihyZWFkb25seSByb206IFJvbSwgcmVhZG9ubHkgaWQ6IG51bWJlcikge31cblxuICB3cml0ZSh3cml0ZXI6IFdyaXRlcikge31cblxuICB0b1N0cmluZygpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5jb25zdHJ1Y3Rvci5uYW1lfSAkJHtoZXgodGhpcy5pZCl9YDtcbiAgfVxufVxuIl19