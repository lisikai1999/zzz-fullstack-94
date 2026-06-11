class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.camera = { x: 0, y: 0, zoom: 1.0 };
        this.heatmapData = {};
        this.resize();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height - 40;
    }

    clear() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = '#0d1b2a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    applyCamera() {
        this.ctx.setTransform(
            this.camera.zoom, 0, 0, this.camera.zoom,
            this.camera.x, this.camera.y
        );
    }

    render(state) {
        this.clear();
        this.applyCamera();
        this.drawGrid();
        this.drawConveyors(state.layout.conveyors);
        this.drawWaypointHandles(state.layout.conveyors);
        this.drawEntrances(state.layout.entrances, state.layout.conveyors);
        this.drawExitBins(state.layout.exit_bins, state.layout.conveyors);
        this.drawGates(state.layout.gates);
        if (state.packages) {
            this.drawPackages(state.packages);
        }
        if (state.selected) {
            this.drawSelection(state.selected);
        }
    }

    drawGrid() {
        this.ctx.strokeStyle = '#1a2a3a';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x < 1000; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, 900);
            this.ctx.stroke();
        }
        for (let y = 0; y < 900; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(1000, y);
            this.ctx.stroke();
        }
    }

    drawConveyors(conveyors) {
        for (const conv of conveyors) {
            const utilization = this.heatmapData[conv.id] || 0;
            this.ctx.strokeStyle = this.getHeatColor(utilization);
            this.ctx.lineWidth = 8;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            const wps = conv.waypoints;
            if (wps.length < 2) continue;

            this.ctx.beginPath();
            this.ctx.moveTo(wps[0].x, wps[0].y);
            for (let i = 1; i < wps.length; i++) {
                this.ctx.lineTo(wps[i].x, wps[i].y);
            }
            this.ctx.stroke();

            // Direction arrow
            const last = wps[wps.length - 1];
            const prev = wps[wps.length - 2];
            const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
            this.drawArrow(last.x - Math.cos(angle) * 20, last.y - Math.sin(angle) * 20, angle, this.getHeatColor(utilization));
        }
    }

    drawArrow(x, y, angle, color) {
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(8, 0);
        this.ctx.lineTo(-4, -5);
        this.ctx.lineTo(-4, 5);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    drawWaypointHandles(conveyors) {
        for (const conv of conveyors) {
            for (const wp of conv.waypoints) {
                this.ctx.fillStyle = 'rgba(83, 168, 255, 0.4)';
                this.ctx.strokeStyle = '#53a8ff';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(wp.x, wp.y, 6, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
            }
        }
    }

    drawGates(gates) {
        for (const gate of gates) {
            const utilization = this.heatmapData[gate.id] || 0;
            const color = this.getHeatColor(utilization);
            const isBottleneck = utilization > 0.9;

            // Gate body
            this.ctx.fillStyle = color + '33';
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = isBottleneck ? 3 : 2;

            const w = 60, h = 40;
            const x = gate.position.x - w / 2;
            const y = gate.position.y - h / 2;

            this.ctx.beginPath();
            this.ctx.roundRect(x, y, w, h, 6);
            this.ctx.fill();
            this.ctx.stroke();

            // Pulsing effect for bottleneck
            if (isBottleneck) {
                this.ctx.strokeStyle = '#ff4444';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([4, 4]);
                this.ctx.beginPath();
                this.ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 8);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }

            // Label
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '11px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(gate.label, gate.position.x, gate.position.y - 5);

            // Utilization text
            this.ctx.fillStyle = color;
            this.ctx.font = '10px monospace';
            this.ctx.fillText(`${(utilization * 100).toFixed(0)}%`, gate.position.x, gate.position.y + 10);
        }
    }

    drawEntrances(entrances, conveyors) {
        const positions = {};
        for (const conv of conveyors) {
            if (entrances.includes(conv.from_node) && conv.waypoints.length > 0) {
                positions[conv.from_node] = conv.waypoints[0];
            }
        }
        for (const [id, pos] of Object.entries(positions)) {
            this.ctx.fillStyle = '#4caf50';
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '9px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('入口', pos.x, pos.y + 3);
        }
    }

    drawExitBins(exitBins, conveyors) {
        const positions = {};
        for (const conv of conveyors) {
            if (exitBins.includes(conv.to_node) && conv.waypoints.length > 0) {
                positions[conv.to_node] = conv.waypoints[conv.waypoints.length - 1];
            }
        }
        for (const [id, pos] of Object.entries(positions)) {
            this.ctx.fillStyle = '#ff9800';
            this.ctx.beginPath();
            this.ctx.rect(pos.x - 12, pos.y - 12, 24, 24);
            this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '8px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(id.replace('bin-', ''), pos.x, pos.y + 3);
        }
    }

    drawPackages(packages) {
        const destColors = {
            'bin-east': '#ff6b6b',
            'bin-west': '#4ecdc4',
            'bin-south': '#ffe66d',
            'bin-north': '#a29bfe',
        };
        for (const pkg of packages) {
            const color = destColors[pkg.destination] || '#fff';
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(pkg.x, pkg.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawSelection(item) {
        const pos = item.position || (item.waypoints && item.waypoints[0]);
        if (!pos) return;
        this.ctx.strokeStyle = '#53a8ff';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 3]);
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 35, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    getHeatColor(utilization) {
        if (utilization <= 0) return '#3498db';
        if (utilization < 0.5) {
            const t = utilization / 0.5;
            return this.lerpColor('#3498db', '#f1c40f', t);
        }
        if (utilization < 0.9) {
            const t = (utilization - 0.5) / 0.4;
            return this.lerpColor('#f1c40f', '#e67e22', t);
        }
        const t = Math.min((utilization - 0.9) / 0.1, 1);
        return this.lerpColor('#e67e22', '#e74c3c', t);
    }

    lerpColor(a, b, t) {
        const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
        const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
        const r = Math.round(ar + (br - ar) * t);
        const g = Math.round(ag + (bg - ag) * t);
        const bl = Math.round(ab + (bb - ab) * t);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
    }

    screenToWorld(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.camera.x) / this.camera.zoom,
            y: (e.clientY - rect.top - this.camera.y) / this.camera.zoom,
        };
    }
}
