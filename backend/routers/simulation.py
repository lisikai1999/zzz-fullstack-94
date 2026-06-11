import json
from fastapi import APIRouter, HTTPException
from ..models import SimulationParams, SimulationResult, CompareRequest, LayoutConfig
from ..database import get_db
from ..engine.simulator import Simulator

router = APIRouter(prefix="/simulate", tags=["simulation"])


@router.post("")
def run_simulation(params: SimulationParams):
    if params.config:
        layout = params.config
    elif params.layout_id:
        conn = get_db()
        row = conn.execute("SELECT config FROM layouts WHERE id = ?", (params.layout_id,)).fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Layout not found")
        layout = LayoutConfig(**json.loads(row["config"]))
    else:
        raise HTTPException(status_code=400, detail="Must provide config or layout_id")

    sim = Simulator(layout, params)
    result, event_log = sim.run()

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO simulation_runs (layout_id, params, status) VALUES (?, ?, ?)",
        (params.layout_id, json.dumps(params.model_dump()), "completed"),
    )
    run_id = cursor.lastrowid

    conn.execute(
        "INSERT INTO simulation_results (run_id, gate_stats, system_stats, bottlenecks, event_log) VALUES (?, ?, ?, ?, ?)",
        (
            run_id,
            json.dumps([gs.model_dump() for gs in result.gate_stats]),
            json.dumps(result.system_stats.model_dump()),
            json.dumps(result.bottlenecks),
            json.dumps(event_log[:50000]),
        ),
    )
    conn.commit()
    conn.close()

    result.run_id = run_id
    return result


@router.post("/compare")
def compare_layouts(req: CompareRequest):
    params_a = SimulationParams(config=req.config_a, arrival_rate=req.arrival_rate, duration=req.duration, seed=req.seed)
    params_b = SimulationParams(config=req.config_b, arrival_rate=req.arrival_rate, duration=req.duration, seed=req.seed)

    sim_a = Simulator(req.config_a, params_a)
    result_a, _ = sim_a.run()

    sim_b = Simulator(req.config_b, params_b)
    result_b, _ = sim_b.run()

    return {"result_a": result_a, "result_b": result_b}


@router.get("/{run_id}")
def get_run_result(run_id: int):
    conn = get_db()
    row = conn.execute(
        "SELECT gate_stats, system_stats, bottlenecks FROM simulation_results WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run_id,
        "status": "completed",
        "gate_stats": json.loads(row["gate_stats"]),
        "system_stats": json.loads(row["system_stats"]),
        "bottlenecks": json.loads(row["bottlenecks"]),
    }


@router.get("/{run_id}/events")
def get_run_events(run_id: int):
    conn = get_db()
    row = conn.execute(
        "SELECT event_log FROM simulation_results WHERE run_id = ?",
        (run_id,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    events = json.loads(row["event_log"])
    return {"total_events": len(events), "events": events}
