let layout = null;
let renderer = null;
let editor = null;
let animation = null;
let panel = null;
let previousLayout = null;

async function init() {
    const canvas = document.getElementById('sim-canvas');
    renderer = new Renderer(canvas);
    panel = new Panel();

    layout = await API.getDefaultLayout();

    editor = new Editor(
        canvas,
        renderer,
        () => layout,
        (newLayout) => { layout = newLayout; }
    );

    editor.onSelectionChange = (selected) => {
        panel.showProperties(selected, () => {
            renderer.render({ layout, packages: [], selected });
        });
    };

    renderer.render({ layout, packages: [], selected: null });

    setupToolButtons();
    setupControls();
    setupAnimationControls();
    setupZoomPan(canvas);

    window.addEventListener('resize', () => {
        renderer.resize();
        renderer.render({ layout, packages: [], selected: editor.selected });
    });
}

function setupToolButtons() {
    const tools = ['select', 'add-gate', 'add-conveyor', 'delete'];
    tools.forEach(tool => {
        const btn = document.getElementById(`tool-${tool}`);
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            editor.setTool(tool);
        });
    });
}

function setupControls() {
    const arrivalSlider = document.getElementById('arrival-rate');
    const arrivalVal = document.getElementById('arrival-rate-val');
    arrivalSlider.addEventListener('input', () => {
        arrivalVal.textContent = parseFloat(arrivalSlider.value).toFixed(1);
    });

    document.getElementById('btn-run').addEventListener('click', runSimulation);
    document.getElementById('btn-compare').addEventListener('click', compareSimulation);
    document.getElementById('btn-reset').addEventListener('click', resetLayout);
    document.getElementById('btn-save').addEventListener('click', saveLayout);
}

function setupAnimationControls() {
    const speedSlider = document.getElementById('anim-speed');
    const speedVal = document.getElementById('anim-speed-val');
    speedSlider.addEventListener('input', () => {
        const val = parseFloat(speedSlider.value);
        speedVal.textContent = `${val}x`;
        if (animation) animation.speed = val;
    });

    document.getElementById('btn-play').addEventListener('click', () => {
        if (animation) {
            animation.speed = parseFloat(speedSlider.value);
            animation.play();
        }
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
        if (animation) animation.pause();
    });
}

function setupZoomPan(canvas) {
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const oldZoom = renderer.camera.zoom;
        const newZoom = Math.max(0.3, Math.min(5.0, oldZoom * zoomFactor));

        // Zoom towards mouse position
        renderer.camera.x -= (mouseX - renderer.camera.x) * (newZoom / oldZoom - 1);
        renderer.camera.y -= (mouseY - renderer.camera.y) * (newZoom / oldZoom - 1);
        renderer.camera.zoom = newZoom;

        renderCurrent();
    }, { passive: false });

    // Middle/right click pan
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;
        renderer.camera.x += dx;
        renderer.camera.y += dy;
        panStart = { x: e.clientX, y: e.clientY };
        renderCurrent();
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 1 || isPanning) {
            isPanning = false;
        }
    });

    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
    });

    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Zoom buttons
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        renderer.camera.zoom = Math.min(5.0, renderer.camera.zoom * 1.3);
        renderCurrent();
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        renderer.camera.zoom = Math.max(0.3, renderer.camera.zoom / 1.3);
        renderCurrent();
    });

    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
        renderer.camera = { x: 0, y: 0, zoom: 1.0 };
        renderCurrent();
    });
}

function renderCurrent() {
    renderer.render({ layout, packages: [], selected: editor ? editor.selected : null });
}

async function runSimulation() {
    const btn = document.getElementById('btn-run');
    btn.textContent = '运行中...';
    btn.disabled = true;

    try {
        const params = {
            config: layout,
            arrival_rate: parseFloat(document.getElementById('arrival-rate').value),
            duration: parseFloat(document.getElementById('duration').value),
            seed: parseInt(document.getElementById('seed').value) || null,
        };

        const result = await API.runSimulation(params);

        panel.updateSystemStats(result.system_stats);
        panel.updateGateStats(result.gate_stats);
        panel.updateBottlenecks(result.bottlenecks);

        // Apply heatmap
        renderer.heatmapData = {};
        for (const gs of result.gate_stats) {
            renderer.heatmapData[gs.gate_id] = gs.utilization;
        }
        for (const conv of layout.conveyors) {
            const gateUtil = renderer.heatmapData[conv.to_node] || renderer.heatmapData[conv.from_node] || 0;
            renderer.heatmapData[conv.id] = gateUtil;
        }

        renderer.render({ layout, packages: [], selected: null });

        // Load events for animation
        const eventsData = await API.getEvents(result.run_id);
        animation = new AnimationController(renderer, layout);
        animation.loadEvents(eventsData.events);
        animation.onTimeUpdate = (t) => {
            document.getElementById('sim-time-display').textContent = `t = ${t.toFixed(2)}s`;
        };

        document.getElementById('btn-play').disabled = false;
        document.getElementById('btn-pause').disabled = false;

        previousLayout = JSON.parse(JSON.stringify(layout));
    } catch (err) {
        alert('仿真运行出错: ' + err.message);
    } finally {
        btn.textContent = '运行仿真';
        btn.disabled = false;
    }
}

async function compareSimulation() {
    if (!previousLayout) {
        alert('请先运行一次仿真，修改布局后再点击对比');
        return;
    }

    const btn = document.getElementById('btn-compare');
    btn.textContent = '对比中...';
    btn.disabled = true;

    try {
        const data = {
            config_a: previousLayout,
            config_b: layout,
            arrival_rate: parseFloat(document.getElementById('arrival-rate').value),
            duration: parseFloat(document.getElementById('duration').value),
            seed: parseInt(document.getElementById('seed').value) || null,
        };

        const result = await API.compareSimulation(data);
        panel.showCompare(result.result_a, result.result_b);
    } catch (err) {
        alert('对比运行出错: ' + err.message);
    } finally {
        btn.textContent = '对比仿真';
        btn.disabled = false;
    }
}

async function resetLayout() {
    layout = await API.getDefaultLayout();
    renderer.heatmapData = {};
    renderer.render({ layout, packages: [], selected: null });
    panel.showProperties(null);
}

async function saveLayout() {
    const name = prompt('布局名称:', `layout-${Date.now()}`);
    if (!name) return;
    await API.saveLayout(name, layout);
    alert('布局已保存');
}

document.addEventListener('DOMContentLoaded', init);
