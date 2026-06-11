from __future__ import annotations
from pydantic import BaseModel


class Position(BaseModel):
    x: float
    y: float


class GateConfig(BaseModel):
    id: str
    label: str
    position: Position
    destinations: list[str]
    processing_rate: float  # packages per second
    queue_capacity: int


class ConveyorSegment(BaseModel):
    id: str
    from_node: str
    to_node: str
    speed: float  # meters per second
    length: float
    waypoints: list[Position]


class LayoutConfig(BaseModel):
    gates: list[GateConfig]
    conveyors: list[ConveyorSegment]
    entrances: list[str]
    exit_bins: list[str]


class LayoutCreate(BaseModel):
    name: str
    config: LayoutConfig


class LayoutResponse(BaseModel):
    id: int
    name: str
    created_at: str
    config: LayoutConfig


class SimulationParams(BaseModel):
    layout_id: int | None = None
    config: LayoutConfig | None = None
    arrival_rate: float
    duration: float
    seed: int | None = None


class GateStats(BaseModel):
    gate_id: str
    utilization: float
    avg_queue_length: float
    max_queue_length: int
    avg_wait_time: float
    max_wait_time: float
    packages_processed: int
    is_bottleneck: bool


class SystemStats(BaseModel):
    total_packages_arrived: int
    total_packages_sorted: int
    throughput: float
    avg_processing_time: float
    max_processing_time: float
    packages_dropped: int


class SimulationResult(BaseModel):
    run_id: int
    status: str
    gate_stats: list[GateStats]
    system_stats: SystemStats
    bottlenecks: list[str]


class PackageEvent(BaseModel):
    time: float
    event_type: str
    package_id: int
    node_id: str
    destination: str | None = None


class CompareRequest(BaseModel):
    config_a: LayoutConfig
    config_b: LayoutConfig
    arrival_rate: float
    duration: float
    seed: int | None = None
