class AnimationController {
    constructor(renderer, layout) {
        this.renderer = renderer;
        this.layout = layout;
        this.events = [];
        this.eventIndex = 0;
        this.simTime = 0;
        this.speed = 5.0;
        this.running = false;
        this.packages = new Map();
        this.activePackages = [];
        this.lastTimestamp = null;
        this.conveyorMap = {};
        this.onTimeUpdate = null;

        for (const conv of layout.conveyors) {
            this.conveyorMap[conv.id] = conv;
        }
    }

    loadEvents(events) {
        this.events = events;
        this.eventIndex = 0;
        this.simTime = 0;
        this.packages.clear();
        this.activePackages = [];
        this.lastTimestamp = null;
    }

    play() {
        this.running = true;
        this.lastTimestamp = null;
        this._tick = this._tick.bind(this);
        requestAnimationFrame(this._tick);
    }

    pause() {
        this.running = false;
    }

    reset() {
        this.running = false;
        this.eventIndex = 0;
        this.simTime = 0;
        this.packages.clear();
        this.activePackages = [];
    }

    _tick(timestamp) {
        if (!this.running) return;

        if (this.lastTimestamp === null) {
            this.lastTimestamp = timestamp;
        }

        const deltaMs = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        this.simTime += (deltaMs / 1000) * this.speed;

        while (this.eventIndex < this.events.length &&
               this.events[this.eventIndex].time <= this.simTime) {
            this._processEvent(this.events[this.eventIndex]);
            this.eventIndex++;
        }

        this._interpolatePositions();

        if (this.onTimeUpdate) {
            this.onTimeUpdate(this.simTime);
        }

        this.renderer.render({
            layout: this.layout,
            packages: this.activePackages,
            selected: null,
        });

        if (this.eventIndex >= this.events.length && this.activePackages.length === 0) {
            this.running = false;
            return;
        }

        requestAnimationFrame(this._tick);
    }

    _processEvent(event) {
        const { event_type, package_id, node_id, destination } = event;

        switch (event_type) {
            case 'arrive':
                this.packages.set(package_id, {
                    id: package_id,
                    destination: destination,
                    x: 0, y: 0,
                    state: 'arriving',
                    node: node_id,
                    startTime: event.time,
                    startPos: null,
                    endPos: null,
                    travelTime: 0,
                });
                break;

            case 'enter_conveyor': {
                const pkg = this.packages.get(package_id);
                if (!pkg) break;
                const conv = this.conveyorMap[node_id];
                if (!conv || conv.waypoints.length < 2) break;
                pkg.state = 'conveyor';
                pkg.node = node_id;
                pkg.startTime = event.time;
                pkg.waypoints = conv.waypoints;
                pkg.waypointIndex = 0;
                pkg.travelTime = conv.length / conv.speed;
                pkg.startPos = conv.waypoints[0];
                pkg.endPos = conv.waypoints[conv.waypoints.length - 1];
                break;
            }

            case 'enter_queue':
            case 'process': {
                const pkg = this.packages.get(package_id);
                if (!pkg) break;
                const gate = this.layout.gates.find(g => g.id === node_id);
                if (gate) {
                    pkg.state = 'at_gate';
                    pkg.x = gate.position.x + (Math.random() - 0.5) * 20;
                    pkg.y = gate.position.y + 20;
                }
                break;
            }

            case 'sorted':
                this.packages.delete(package_id);
                break;

            case 'overflow': {
                const pkg = this.packages.get(package_id);
                if (pkg) pkg.state = 'blocked';
                break;
            }
        }
    }

    _interpolatePositions() {
        this.activePackages = [];
        for (const [id, pkg] of this.packages) {
            if (pkg.state === 'conveyor' && pkg.waypoints && pkg.travelTime > 0) {
                const elapsed = this.simTime - pkg.startTime;
                const t = Math.min(elapsed / pkg.travelTime, 1.0);
                const totalDist = this._pathLength(pkg.waypoints);
                const targetDist = t * totalDist;
                const pos = this._pointAlongPath(pkg.waypoints, targetDist);
                pkg.x = pos.x;
                pkg.y = pos.y;
            }
            this.activePackages.push({
                x: pkg.x,
                y: pkg.y,
                destination: pkg.destination,
            });
        }
    }

    _pathLength(waypoints) {
        let len = 0;
        for (let i = 1; i < waypoints.length; i++) {
            const dx = waypoints[i].x - waypoints[i - 1].x;
            const dy = waypoints[i].y - waypoints[i - 1].y;
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    }

    _pointAlongPath(waypoints, dist) {
        let remaining = dist;
        for (let i = 1; i < waypoints.length; i++) {
            const dx = waypoints[i].x - waypoints[i - 1].x;
            const dy = waypoints[i].y - waypoints[i - 1].y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            if (remaining <= segLen) {
                const t = segLen > 0 ? remaining / segLen : 0;
                return {
                    x: waypoints[i - 1].x + dx * t,
                    y: waypoints[i - 1].y + dy * t,
                };
            }
            remaining -= segLen;
        }
        return waypoints[waypoints.length - 1];
    }
}
