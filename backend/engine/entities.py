from __future__ import annotations
from dataclasses import dataclass, field
from collections import deque


@dataclass
class Package:
    id: int
    destination: str
    arrival_time: float
    current_node: str
    enter_queue_time: float = 0.0


@dataclass
class GateState:
    id: str
    label: str
    processing_rate: float
    queue_capacity: int
    destinations: list[str]
    queue: deque = field(default_factory=deque)
    busy: bool = False
    blocked: bool = False
    current_package: Package | None = None
    busy_since: float = 0.0
    total_busy_time: float = 0.0
    total_packages: int = 0
    wait_times: list[float] = field(default_factory=list)
    queue_history: list[tuple[float, int]] = field(default_factory=list)
