class Panel {
    constructor() {
        this.systemStatsEl = document.getElementById('system-stats');
        this.gateStatsEl = document.getElementById('gate-stats');
        this.bottleneckEl = document.getElementById('bottleneck-info');
        this.propsPanel = document.getElementById('properties-panel');
        this.propsContent = document.getElementById('props-content');
        this.comparePanel = document.getElementById('compare-panel');
        this.backdrop = null;

        document.getElementById('compare-close').addEventListener('click', () => this.hideCompare());
    }

    updateSystemStats(stats) {
        this.systemStatsEl.innerHTML = this._renderSystemStats(stats);
    }

    _renderSystemStats(stats) {
        return `
            <div class="stat-row"><span class="label">总到达</span><span class="value">${stats.total_packages_arrived}</span></div>
            <div class="stat-row"><span class="label">已分拣</span><span class="value">${stats.total_packages_sorted}</span></div>
            <div class="stat-row"><span class="label">吞吐量</span><span class="value">${stats.throughput.toFixed(2)} 件/秒</span></div>
            <div class="stat-row"><span class="label">平均时长</span><span class="value">${stats.avg_processing_time.toFixed(2)}s</span></div>
            <div class="stat-row"><span class="label">最大时长</span><span class="value">${stats.max_processing_time.toFixed(2)}s</span></div>
            <div class="stat-row"><span class="label">溢出丢弃</span><span class="value">${stats.packages_dropped}</span></div>
        `;
    }

    _renderGateStats(gateStats) {
        return gateStats.map(gs => {
            const pct = (gs.utilization * 100).toFixed(1);
            const color = gs.is_bottleneck ? '#e74c3c' : (gs.utilization > 0.7 ? '#f39c12' : '#3498db');
            return `
                <div class="gate-stat-item ${gs.is_bottleneck ? 'bottleneck' : ''}">
                    <div class="gate-name">${gs.gate_id}</div>
                    <div class="utilization-bar">
                        <div class="fill" style="width:${pct}%; background:${color}"></div>
                    </div>
                    <div class="stat-row"><span class="label">利用率</span><span class="value">${pct}%</span></div>
                    <div class="stat-row"><span class="label">平均队列</span><span class="value">${gs.avg_queue_length.toFixed(1)}</span></div>
                    <div class="stat-row"><span class="label">平均等待</span><span class="value">${gs.avg_wait_time.toFixed(2)}s</span></div>
                    <div class="stat-row"><span class="label">处理量</span><span class="value">${gs.packages_processed}</span></div>
                </div>
            `;
        }).join('');
    }

    updateGateStats(gateStats) {
        this.gateStatsEl.innerHTML = this._renderGateStats(gateStats);
    }

    updateBottlenecks(bottlenecks) {
        if (bottlenecks.length === 0) {
            this.bottleneckEl.innerHTML = '<p style="color:#4caf50;">无瓶颈 - 系统运行正常</p>';
        } else {
            this.bottleneckEl.innerHTML = bottlenecks.map(b =>
                `<div class="bottleneck-item">&#9888; ${b} 利用率超过90%</div>`
            ).join('');
        }
    }

    showCompare(resultA, resultB) {
        const statsA = resultA.system_stats;
        const statsB = resultB.system_stats;

        document.getElementById('compare-stats-a').innerHTML = this._renderSystemStats(statsA);
        document.getElementById('compare-stats-b').innerHTML = this._renderSystemStats(statsB);
        document.getElementById('compare-gates-a').innerHTML = this._renderGateStats(resultA.gate_stats);
        document.getElementById('compare-gates-b').innerHTML = this._renderGateStats(resultB.gate_stats);

        const summary = document.getElementById('compare-summary');
        summary.innerHTML = this._renderCompareSummary(statsA, statsB, resultA.bottlenecks, resultB.bottlenecks);

        // Show backdrop
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'compare-backdrop';
        this.backdrop.addEventListener('click', () => this.hideCompare());
        document.body.appendChild(this.backdrop);

        this.comparePanel.style.display = 'flex';
    }

    hideCompare() {
        this.comparePanel.style.display = 'none';
        if (this.backdrop) {
            this.backdrop.remove();
            this.backdrop = null;
        }
    }

    _renderCompareSummary(a, b, bottlenecksA, bottlenecksB) {
        const delta = (v1, v2, inverse) => {
            const d = v2 - v1;
            if (Math.abs(d) < 0.001) return '<span class="compare-delta neutral">--</span>';
            const better = inverse ? d < 0 : d > 0;
            const cls = better ? 'positive' : 'negative';
            const sign = d > 0 ? '+' : '';
            return `<span class="compare-delta ${cls}">${sign}${d.toFixed(2)}</span>`;
        };

        return `
            <div class="stat-row">
                <span class="label">吞吐量变化</span>
                <span class="value">${a.throughput.toFixed(2)} &rarr; ${b.throughput.toFixed(2)} ${delta(a.throughput, b.throughput, false)}</span>
            </div>
            <div class="stat-row">
                <span class="label">平均时长变化</span>
                <span class="value">${a.avg_processing_time.toFixed(2)}s &rarr; ${b.avg_processing_time.toFixed(2)}s ${delta(a.avg_processing_time, b.avg_processing_time, true)}</span>
            </div>
            <div class="stat-row">
                <span class="label">溢出变化</span>
                <span class="value">${a.packages_dropped} &rarr; ${b.packages_dropped} ${delta(a.packages_dropped, b.packages_dropped, true)}</span>
            </div>
            <div class="stat-row">
                <span class="label">瓶颈 A</span>
                <span class="value">${bottlenecksA.length === 0 ? '无' : bottlenecksA.join(', ')}</span>
            </div>
            <div class="stat-row">
                <span class="label">瓶颈 B</span>
                <span class="value">${bottlenecksB.length === 0 ? '无' : bottlenecksB.join(', ')}</span>
            </div>
        `;
    }

    showProperties(gate, onUpdate) {
        if (!gate) {
            this.propsPanel.style.display = 'none';
            return;
        }
        this.propsPanel.style.display = 'block';
        this.propsContent.innerHTML = `
            <label>名称
                <input type="text" id="prop-label" value="${gate.label}">
            </label>
            <label>处理速率 (件/秒)
                <input type="number" id="prop-rate" value="${gate.processing_rate}" min="0.1" step="0.1">
            </label>
            <label>队列容量
                <input type="number" id="prop-capacity" value="${gate.queue_capacity}" min="1" step="1">
            </label>
            <label>目的地
                <input type="text" id="prop-dest" value="${gate.destinations.join(',')}">
            </label>
        `;

        const update = () => {
            gate.label = document.getElementById('prop-label').value;
            gate.processing_rate = parseFloat(document.getElementById('prop-rate').value) || 1;
            gate.queue_capacity = parseInt(document.getElementById('prop-capacity').value) || 5;
            gate.destinations = document.getElementById('prop-dest').value.split(',').map(s => s.trim());
            if (onUpdate) onUpdate();
        };

        this.propsContent.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('change', update);
        });
    }
}
