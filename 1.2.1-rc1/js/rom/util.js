export function seq(x, f = (i) => i) {
    return new Array(x).fill(0).map((_, i) => f(i));
}
export function slice(arr, start, len) {
    return arr.slice(start, start + len);
}
export function tuple(arr, start, len) {
    return Array.from(arr.slice(start, start + len));
}
export function signed(x) {
    return x < 0x80 ? x : x - 0x100;
}
export function unsigned(x) {
    return x < 0 ? x + 0x100 : x;
}
export function varSlice(arr, start, width, sentinel, end = Infinity, func) {
    if (!func)
        func = (x) => x;
    const out = [];
    while (start + width <= end && arr[start] !== sentinel) {
        out.push(func(arr.slice(start, start + width)));
        start += width;
    }
    return out;
}
export function addr(arr, i, offset = 0) {
    return (arr[i] | arr[i + 1] << 8) + offset;
}
export function group(width, arr, func) {
    if (!func)
        func = (x) => x;
    return seq(Math.max(0, Math.floor(arr.length / width)), i => func(slice(arr, i * width, width)));
}
export function reverseBits(x) {
    return ((x * 0x0802 & 0x22110) | (x * 0x8020 & 0x88440)) * 0x10101 >>> 16 & 0xff;
}
export function countBits(x) {
    x -= x >> 1 & 0x55;
    x = (x & 0x33) + (x >> 2 & 0x33);
    return (x + (x >> 4)) & 0xf;
}
export function hex(id) {
    return id != null ? id.toString(16).padStart(2, '0') : String(id);
}
export function hex4(id) {
    return id.toString(16).padStart(4, '0');
}
export function hex5(id) {
    return id.toString(16).padStart(5, '0');
}
export function concatIterables(iters) {
    const out = [];
    for (const iter of iters) {
        for (const elem of iter) {
            out.push(elem);
        }
    }
    return out;
}
export function readBigEndian(data, offset) {
    return data[offset] << 8 | data[offset + 1];
}
export function readLittleEndian(data, offset) {
    return data[offset + 1] << 8 | data[offset];
}
export function readString(arr, address, end = 0) {
    const bytes = [];
    while (arr[address] != end) {
        bytes.push(arr[address++]);
    }
    return String.fromCharCode(...bytes);
}
export function writeLittleEndian(data, offset, value) {
    data[offset] = value & 0xff;
    data[offset + 1] = value >>> 8;
}
export function writeString(arr, address, str) {
    for (let i = 0, len = str.length; i < len; i++) {
        arr[address + i] = str.charCodeAt(i);
    }
}
export function write(data, offset, values) {
    data.subarray(offset, offset + values.length).set(values);
}
export class FlagListType {
    constructor(last, clear) {
        this.last = last;
        this.clear = clear;
    }
    read(data, offset = 0) {
        const flags = [];
        while (true) {
            const hi = data[offset++];
            const lo = data[offset++];
            const flag = (hi & 3) << 8 | lo;
            flags.push(hi & this.clear ? ~flag : flag);
            if (hi & this.last)
                return flags;
        }
    }
    bytes(flags) {
        const bytes = [];
        for (let i = 0; i < flags.length; i++) {
            let flag = flags[i];
            if (flag < 0)
                flag = (this.clear << 8) | ~flag;
            if (i === flags.length - 1)
                flag |= (this.last << 8);
            bytes.push(flag >>> 8);
            bytes.push(flag & 0xff);
        }
        return bytes;
    }
    write(data, flags, offset = 0) {
        const bytes = this.bytes(flags);
        for (let i = 0; i < bytes.length; i++) {
            data[i + offset] = bytes[i];
        }
    }
}
export const DIALOG_FLAGS = new FlagListType(0x40, 0x80);
export const ITEM_GET_FLAGS = new FlagListType(0x40, 0x80);
export const SPAWN_CONDITION_FLAGS = new FlagListType(0x80, 0x20);
export class DataTuple {
    constructor(data) {
        this.data = data;
    }
    [Symbol.iterator]() {
        return this.data[Symbol.iterator]();
    }
    hex() {
        return Array.from(this.data, hex).join(' ');
    }
    clone() {
        return new this.constructor(this.data);
    }
    static make(length, props) {
        const cls = class extends DataTuple {
            constructor(data = new Array(length).fill(0)) { super(data); }
            static of(inits) {
                const out = new cls();
                for (const [key, value] of Object.entries(inits)) {
                    out[key] = value;
                }
                return out;
            }
            static from(data, offset = 0) {
                return new cls(tuple(data, offset, length));
            }
        };
        const descriptors = {};
        for (const key in props) {
            if (typeof props[key] === 'function') {
                descriptors[key] = { value: props[key] };
            }
            else {
                descriptors[key] = props[key];
            }
        }
        Object.defineProperties(cls.prototype, descriptors);
        return cls;
    }
    static prop(...bits) {
        return {
            get() {
                let value = 0;
                for (const [index, mask = 0xff, shift = 0] of bits) {
                    const lsh = shift < 0 ? -shift : 0;
                    const rsh = shift < 0 ? 0 : shift;
                    value |= ((this.data[index] & mask) >>> rsh) << lsh;
                }
                return value;
            },
            set(value) {
                for (const [index, mask = 0xff, shift = 0] of bits) {
                    const lsh = shift < 0 ? -shift : 0;
                    const rsh = shift < 0 ? 0 : shift;
                    const v = (value >>> lsh) << rsh & mask;
                    this.data[index] = this.data[index] & ~mask | v;
                }
            },
        };
    }
    static booleanProp(bit) {
        const prop = DataTuple.prop(bit);
        return { get() { return !!prop.get.call(this); },
            set(value) { prop.set.call(this, +value); } };
    }
}
export const watchArray = (arr, watch) => {
    const arrayChangeHandler = {
        get(target, property) {
            let v = target[property];
            if (property === 'subarray') {
                return (start, end) => {
                    const sub = target.subarray(start, end);
                    if (start <= watch && watch < end)
                        return watchArray(sub, watch - start);
                    return sub;
                };
            }
            else if (property === 'set') {
                return (val) => {
                    console.log(`Setting overlapping array ${watch}`);
                    debugger;
                    target.set(val);
                };
            }
            if (typeof v === 'function')
                v = v.bind(target);
            return v;
        },
        set(target, property, value, receiver) {
            if (property == watch) {
                console.log(`Writing ${watch.toString(16)}`);
                debugger;
            }
            target[property] = value;
            return true;
        },
    };
    return new Proxy(arr, arrayChangeHandler);
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9qcy9yb20vdXRpbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFPQSxNQUFNLFVBQVUsR0FBRyxDQUFDLENBQVMsRUFBRSxJQUEyQixDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNoRSxPQUFPLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsRCxDQUFDO0FBU0QsTUFBTSxVQUFVLEtBQUssQ0FBc0IsR0FBTSxFQUFFLEtBQWEsRUFBRSxHQUFXO0lBQzNFLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ3ZDLENBQUM7QUFNRCxNQUFNLFVBQVUsS0FBSyxDQUFJLEdBQVksRUFBRSxLQUFhLEVBQUUsR0FBVztJQUMvRCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQUVELE1BQU0sVUFBVSxNQUFNLENBQUMsQ0FBUztJQUM5QixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQztBQUNsQyxDQUFDO0FBRUQsTUFBTSxVQUFVLFFBQVEsQ0FBQyxDQUFTO0lBQ2hDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQy9CLENBQUM7QUFhRCxNQUFNLFVBQVUsUUFBUSxDQUE0QixHQUFNLEVBQ04sS0FBYSxF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RUFBRSxDQUFDLENBQUM7Z0JBRTdDLFFBQVEsQ0FBQzthQUNWO1lBQ0QsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUV6QixPQUFPLElBQUksQ0FBQztRQUNkLENBQUM7S0FDRixDQUFDO0lBQ0YsT0FBTyxJQUFJLEtBQUssQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztBQUM1QyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBHZW5lcmFsIHV0aWxpdGllcyBmb3Igcm9tIHBhY2thZ2UuXG5cbi8qKiBSZW1vdmVzIHJlYWRvbmx5IGZyb20gZmllbGRzLiAqL1xuZXhwb3J0IHR5cGUgTXV0YWJsZTxUPiA9IHstcmVhZG9ubHkgW0sgaW4ga2V5b2YoVCldOiBUW0tdfTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNlcSh4OiBudW1iZXIpOiBudW1iZXJbXTtcbmV4cG9ydCBmdW5jdGlvbiBzZXE8VD4oeDogbnVtYmVyLCBmPzogKHg6IG51bWJlcikgPT4gVCk6IFRbXTtcbmV4cG9ydCBmdW5jdGlvbiBzZXEoeDogbnVtYmVyLCBmOiAoeDogbnVtYmVyKSA9PiBudW1iZXIgPSAoaSkgPT4gaSk6IG51bWJlcltdIHtcbiAgcmV0dXJuIG5ldyBBcnJheSh4KS5maWxsKDApLm1hcCgoXywgaSkgPT4gZihpKSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGF0YTxUPiB7XG4gIFtpbmRleDogbnVtYmVyXTogVDtcbiAgbGVuZ3RoOiBudW1iZXI7XG4gIHNsaWNlKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogdGhpcztcbiAgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8VD47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzbGljZTxUIGV4dGVuZHMgRGF0YTxhbnk+PihhcnI6IFQsIHN0YXJ0OiBudW1iZXIsIGxlbjogbnVtYmVyKTogVCB7XG4gIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIHN0YXJ0ICsgbGVuKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHR1cGxlPFQ+KGFycjogRGF0YTxUPiwgc3RhcnQ6IG51bWJlciwgbGVuOiAyKTogW1QsIFRdO1xuZXhwb3J0IGZ1bmN0aW9uIHR1cGxlPFQ+KGFycjogRGF0YTxUPiwgc3RhcnQ6IG51bWJlciwgbGVuOiAzKTogW1QsIFQsIFRdO1xuZXhwb3J0IGZ1bmN0aW9uIHR1cGxlPFQ+KGFycjogRGF0YTxUPiwgc3RhcnQ6IG51bWJlciwgbGVuOiA0KTogW1QsIFQsIFQsIFRdO1xuZXhwb3J0IGZ1bmN0aW9uIHR1cGxlPFQ+KGFycjogRGF0YTxUPiwgc3RhcnQ6IG51bWJlciwgbGVuOiBudW1iZXIpOiBUW107XG5leHBvcnQgZnVuY3Rpb24gdHVwbGU8VD4oYXJyOiBEYXRhPFQ+LCBzdGFydDogbnVtYmVyLCBsZW46IG51bWJlcik6IFRbXSB7XG4gIHJldHVybiBBcnJheS5mcm9tKGFyci5zbGljZShzdGFydCwgc3RhcnQgKyBsZW4pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNpZ25lZCh4OiBudW1iZXIpOiBudW1iZXIge1xuICByZXR1cm4geCA8IDB4ODAgPyB4IDogeCAtIDB4MTAwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5zaWduZWQoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIHggPCAwID8geCArIDB4MTAwIDogeDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHZhclNsaWNlPFQgZXh0ZW5kcyBEYXRhPG51bWJlcj4+KGFycjogVCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGFydDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VudGluZWw6IG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmQ/OiBudW1iZXIpOiBUW107XG5leHBvcnQgZnVuY3Rpb24gdmFyU2xpY2U8VCBleHRlbmRzIERhdGE8bnVtYmVyPiwgVT4oYXJyOiBULFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZW50aW5lbDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmM6IChzbGljZTogVCkgPT4gVSk6IFVbXTtcbmV4cG9ydCBmdW5jdGlvbiB2YXJTbGljZTxUIGV4dGVuZHMgRGF0YTxudW1iZXI+LCBVPihhcnI6IFQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbnRpbmVsOiBudW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5kOiBudW1iZXIgPSBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jPzogKHNsaWNlOiBUKSA9PiBVKTogVVtdIHtcbiAgaWYgKCFmdW5jKSBmdW5jID0gKHg6IFQpID0+IHggYXMgYW55O1xuICBjb25zdCBvdXQgPSBbXTtcbiAgd2hpbGUgKHN0YXJ0ICsgd2lkdGggPD0gZW5kICYmIGFycltzdGFydF0gIT09IHNlbnRpbmVsKSB7XG4gICAgb3V0LnB1c2goZnVuYyEoYXJyLnNsaWNlKHN0YXJ0LCBzdGFydCArIHdpZHRoKSkpO1xuICAgIHN0YXJ0ICs9IHdpZHRoO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRyKGFycjogRGF0YTxudW1iZXI+LCBpOiBudW1iZXIsIG9mZnNldDogbnVtYmVyID0gMCk6IG51bWJlciB7XG4gIHJldHVybiAoYXJyW2ldIHwgYXJyW2kgKyAxXSA8PCA4KSArIG9mZnNldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdyb3VwPFQgZXh0ZW5kcyBEYXRhPGFueT4+KHdpZHRoOiBudW1iZXIsIGFycjogVCk6IFRbXTtcbmV4cG9ydCBmdW5jdGlvbiBncm91cDxUIGV4dGVuZHMgRGF0YTxhbnk+LCBVPih3aWR0aDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFycjogVCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jOiAoc2xpY2U6IFQpID0+IFUpOiBVW107XG5cbmV4cG9ydCBmdW5jdGlvbiBncm91cDxUIGV4dGVuZHMgRGF0YTxhbnk+LCBVPih3aWR0aDogbnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFycjogVCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jPzogKHNsaWNlOiBUKSA9PiBVKTogVVtdIHtcbiAgaWYgKCFmdW5jKSBmdW5jID0gKHg6IFQpID0+IHggYXMgYW55O1xuICByZXR1cm4gc2VxKFxuICAgICAgTWF0aC5tYXgoMCwgTWF0aC5mbG9vcihhcnIubGVuZ3RoIC8gd2lkdGgpKSxcbiAgICAgIGkgPT4gZnVuYyEoc2xpY2UoYXJyLCBpICogd2lkdGgsIHdpZHRoKSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmV2ZXJzZUJpdHMoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuICgoeCAqIDB4MDgwMiAmIDB4MjIxMTApIHwgKHggKiAweDgwMjAgJiAweDg4NDQwKSkgKiAweDEwMTAxID4+PiAxNiAmIDB4ZmY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb3VudEJpdHMoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgeCAtPSB4ID4+IDEgJiAweDU1O1xuICB4ID0gKHggJiAweDMzKSArICh4ID4+IDIgJiAweDMzKTtcbiAgcmV0dXJuICh4ICsgKHggPj4gNCkpICYgMHhmO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGV4KGlkOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gaWQgIT0gbnVsbCA/IGlkLnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCAnMCcpIDogU3RyaW5nKGlkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhleDQoaWQ6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBpZC50b1N0cmluZygxNikucGFkU3RhcnQoNCwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhleDUoaWQ6IG51bWJlcik6IHN0cmluZyB7XG4gIHJldHVybiBpZC50b1N0cmluZygxNikucGFkU3RhcnQoNSwgJzAnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbmNhdEl0ZXJhYmxlcyhpdGVyczogSXRlcmFibGU8bnVtYmVyPltdKTogbnVtYmVyW10ge1xuICBjb25zdCBvdXQ6IG51bWJlcltdID0gW107XG4gIGZvciAoY29uc3QgaXRlciBvZiBpdGVycykge1xuICAgIGZvciAoY29uc3QgZWxlbSBvZiBpdGVyKSB7XG4gICAgICBvdXQucHVzaChlbGVtKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbiAgLy8gcmV0dXJuIFtdLmNvbmNhdCguLi5pdGVycy5tYXAoQXJyYXkuZnJvbSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZEJpZ0VuZGlhbihkYXRhOiBEYXRhPG51bWJlcj4sIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIGRhdGFbb2Zmc2V0XSA8PCA4IHwgZGF0YVtvZmZzZXQgKyAxXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRMaXR0bGVFbmRpYW4oZGF0YTogRGF0YTxudW1iZXI+LCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBkYXRhW29mZnNldCArIDFdIDw8IDggfCBkYXRhW29mZnNldF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkU3RyaW5nKGFycjogRGF0YTxudW1iZXI+LCBhZGRyZXNzOiBudW1iZXIsIGVuZDogbnVtYmVyID0gMCk6IHN0cmluZyB7XG4gIGNvbnN0IGJ5dGVzID0gW107XG4gIHdoaWxlIChhcnJbYWRkcmVzc10gIT0gZW5kKSB7XG4gICAgYnl0ZXMucHVzaChhcnJbYWRkcmVzcysrXSk7XG4gIH1cbiAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoLi4uYnl0ZXMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVMaXR0bGVFbmRpYW4oZGF0YTogRGF0YTxudW1iZXI+LCBvZmZzZXQ6IG51bWJlciwgdmFsdWU6IG51bWJlcikge1xuICBkYXRhW29mZnNldF0gPSB2YWx1ZSAmIDB4ZmY7XG4gIGRhdGFbb2Zmc2V0ICsgMV0gPSB2YWx1ZSA+Pj4gODtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlU3RyaW5nKGFycjogRGF0YTxudW1iZXI+LCBhZGRyZXNzOiBudW1iZXIsIHN0cjogc3RyaW5nKSB7XG4gIGZvciAobGV0IGkgPSAwLCBsZW4gPSBzdHIubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBhcnJbYWRkcmVzcyArIGldID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlKGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCB2YWx1ZXM6IERhdGE8bnVtYmVyPikge1xuICBkYXRhLnN1YmFycmF5KG9mZnNldCwgb2Zmc2V0ICsgdmFsdWVzLmxlbmd0aCkuc2V0KHZhbHVlcyk7XG59XG5cbmV4cG9ydCBjbGFzcyBGbGFnTGlzdFR5cGUge1xuICBjb25zdHJ1Y3RvcihyZWFkb25seSBsYXN0OiBudW1iZXIsIHJlYWRvbmx5IGNsZWFyOiBudW1iZXIpIHt9XG5cbiAgcmVhZChkYXRhOiBEYXRhPG51bWJlcj4sIG9mZnNldDogbnVtYmVyID0gMCk6IG51bWJlcltdIHtcbiAgICAvLyBUT0RPIC0gZG8gd2UgZXZlciBuZWVkIHRvIGludmVydCBjbGVhci9sYXN0PyAgSWYgc28sIHVzZSB+IGFzIHNpZ25hbC5cbiAgICBjb25zdCBmbGFncyA9IFtdO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBjb25zdCBoaSA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgY29uc3QgbG8gPSBkYXRhW29mZnNldCsrXTtcbiAgICAgIGNvbnN0IGZsYWcgPSAoaGkgJiAzKSA8PCA4IHwgbG87XG4gICAgICBmbGFncy5wdXNoKGhpICYgdGhpcy5jbGVhciA/IH5mbGFnIDogZmxhZyk7XG4gICAgICBpZiAoaGkgJiB0aGlzLmxhc3QpIHJldHVybiBmbGFncztcbiAgICB9XG4gIH1cblxuICBieXRlcyhmbGFnczogbnVtYmVyW10pOiBudW1iZXJbXSB7XG4gICAgY29uc3QgYnl0ZXMgPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZsYWdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBsZXQgZmxhZyA9IGZsYWdzW2ldO1xuICAgICAgaWYgKGZsYWcgPCAwKSBmbGFnID0gKHRoaXMuY2xlYXIgPDwgOCkgfCB+ZmxhZztcbiAgICAgIGlmIChpID09PSBmbGFncy5sZW5ndGggLSAxKSBmbGFnIHw9ICh0aGlzLmxhc3QgPDwgOCk7XG4gICAgICBieXRlcy5wdXNoKGZsYWcgPj4+IDgpO1xuICAgICAgYnl0ZXMucHVzaChmbGFnICYgMHhmZik7XG4gICAgfVxuICAgIHJldHVybiBieXRlcztcbiAgfVxuXG4gIHdyaXRlKGRhdGE6IERhdGE8bnVtYmVyPiwgZmxhZ3M6IG51bWJlcltdLCBvZmZzZXQ6IG51bWJlciA9IDApIHtcbiAgICBjb25zdCBieXRlcyA9IHRoaXMuYnl0ZXMoZmxhZ3MpO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGRhdGFbaSArIG9mZnNldF0gPSBieXRlc1tpXTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IERJQUxPR19GTEFHUyA9IG5ldyBGbGFnTGlzdFR5cGUoMHg0MCwgMHg4MCk7XG5leHBvcnQgY29uc3QgSVRFTV9HRVRfRkxBR1MgPSBuZXcgRmxhZ0xpc3RUeXBlKDB4NDAsIDB4ODApO1xuZXhwb3J0IGNvbnN0IFNQQVdOX0NPTkRJVElPTl9GTEFHUyA9IG5ldyBGbGFnTGlzdFR5cGUoMHg4MCwgMHgyMCk7XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZXhwb3J0IGNsYXNzIERhdGFUdXBsZSB7XG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGRhdGE6IERhdGE8bnVtYmVyPikge31cbiAgW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8bnVtYmVyPiB7XG4gICAgcmV0dXJuICh0aGlzLmRhdGEgYXMgbnVtYmVyW10pW1N5bWJvbC5pdGVyYXRvcl0oKTtcbiAgfVxuICBoZXgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmRhdGEsIGhleCkuam9pbignICcpO1xuICB9XG4gIGNsb25lKCk6IHRoaXMge1xuICAgIHJldHVybiBuZXcgKHRoaXMuY29uc3RydWN0b3IgYXMgYW55KSh0aGlzLmRhdGEpO1xuICB9XG4gIHN0YXRpYyBtYWtlPFQ+KGxlbmd0aDogbnVtYmVyLCBwcm9wczogVCk6IERhdGFUdXBsZUN0b3I8VD4ge1xuICAgIC8vIE5PVEU6IFRoZXJlJ3MgYSBsb3Qgb2YgZHluYW1pc20gaGVyZSwgc28gdHlwZSBjaGVja2luZyBjYW4ndCBoYW5kbGUgaXQuXG4gICAgLy8gVE9ETzogR2l2ZSB0aGlzIGNsYXNzIGEgbmFtZSBzb21laG93P1xuICAgIGNvbnN0IGNscyA9IGNsYXNzIGV4dGVuZHMgRGF0YVR1cGxlIHtcbiAgICAgIGNvbnN0cnVjdG9yKGRhdGEgPSBuZXcgQXJyYXkobGVuZ3RoKS5maWxsKDApKSB7IHN1cGVyKGRhdGEpOyB9XG4gICAgICBzdGF0aWMgb2YoaW5pdHM6IGFueSkge1xuICAgICAgICBjb25zdCBvdXQgPSBuZXcgY2xzKCkgYXMgYW55O1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhpbml0cykpIHtcbiAgICAgICAgICBvdXRba2V5XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgICB9XG4gICAgICBzdGF0aWMgZnJvbShkYXRhOiBEYXRhPG51bWJlcj4sIG9mZnNldDogbnVtYmVyID0gMCkge1xuICAgICAgICByZXR1cm4gbmV3IGNscyh0dXBsZShkYXRhLCBvZmZzZXQsIGxlbmd0aCkgYXMgbnVtYmVyW10pO1xuICAgICAgfVxuICAgIH07XG4gICAgY29uc3QgZGVzY3JpcHRvcnM6IGFueSA9IHt9O1xuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzW2tleV0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZGVzY3JpcHRvcnNba2V5XSA9IHt2YWx1ZTogcHJvcHNba2V5XX07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkZXNjcmlwdG9yc1trZXldID0gcHJvcHNba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoY2xzLnByb3RvdHlwZSwgZGVzY3JpcHRvcnMpO1xuICAgIHJldHVybiBjbHMgYXMgYW55O1xuICB9XG4gIHN0YXRpYyBwcm9wKC4uLmJpdHM6IFtudW1iZXIsIG51bWJlcj8sIG51bWJlcj9dW10pOlxuICAgICAgKEdldFNldDxudW1iZXI+ICYgVGhpc1R5cGU8RGF0YVR1cGxlPikge1xuICAgIHJldHVybiB7XG4gICAgICBnZXQoKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgW2luZGV4LCBtYXNrID0gMHhmZiwgc2hpZnQgPSAwXSBvZiBiaXRzKSB7XG4gICAgICAgICAgY29uc3QgbHNoID0gc2hpZnQgPCAwID8gLXNoaWZ0IDogMDtcbiAgICAgICAgICBjb25zdCByc2ggPSBzaGlmdCA8IDAgPyAwIDogc2hpZnQ7XG4gICAgICAgICAgdmFsdWUgfD0gKCh0aGlzLmRhdGFbaW5kZXhdICYgbWFzaykgPj4+IHJzaCkgPDwgbHNoO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgIH0sXG4gICAgICBzZXQodmFsdWUpIHtcbiAgICAgICAgZm9yIChjb25zdCBbaW5kZXgsIG1hc2sgPSAweGZmLCBzaGlmdCA9IDBdIG9mIGJpdHMpIHtcbiAgICAgICAgICBjb25zdCBsc2ggPSBzaGlmdCA8IDAgPyAtc2hpZnQgOiAwO1xuICAgICAgICAgIGNvbnN0IHJzaCA9IHNoaWZ0IDwgMCA/IDAgOiBzaGlmdDtcbiAgICAgICAgICBjb25zdCB2ID0gKHZhbHVlID4+PiBsc2gpIDw8IHJzaCAmIG1hc2s7XG4gICAgICAgICAgdGhpcy5kYXRhW2luZGV4XSA9IHRoaXMuZGF0YVtpbmRleF0gJiB+bWFzayB8IHY7XG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgfTtcbiAgfVxuICBzdGF0aWMgYm9vbGVhblByb3AoYml0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0pOlxuICAgICAgKEdldFNldDxib29sZWFuPiAmIFRoaXNUeXBlPERhdGFUdXBsZT4pIHtcbiAgICBjb25zdCBwcm9wID0gRGF0YVR1cGxlLnByb3AoYml0KTtcbiAgICByZXR1cm4ge2dldCgpIHsgcmV0dXJuICEhcHJvcC5nZXQuY2FsbCh0aGlzKTsgfSxcbiAgICAgICAgICAgIHNldCh2YWx1ZSkgeyBwcm9wLnNldC5jYWxsKHRoaXMsICt2YWx1ZSk7IH19O1xuICB9XG4gIC8vIHN0YXRpYyBmdW5jPFQ+KGZ1bmM6ICh4OiBhbnkpID0+IFQpOiAoe3ZhbHVlOiBhbnl9ICYgVGhpc1R5cGU8RGF0YVR1cGxlPikge1xuICAvLyAgIHJldHVybiB7dmFsdWU6IGZ1bmN0aW9uKCkgeyByZXR1cm4gZnVuYyh0aGlzKTsgfX07XG4gIC8vIH1cbn1cblxuaW50ZXJmYWNlIEdldFNldDxVPiB7XG4gIGdldCgpOiBVO1xuICBzZXQoYXJnOiBVKTogdm9pZDtcbn1cblxudHlwZSBEYXRhVHVwbGVTdWI8VD4gPVxuICAgIHtbSyBpbiBrZXlvZiBUXTogVFtLXSBleHRlbmRzIEdldFNldDxpbmZlciBVPiA/IFUgOlxuICAgICAgICAgICAgICAgICAgICAgVFtLXSBleHRlbmRzIHt2YWx1ZTogKGluZmVyIFcpfSA/IFcgOlxuICAgICAgICAgICAgICAgICAgICAgVFtLXSBleHRlbmRzICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCA/IFRbS10gOiBuZXZlcn0gJiBEYXRhVHVwbGU7XG5cbi8vIE5vdGU6IGl0IHdvdWxkIGJlIG5pY2UgZm9yIHRoZSBmaW5hbCBUW0tdIGJlbG93IHRvIGJlICduZXZlcicsIGJ1dFxuLy8gdGhpcyBmYWlscyBiZWNhdXNlIGFsbCBvYmplY3RzIGhhdmUgYW4gaW1wbGljaXQgdG9TdHJpbmcsIHdoaWNoIHdvdWxkXG4vLyBvdGhlcndpc2UgbmVlZCB0byBiZSB7dG9TdHJpbmc/OiB1bmRlZmluZWR9IGZvciBzb21lIHJlYXNvbi5cbnR5cGUgRGF0YVR1cGxlSW5pdHM8VD4gPSB7XG4gIFtLIGluIGtleW9mIFRdPzogVFtLXSBleHRlbmRzIHtzZXQoYXJnOiBpbmZlciBVKTogdm9pZH0gPyBVIDogVFtLXVxufTtcblxuaW50ZXJmYWNlIERhdGFUdXBsZUN0b3I8VD4ge1xuICBuZXcoZGF0YT86IERhdGE8bnVtYmVyPik6IERhdGFUdXBsZVN1YjxUPjtcbiAgb2YoaW5pdHM6IERhdGFUdXBsZUluaXRzPFQ+KTogRGF0YVR1cGxlU3ViPFQ+O1xuICBmcm9tKGRhdGE6IERhdGE8bnVtYmVyPiwgb2Zmc2V0OiBudW1iZXIpOiBEYXRhVHVwbGVTdWI8VD47XG59XG5cblxuZXhwb3J0IGNvbnN0IHdhdGNoQXJyYXkgPSAoYXJyOiBEYXRhPHVua25vd24+LCB3YXRjaDogbnVtYmVyKSA9PiB7XG4gIGNvbnN0IGFycmF5Q2hhbmdlSGFuZGxlciA9IHtcbiAgICBnZXQodGFyZ2V0OiBhbnksIHByb3BlcnR5OiBzdHJpbmcgfCBudW1iZXIpIHtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdnZXR0aW5nICcgKyBwcm9wZXJ0eSArICcgZm9yICcgKyB0YXJnZXQpO1xuICAgICAgLy8gcHJvcGVydHkgaXMgaW5kZXggaW4gdGhpcyBjYXNlXG4gICAgICBsZXQgdiA9IHRhcmdldFtwcm9wZXJ0eV07XG4gICAgICBpZiAocHJvcGVydHkgPT09ICdzdWJhcnJheScpIHtcbiAgICAgICAgcmV0dXJuIChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnN0IHN1YiA9IHRhcmdldC5zdWJhcnJheShzdGFydCwgZW5kKTtcbiAgICAgICAgICBpZiAoc3RhcnQgPD0gd2F0Y2ggJiYgd2F0Y2ggPCBlbmQpIHJldHVybiB3YXRjaEFycmF5KHN1Yiwgd2F0Y2ggLSBzdGFydCk7XG4gICAgICAgICAgcmV0dXJuIHN1YjtcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSBpZiAocHJvcGVydHkgPT09ICdzZXQnKSB7XG4gICAgICAgIHJldHVybiAodmFsOiBEYXRhPHVua25vd24+KSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFNldHRpbmcgb3ZlcmxhcHBpbmcgYXJyYXkgJHt3YXRjaH1gKTtcbiAgICAgICAgICAvLyB0aHJvdyBuZXcgRXJyb3IoJycpO1xuICAgICAgICAgIGRlYnVnZ2VyO1xuICAgICAgICAgIHRhcmdldC5zZXQodmFsKTtcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdiA9PT0gJ2Z1bmN0aW9uJykgdiA9IHYuYmluZCh0YXJnZXQpO1xuICAgICAgcmV0dXJuIHY7XG4gICAgfSxcbiAgICBzZXQodGFyZ2V0OiBhbnksIHByb3BlcnR5OiBzdHJpbmcgfCBudW1iZXIsIHZhbHVlOiBhbnksIHJlY2VpdmVyOiBhbnkpIHtcbiAgICAgIC8vIGNvbnNvbGUubG9nKCdzZXR0aW5nICcgKyBwcm9wZXJ0eSArICcgZm9yICcvKiArIHRhcmdldCovICsgJyB3aXRoIHZhbHVlICcgKyB2YWx1ZSk7XG4gICAgICAvLyB0c2xpbnQ6ZGlzYWJsZS1uZXh0LWxpbmU6dHJpcGxlLWVxdWFsc1xuICAgICAgaWYgKHByb3BlcnR5ID09IHdhdGNoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBXcml0aW5nICR7d2F0Y2gudG9TdHJpbmcoMTYpfWApO1xuICAgICAgICAvLyB0aHJvdyBuZXcgRXJyb3IoJycpO1xuICAgICAgICBkZWJ1Z2dlcjtcbiAgICAgIH1cbiAgICAgIHRhcmdldFtwcm9wZXJ0eV0gPSB2YWx1ZTtcbiAgICAgIC8vIHlvdSBoYXZlIHRvIHJldHVybiB0cnVlIHRvIGFjY2VwdCB0aGUgY2hhbmdlc1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcbiAgfTtcbiAgcmV0dXJuIG5ldyBQcm94eShhcnIsIGFycmF5Q2hhbmdlSGFuZGxlcik7XG59O1xuIl19