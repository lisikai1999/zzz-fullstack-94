class Editor {
    constructor(canvas, renderer, getLayout, setLayout) {
        this.canvas = canvas;
        this.renderer = renderer;
        this.getLayout = getLayout;
        this.setLayout = setLayout;
        this.tool = 'select';
        this.dragging = null;
        this.dragType = null; // 'gate' | 'waypoint'
        this.dragData = null; // extra info for waypoint drag
        this.selected = null;
        this.conveyorStart = null;
        this.onSelectionChange = null;
        this._nextGateId = 100;

        this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
        document.addEventListener('keydown', this._onKeyDown.bind(this));
    }

    setTool(tool) {
        this.tool = tool;
        this.conveyorStart = null;
        this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    }

    _onMouseDown(e) {
        if (e.button !== 0 || e.altKey) return;
        const pos = this.renderer.screenToWorld(e);
        const layout = this.getLayout();

        if (this.tool === 'select') {
            // First try to hit a waypoint handle
            const wpHit = this._hitTestWaypoint(pos, layout.conveyors);
            if (wpHit) {
                this.dragging = wpHit;
                this.dragType = 'waypoint';
                this.canvas.style.cursor = 'grabbing';
                return;
            }

            // Then try gates
            const gateHit = this._hitTestGate(pos, layout.gates);
            if (gateHit) {
                this.dragging = gateHit;
                this.dragType = 'gate';
                this.selected = gateHit;
                if (this.onSelectionChange) this.onSelectionChange(gateHit);
            } else {
                this.selected = null;
                if (this.onSelectionChange) this.onSelectionChange(null);
            }
        } else if (this.tool === 'add-gate') {
            this._addGate(pos);
        } else if (this.tool === 'add-conveyor') {
            this._handleConveyorClick(pos, layout);
        } else if (this.tool === 'delete') {
            this._handleDelete(pos, layout);
        }
    }

    _onMouseMove(e) {
        if (!this.dragging) {
            // Show grab cursor on waypoint hover in select mode
            if (this.tool === 'select') {
                const pos = this.renderer.screenToWorld(e);
                const layout = this.getLayout();
                const wpHit = this._hitTestWaypoint(pos, layout.conveyors);
                this.canvas.style.cursor = wpHit ? 'grab' : 'default';
            }
            return;
        }

        const pos = this.renderer.screenToWorld(e);

        if (this.dragType === 'gate') {
            this.dragging.position.x = pos.x;
            this.dragging.position.y = pos.y;
            this._updateConveyorEndpoints(this.dragging);
        } else if (this.dragType === 'waypoint') {
            const { conveyorId, waypointIndex } = this.dragging;
            const layout = this.getLayout();
            const conv = layout.conveyors.find(c => c.id === conveyorId);
            if (conv) {
                conv.waypoints[waypointIndex] = { x: pos.x, y: pos.y };
                // Update length based on new waypoint positions
                conv.length = this._computeConveyorLength(conv.waypoints);
            }
        }

        this._renderLayout();
    }

    _onMouseUp() {
        if (this.dragType === 'waypoint') {
            this.canvas.style.cursor = 'default';
        }
        this.dragging = null;
        this.dragType = null;
    }

    _onKeyDown(e) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
            if (e.target.tagName === 'INPUT') return;
            this._removeGate(this.selected.id);
            this.selected = null;
            if (this.onSelectionChange) this.onSelectionChange(null);
        }
    }

    _hitTestGate(pos, gates) {
        for (const gate of gates) {
            const dx = pos.x - gate.position.x;
            const dy = pos.y - gate.position.y;
            if (Math.abs(dx) < 30 && Math.abs(dy) < 20) {
                return gate;
            }
        }
        return null;
    }

    _hitTestWaypoint(pos, conveyors) {
        const hitRadius = 10;
        for (const conv of conveyors) {
            for (let i = 0; i < conv.waypoints.length; i++) {
                const wp = conv.waypoints[i];
                const dx = pos.x - wp.x;
                const dy = pos.y - wp.y;
                if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
                    return { conveyorId: conv.id, waypointIndex: i };
                }
            }
        }
        return null;
    }

    _computeConveyorLength(waypoints) {
        let len = 0;
        for (let i = 1; i < waypoints.length; i++) {
            const dx = waypoints[i].x - waypoints[i - 1].x;
            const dy = waypoints[i].y - waypoints[i - 1].y;
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len / 30; // scale to simulation units
    }

    _addGate(pos) {
        const layout = this.getLayout();
        const id = `gate-${this._nextGateId++}`;
        const newGate = {
            id: id,
            label: id,
            position: { x: pos.x, y: pos.y },
            destinations: [layout.exit_bins[0]],
            processing_rate: 3.0,
            queue_capacity: 15,
        };
        layout.gates.push(newGate);
        this.setLayout(layout);
        this._renderLayout();
    }

    _removeGate(gateId) {
        const layout = this.getLayout();
        layout.gates = layout.gates.filter(g => g.id !== gateId);
        layout.conveyors = layout.conveyors.filter(
            c => c.from_node !== gateId && c.to_node !== gateId
        );
        this.setLayout(layout);
        this._renderLayout();
    }

    _handleConveyorClick(pos, layout) {
        const allNodes = [
            ...layout.gates.map(g => ({ id: g.id, pos: g.position })),
        ];
        for (const conv of layout.conveyors) {
            if (layout.entrances.includes(conv.from_node) && conv.waypoints.length > 0) {
                allNodes.push({ id: conv.from_node, pos: conv.waypoints[0] });
            }
            if (layout.exit_bins.includes(conv.to_node) && conv.waypoints.length > 0) {
                allNodes.push({ id: conv.to_node, pos: conv.waypoints[conv.waypoints.length - 1] });
            }
        }

        const hit = allNodes.find(n => {
            const dx = pos.x - n.pos.x;
            const dy = pos.y - n.pos.y;
            return Math.sqrt(dx * dx + dy * dy) < 30;
        });

        if (!hit) {
            // Double-click on empty space adds a waypoint to selected conveyor's path
            // For now, clicking on no-node creates a new intermediate waypoint if conveyorStart is set
            if (this.conveyorStart && this.conveyorStart._waypoints) {
                this.conveyorStart._waypoints.push({ x: pos.x, y: pos.y });
            }
            return;
        }

        if (!this.conveyorStart) {
            this.conveyorStart = hit;
            this.conveyorStart._waypoints = [{ x: hit.pos.x, y: hit.pos.y }];
        } else {
            const from = this.conveyorStart;
            const to = hit;
            const waypoints = [...from._waypoints, { x: to.pos.x, y: to.pos.y }];
            const length = this._computeConveyorLength(waypoints);

            const newConv = {
                id: `conv-${Date.now()}`,
                from_node: from.id,
                to_node: to.id,
                speed: 2.0,
                length: Math.max(length, 1),
                waypoints: waypoints,
            };
            layout.conveyors.push(newConv);
            this.setLayout(layout);
            this.conveyorStart = null;
            this._renderLayout();
        }
    }

    _handleDelete(pos, layout) {
        // Try gates first
        const gateHit = this._hitTestGate(pos, layout.gates);
        if (gateHit) {
            this._removeGate(gateHit.id);
            return;
        }
        // Try conveyor waypoints — delete the conveyor
        const wpHit = this._hitTestWaypoint(pos, layout.conveyors);
        if (wpHit) {
            layout.conveyors = layout.conveyors.filter(c => c.id !== wpHit.conveyorId);
            this.setLayout(layout);
            this._renderLayout();
        }
    }

    _updateConveyorEndpoints(gate) {
        const layout = this.getLayout();
        for (const conv of layout.conveyors) {
            if (conv.from_node === gate.id && conv.waypoints.length > 0) {
                conv.waypoints[0] = { x: gate.position.x, y: gate.position.y };
            }
            if (conv.to_node === gate.id && conv.waypoints.length > 0) {
                conv.waypoints[conv.waypoints.length - 1] = { x: gate.position.x, y: gate.position.y };
            }
        }
    }

    _renderLayout() {
        this.renderer.render({
            layout: this.getLayout(),
            packages: [],
            selected: this.selected,
        });
    }
}
