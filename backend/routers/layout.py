import json
from fastapi import APIRouter, HTTPException
from ..database import get_db
from ..models import LayoutCreate, LayoutResponse, LayoutConfig

router = APIRouter(prefix="/layouts", tags=["layouts"])

DEFAULT_LAYOUT = {
    "gates": [
        {"id": "gate-A", "label": "Gate A (East)", "position": {"x": 400, "y": 150},
         "destinations": ["bin-east"], "processing_rate": 3.0, "queue_capacity": 15},
        {"id": "gate-B", "label": "Gate B (West)", "position": {"x": 400, "y": 350},
         "destinations": ["bin-west"], "processing_rate": 3.0, "queue_capacity": 15},
        {"id": "gate-C", "label": "Gate C (South)", "position": {"x": 400, "y": 550},
         "destinations": ["bin-south"], "processing_rate": 2.5, "queue_capacity": 10},
        {"id": "gate-D", "label": "Gate D (North)", "position": {"x": 400, "y": 750},
         "destinations": ["bin-north"], "processing_rate": 2.5, "queue_capacity": 10},
    ],
    "conveyors": [
        {"id": "conv-in-A", "from_node": "entrance-1", "to_node": "gate-A",
         "speed": 2.0, "length": 10.0, "waypoints": [{"x": 100, "y": 150}, {"x": 400, "y": 150}]},
        {"id": "conv-in-B", "from_node": "entrance-1", "to_node": "gate-B",
         "speed": 2.0, "length": 12.0, "waypoints": [{"x": 100, "y": 150}, {"x": 100, "y": 350}, {"x": 400, "y": 350}]},
        {"id": "conv-in-C", "from_node": "entrance-2", "to_node": "gate-C",
         "speed": 2.0, "length": 10.0, "waypoints": [{"x": 100, "y": 550}, {"x": 400, "y": 550}]},
        {"id": "conv-in-D", "from_node": "entrance-2", "to_node": "gate-D",
         "speed": 2.0, "length": 12.0, "waypoints": [{"x": 100, "y": 550}, {"x": 100, "y": 750}, {"x": 400, "y": 750}]},
        {"id": "conv-out-A", "from_node": "gate-A", "to_node": "bin-east",
         "speed": 2.5, "length": 8.0, "waypoints": [{"x": 400, "y": 150}, {"x": 700, "y": 150}]},
        {"id": "conv-out-B", "from_node": "gate-B", "to_node": "bin-west",
         "speed": 2.5, "length": 8.0, "waypoints": [{"x": 400, "y": 350}, {"x": 700, "y": 350}]},
        {"id": "conv-out-C", "from_node": "gate-C", "to_node": "bin-south",
         "speed": 2.5, "length": 8.0, "waypoints": [{"x": 400, "y": 550}, {"x": 700, "y": 550}]},
        {"id": "conv-out-D", "from_node": "gate-D", "to_node": "bin-north",
         "speed": 2.5, "length": 8.0, "waypoints": [{"x": 400, "y": 750}, {"x": 700, "y": 750}]},
    ],
    "entrances": ["entrance-1", "entrance-2"],
    "exit_bins": ["bin-east", "bin-west", "bin-south", "bin-north"],
}


@router.get("/default")
def get_default_layout():
    return DEFAULT_LAYOUT


@router.get("")
def list_layouts():
    conn = get_db()
    rows = conn.execute("SELECT id, name, created_at, config FROM layouts ORDER BY created_at DESC").fetchall()
    conn.close()
    results = []
    for row in rows:
        results.append({
            "id": row["id"],
            "name": row["name"],
            "created_at": row["created_at"],
            "config": json.loads(row["config"]),
        })
    return results


@router.get("/{layout_id}")
def get_layout(layout_id: int):
    conn = get_db()
    row = conn.execute("SELECT id, name, created_at, config FROM layouts WHERE id = ?", (layout_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Layout not found")
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
        "config": json.loads(row["config"]),
    }


@router.post("")
def create_layout(body: LayoutCreate):
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO layouts (name, config) VALUES (?, ?)",
        (body.name, json.dumps(body.config.model_dump())),
    )
    conn.commit()
    layout_id = cursor.lastrowid
    conn.close()
    return {"id": layout_id, "name": body.name}


@router.put("/{layout_id}")
def update_layout(layout_id: int, body: LayoutCreate):
    conn = get_db()
    conn.execute(
        "UPDATE layouts SET name = ?, config = ? WHERE id = ?",
        (body.name, json.dumps(body.config.model_dump()), layout_id),
    )
    conn.commit()
    conn.close()
    return {"id": layout_id, "name": body.name}


@router.delete("/{layout_id}")
def delete_layout(layout_id: int):
    conn = get_db()
    conn.execute("DELETE FROM layouts WHERE id = ?", (layout_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}
