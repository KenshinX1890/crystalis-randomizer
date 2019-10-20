import { MutableRequirement } from './condition.js';
import { DefaultMap } from '../util.js';
export class Routes {
    constructor() {
        this.routes = new DefaultMap(() => new MutableRequirement());
        this.edges = new DefaultMap(() => new Map());
    }
    addEdge(target, source, route) {
        const edge = LabeledRoute(target, route);
        this.edges.get(source).set(edge.label, edge);
        for (const srcRoute of this.routes.get(source)) {
            this.addRoute(target, [...srcRoute, ...route]);
        }
    }
    addRoute(target, route) {
        const queue = new Map();
        const seen = new Set();
        const start = LabeledRoute(target, route);
        queue.set(start.label, start);
        const iter = queue.values();
        while (true) {
            const { value, done } = iter.next();
            if (done)
                return;
            seen.add(value.label);
            queue.delete(value.label);
            for (const next of this.addRouteInternal(value)) {
                if (seen.has(next.label))
                    continue;
                queue.delete(next.label);
                queue.set(next.label, next);
            }
        }
    }
    addRouteInternal({ target, depsLabel, deps }) {
        const current = this.routes.get(target);
        if (!current.add(depsLabel, deps))
            return [];
        const out = new Map();
        for (const next of this.edges.get(target).values()) {
            const follow = LabeledRoute(next.target, [...deps, ...next.deps]);
            out.set(follow.label, follow);
        }
        return out.values();
    }
}
export function LabeledRoute(target, route) {
    const sorted = [...new Set(route)].sort();
    const deps = new Set(sorted);
    const depsLabel = sorted.join(' ');
    const label = `${target}:${depsLabel}`;
    return { target, deps, label, depsLabel };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2pzL2dyYXBoL3JvdXRlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLEVBQVksa0JBQWtCLEVBQUMsTUFBTSxnQkFBZ0IsQ0FBQztBQUM3RCxPQUFPLEVBQUMsVUFBVSxFQUFDLE1BQU0sWUFBWSxDQUFDO0FBSXRDLE1BQU0sT0FBTyxNQUFNO0lBQW5CO1FBR1csV0FBTSxHQUFHLElBQUksVUFBVSxDQUE2QixHQUFHLEVBQUUsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUNwRixVQUFLLEdBQUcsSUFBSSxVQUFVLENBQW9DLEdBQUcsRUFBRSxDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsQ0FBQztJQW9FdEYsQ0FBQztJQTdDQyxPQUFPLENBQUMsTUFBYyxFQUFFLE1BQWMsRUFBRSxLQUEyQjtRQUNqRSxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRzdDLEtBQUssTUFBTSxRQUFRLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDOUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLFFBQVEsRUFBRSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7U0FJaEQ7SUFFSCxDQUFDO0lBR0QsUUFBUSxDQUFDLE1BQWMsRUFBRSxLQUEyQjtRQUNsRCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztRQUM5QyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQy9CLE1BQU0sS0FBSyxHQUFHLFlBQVksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlCLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUM1QixPQUFPLElBQUksRUFBRTtZQUNYLE1BQU0sRUFBQyxLQUFLLEVBQUUsSUFBSSxFQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xDLElBQUksSUFBSTtnQkFBRSxPQUFPO1lBQ2pCLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RCLEtBQUssQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFCLEtBQUssTUFBTSxJQUFJLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFO2dCQUMvQyxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztvQkFBRSxTQUFTO2dCQUNuQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDekIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQzdCO1NBQ0Y7SUFDSCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsRUFBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBZTtRQUM5RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4QyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDO1lBQUUsT0FBTyxFQUFFLENBQUM7UUFFN0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7UUFDNUMsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUNsRCxNQUFNLE1BQU0sR0FBRyxZQUFZLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDbEUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1NBQy9CO1FBQ0QsT0FBTyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNGO0FBSUQsTUFBTSxVQUFVLFlBQVksQ0FBQyxNQUFjLEVBQUUsS0FBMkI7SUFDdEUsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDN0IsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNuQyxNQUFNLEtBQUssR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUN2QyxPQUFPLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFDLENBQUM7QUFDMUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7VGlsZUlkfSBmcm9tICcuL2dlb21ldHJ5LmpzJztcbmltcG9ydCB7Q29uZGl0aW9uLCBNdXRhYmxlUmVxdWlyZW1lbnR9IGZyb20gJy4vY29uZGl0aW9uLmpzJztcbmltcG9ydCB7RGVmYXVsdE1hcH0gZnJvbSAnLi4vdXRpbC5qcyc7XG5cbi8vIFRyYWNrcyByb3V0ZXMgdGhyb3VnaCBhIGdyYXBoLlxuXG5leHBvcnQgY2xhc3MgUm91dGVzIHtcblxuICAvLyByZWFkb25seSB0cmlnZ2VycyA9IG5ldyBEZWZhdWx0TWFwPENvbmRpdGlvbiwgTWFwPHN0cmluZywgU2V0PENvbmRpdGlvbj4+PigoKSA9PiBuZXcgTWFwKCkpO1xuICByZWFkb25seSByb3V0ZXMgPSBuZXcgRGVmYXVsdE1hcDxUaWxlSWQsIE11dGFibGVSZXF1aXJlbWVudD4oKCkgPT4gbmV3IE11dGFibGVSZXF1aXJlbWVudCgpKTtcbiAgcmVhZG9ubHkgZWRnZXMgPSBuZXcgRGVmYXVsdE1hcDxUaWxlSWQsIE1hcDxzdHJpbmcsIExhYmVsZWRSb3V0ZT4+KCgpID0+IG5ldyBNYXAoKSk7XG5cbiAgLy8gQmVmb3JlIGFkZGluZyBhIHJvdXRlLCBhbnkgdGFyZ2V0IGlzIHVucmVhY2hhYmxlXG4gIC8vIFRvIG1ha2UgYSB0YXJnZXQgYWx3YXlzIHJlYWNoYWJsZSwgYWRkIGFuIGVtcHR5IHJvdXRlXG5cbiAgLy8gTXVzdCBiZSBjYWxsZWQgQUZURVIgYWxsIGVkZ2VzIGFuZCByb3V0ZXMgYXJlIGFkZGVkLlxuICAvLyByb3V0ZShnYWluOiBDb25kaXRpb24sXG4gIC8vICAgICAgIHNvdXJjZTogVGlsZUlkLFxuICAvLyAgICAgICByb3V0ZTogcmVhZG9ubHkgQ29uZGl0aW9uW10pOiBNYXA8c3RyaW5nLCBMYWJlbGVkUmVxdWlyZW1lbnRzPiB7XG4gIC8vICAgY29uc3Qgc29ydGVkID0gWy4uLnJvdXRlXS5zb3J0KCk7XG4gIC8vICAgY29uc3QgZGVwcyA9IG5ldyBTZXQoc29ydGVkKTtcbiAgLy8gICBjb25zdCBlZGdlID0gW3RhcmdldCwgZGVwc10gYXMgY29uc3Q7XG4gIC8vICAgdGhpcy5lZGdlcy5nZXQoc291cmNlKS5zZXQoU3RyaW5nKGVkZ2UpLCBlZGdlKTtcbiAgLy8gICAvLyBpZiAoc291cmNlID09PSB0YXJnZXQpIHJldHVybiBbXTtcbiAgLy8gICAvL2NvbnN0IHJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBMYWJlbGVkUm91dGU+KCk7XG4gIC8vICAgZm9yIChjb25zdCBzcmNSb3V0ZSBvZiB0aGlzLnJvdXRlcy5nZXQoc291cmNlKS52YWx1ZXMoKSkge1xuICAvLyAgICAgdGhpcy5hZGRSb3V0ZSh0YXJnZXQsIFsuLi5zcmNSb3V0ZSwgLi4ucm91dGVdKTtcbiAgLy8gICB9XG4gIC8vIH1cblxuICAvLyBUT0RPIC0gbWFrZSBhIGNsYXNzIGZvciBNYXA8c3RyaW5nLCBTZXQ8Q29uZGl0aW9uPj4gPz8/XG4gIC8vICAgICAgLSBmaWd1cmUgb3V0IEFQSSBmb3IgYWRkICAtLT4gIHJldHVybiBlaXRoZXIgYWRkZWQgcmVxIG9yIG51bGwgP1xuXG4gIGFkZEVkZ2UodGFyZ2V0OiBUaWxlSWQsIHNvdXJjZTogVGlsZUlkLCByb3V0ZTogcmVhZG9ubHkgQ29uZGl0aW9uW10pOiB2b2lkIHtcbiAgICBjb25zdCBlZGdlID0gTGFiZWxlZFJvdXRlKHRhcmdldCwgcm91dGUpO1xuICAgIHRoaXMuZWRnZXMuZ2V0KHNvdXJjZSkuc2V0KGVkZ2UubGFiZWwsIGVkZ2UpO1xuICAgIC8vIGlmIChzb3VyY2UgPT09IHRhcmdldCkgcmV0dXJuIFtdO1xuICAgIC8vY29uc3Qgcm91dGVzID0gbmV3IE1hcDxzdHJpbmcsIExhYmVsZWRSb3V0ZT4oKTtcbiAgICBmb3IgKGNvbnN0IHNyY1JvdXRlIG9mIHRoaXMucm91dGVzLmdldChzb3VyY2UpKSB7XG4gICAgICB0aGlzLmFkZFJvdXRlKHRhcmdldCwgWy4uLnNyY1JvdXRlLCAuLi5yb3V0ZV0pO1xuICAgICAgLy8gZm9yIChjb25zdCByIG9mIHRoaXMuYWRkUm91dGUodGFyZ2V0LCBbLi4uc3JjUm91dGUsIC4uLnJvdXRlXSkpIHtcbiAgICAgIC8vICAgcm91dGVzLnNldChyLmxhYmVsLCByKTtcbiAgICAgIC8vIH1cbiAgICB9XG4gICAgLy9yZXR1cm4gWy4uLnJvdXRlcy52YWx1ZXMoKV07XG4gIH1cblxuICAvLyBOb3RlOiBDb25kaXRpb24gYXJyYXkgbm90IHNvcnRlZCBvciBldmVuIGRlZHVwZWQuXG4gIGFkZFJvdXRlKHRhcmdldDogVGlsZUlkLCByb3V0ZTogcmVhZG9ubHkgQ29uZGl0aW9uW10pOiB2b2lkIHtcbiAgICBjb25zdCBxdWV1ZSA9IG5ldyBNYXA8c3RyaW5nLCBMYWJlbGVkUm91dGU+KCk7XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IHN0YXJ0ID0gTGFiZWxlZFJvdXRlKHRhcmdldCwgcm91dGUpO1xuICAgIHF1ZXVlLnNldChzdGFydC5sYWJlbCwgc3RhcnQpO1xuICAgIGNvbnN0IGl0ZXIgPSBxdWV1ZS52YWx1ZXMoKTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3Qge3ZhbHVlLCBkb25lfSA9IGl0ZXIubmV4dCgpO1xuICAgICAgaWYgKGRvbmUpIHJldHVybjtcbiAgICAgIHNlZW4uYWRkKHZhbHVlLmxhYmVsKTtcbiAgICAgIHF1ZXVlLmRlbGV0ZSh2YWx1ZS5sYWJlbCk7IC8vIHVubmVjZXNzYXJ5XG4gICAgICBmb3IgKGNvbnN0IG5leHQgb2YgdGhpcy5hZGRSb3V0ZUludGVybmFsKHZhbHVlKSkge1xuICAgICAgICBpZiAoc2Vlbi5oYXMobmV4dC5sYWJlbCkpIGNvbnRpbnVlO1xuICAgICAgICBxdWV1ZS5kZWxldGUobmV4dC5sYWJlbCk7IC8vIGRvZXMgdGhpcyBhY3R1YWxseSBoZWxwP1xuICAgICAgICBxdWV1ZS5zZXQobmV4dC5sYWJlbCwgbmV4dCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhZGRSb3V0ZUludGVybmFsKHt0YXJnZXQsIGRlcHNMYWJlbCwgZGVwc306IExhYmVsZWRSb3V0ZSk6IEl0ZXJhYmxlPExhYmVsZWRSb3V0ZT4ge1xuICAgIGNvbnN0IGN1cnJlbnQgPSB0aGlzLnJvdXRlcy5nZXQodGFyZ2V0KTtcbiAgICBpZiAoIWN1cnJlbnQuYWRkKGRlcHNMYWJlbCwgZGVwcykpIHJldHVybiBbXTtcbiAgICAvLyBXZSBhZGRlZCBhIG5ldyByb3V0ZS4gIENvbXB1dGUgYWxsIHRoZSBuZXcgbmVpZ2hib3Igcm91dGVzLlxuICAgIGNvbnN0IG91dCA9IG5ldyBNYXA8c3RyaW5nLCBMYWJlbGVkUm91dGU+KCk7XG4gICAgZm9yIChjb25zdCBuZXh0IG9mIHRoaXMuZWRnZXMuZ2V0KHRhcmdldCkudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGZvbGxvdyA9IExhYmVsZWRSb3V0ZShuZXh0LnRhcmdldCwgWy4uLmRlcHMsIC4uLm5leHQuZGVwc10pO1xuICAgICAgb3V0LnNldChmb2xsb3cubGFiZWwsIGZvbGxvdyk7XG4gICAgfVxuICAgIHJldHVybiBvdXQudmFsdWVzKCk7XG4gIH1cbn1cblxuLy8gZXhwb3J0IHR5cGUgUm91dGUgPSByZWFkb25seSBbVGlsZUlkLCAuLi5Db25kaXRpb25bXV07XG5cbmV4cG9ydCBmdW5jdGlvbiBMYWJlbGVkUm91dGUodGFyZ2V0OiBUaWxlSWQsIHJvdXRlOiByZWFkb25seSBDb25kaXRpb25bXSk6IExhYmVsZWRSb3V0ZSB7XG4gIGNvbnN0IHNvcnRlZCA9IFsuLi5uZXcgU2V0KHJvdXRlKV0uc29ydCgpO1xuICBjb25zdCBkZXBzID0gbmV3IFNldChzb3J0ZWQpO1xuICBjb25zdCBkZXBzTGFiZWwgPSBzb3J0ZWQuam9pbignICcpO1xuICBjb25zdCBsYWJlbCA9IGAke3RhcmdldH06JHtkZXBzTGFiZWx9YDtcbiAgcmV0dXJuIHt0YXJnZXQsIGRlcHMsIGxhYmVsLCBkZXBzTGFiZWx9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExhYmVsZWRSb3V0ZSB7XG4gIHJlYWRvbmx5IHRhcmdldDogVGlsZUlkO1xuICByZWFkb25seSBkZXBzOiBTZXQ8Q29uZGl0aW9uPjtcbiAgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcbiAgcmVhZG9ubHkgZGVwc0xhYmVsOiBzdHJpbmc7XG59XG5cbi8vIGV4cG9ydCBpbnRlcmZhY2UgTGFiZWxlZFJlcXVpcmVtZW50cyB7XG4vLyAgIHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG4vLyAgIHJlYWRvbmx5IGRlcHM6IFNldDxDb25kaXRpb24+O1xuLy8gfVxuXG4vLyBleHBvcnQgaW50ZXJmYWNlIExhYmVsZWRFZGdlIHtcbi8vICAgcmVhZG9ubHkgdGFyZ2V0OiBUaWxlSWQ7XG4vLyAgIHJlYWRvbmx5IHNvdXJjZTogVGlsZUlkO1xuLy8gICByZWFkb25seSBkZXBzOiBTZXQ8Q29uZGl0aW9uPjtcbi8vICAgcmVhZG9ubHkgbGFiZWw6IHN0cmluZztcbi8vIH1cbiJdfQ==