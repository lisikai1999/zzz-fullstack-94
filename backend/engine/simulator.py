from __future__ import annotations
import heapq
from collections import deque
from dataclasses import dataclass, field

import numpy as np

from ..models import LayoutConfig, SimulationParams, SimulationResult, PackageEvent
from .entities import Package, GateState
from .graph import ConveyorGraph
from .arrivals import generate_arrivals, assign_destinations
from .statistics import StatsCollector


@dataclass(order=True)
class Event:
    time: float
    priority: int = field(compare=True)
    seq: int = field(compare=True, default=0)
    event_type: str = field(compare=False, default="")
    data: dict = field(compare=False, default_factory=dict)


PRIORITIES = {
    "SORTED": 0,
    "PROCESS_DONE": 1,
    "UNBLOCK_CHECK": 2,
    "ENTER_GATE": 3,
    "CONVEYOR_DONE": 4,
    "ARRIVE": 5,
}


@dataclass
class ConveyorState:
    id: str
    from_node: str
    to_node: str
    capacity: int
    packages_on: deque = field(default_factory=deque)
    blocked: bool = False
    blocked_time: float = 0.0
    total_blocked_time: float = 0.0


class Simulator:
    def __init__(self, layout: LayoutConfig, params: SimulationParams):
        self.layout = layout
        self.params = params
        self.rng = np.random.default_rng(params.seed)
        self.clock = 0.0
        self.event_queue: list[Event] = []
        self.event_log: list[dict] = []
        self.seq = 0
        self.next_package_id = 0

        self.graph = ConveyorGraph(layout)
        self.gates: dict[str, GateState] = {}
        self.conveyors: dict[str, ConveyorState] = {}
        self.stats = StatsCollector(layout)

        # Mapping: node -> list of conveyor IDs feeding into it
        self.incoming_conveyors: dict[str, list[str]] = {}
        # Mapping: node -> list of conveyor IDs going out of it
        self.outgoing_conveyors: dict[str, list[str]] = {}
        # Packages waiting at blocked conveyor ends
        self.blocked_queues: dict[str, deque] = {}

        self._init_gates()
        self._init_conveyors()

    def _init_gates(self):
        for gate_cfg in self.layout.gates:
            self.gates[gate_cfg.id] = GateState(
                id=gate_cfg.id,
                label=gate_cfg.label,
                processing_rate=gate_cfg.processing_rate,
                queue_capacity=gate_cfg.queue_capacity,
                destinations=gate_cfg.destinations,
            )
            self.gates[gate_cfg.id].queue_history.append((0.0, 0))

    def _init_conveyors(self):
        from collections import defaultdict
        self.incoming_conveyors = defaultdict(list)
        self.outgoing_conveyors = defaultdict(list)

        for seg in self.layout.conveyors:
            cap = max(3, int(seg.length * 2))
            self.conveyors[seg.id] = ConveyorState(
                id=seg.id,
                from_node=seg.from_node,
                to_node=seg.to_node,
                capacity=cap,
            )
            self.incoming_conveyors[seg.to_node].append(seg.id)
            self.outgoing_conveyors[seg.from_node].append(seg.id)
            self.blocked_queues[seg.id] = deque()

    def _schedule(self, time: float, event_type: str, data: dict):
        self.seq += 1
        ev = Event(
            time=time,
            priority=PRIORITIES.get(event_type, 5),
            seq=self.seq,
            event_type=event_type,
            data=data,
        )
        heapq.heappush(self.event_queue, ev)

    def _log_event(self, time: float, event_type: str, package_id: int, node_id: str, destination: str | None = None):
        self.event_log.append({
            "time": round(time, 4),
            "event_type": event_type,
            "package_id": package_id,
            "node_id": node_id,
            "destination": destination,
        })

    def run(self) -> tuple[SimulationResult, list[dict]]:
        self._schedule_arrivals()

        while self.event_queue:
            event = heapq.heappop(self.event_queue)
            if event.time > self.params.duration:
                break
            self.clock = event.time
            self._handle_event(event)

        gate_stats = self.stats.compute_gate_stats(self.gates, self.params.duration)
        system_stats = self.stats.compute_system_stats(self.params.duration)
        bottlenecks = [gs.gate_id for gs in gate_stats if gs.is_bottleneck]

        result = SimulationResult(
            run_id=0,
            status="completed",
            gate_stats=gate_stats,
            system_stats=system_stats,
            bottlenecks=bottlenecks,
        )
        return result, self.event_log

    def _schedule_arrivals(self):
        arrival_times = generate_arrivals(self.rng, self.params.arrival_rate, self.params.duration)
        destinations = assign_destinations(self.rng, self.layout.exit_bins, len(arrival_times))

        for i, t in enumerate(arrival_times):
            entrance = self.layout.entrances[i % len(self.layout.entrances)]
            self._schedule(float(t), "ARRIVE", {
                "entrance": entrance,
                "destination": destinations[i],
            })

    def _handle_event(self, event: Event):
        handlers = {
            "ARRIVE": self._on_arrive,
            "CONVEYOR_DONE": self._on_conveyor_done,
            "ENTER_GATE": self._on_enter_gate,
            "PROCESS_DONE": self._on_process_done,
            "SORTED": self._on_sorted,
            "UNBLOCK_CHECK": self._on_unblock_check,
        }
        handler = handlers.get(event.event_type)
        if handler:
            handler(event)

    def _is_node_blocked(self, node_id: str) -> bool:
        """Check if a node is blocked (gate full or all outgoing conveyors blocked)."""
        if node_id in self.gates:
            gate = self.gates[node_id]
            return len(gate.queue) >= gate.queue_capacity
        return False

    def _try_enter_conveyor(self, pkg: Package, segment_id: str) -> bool:
        """Try to place a package onto a conveyor. Returns False if conveyor is blocked."""
        conv = self.conveyors[segment_id]
        if conv.blocked:
            self.blocked_queues[segment_id].append(pkg)
            self._log_event(self.clock, "blocked", pkg.id, segment_id, pkg.destination)
            return False

        conv.packages_on.append(pkg)
        travel_time = self.graph.get_travel_time(self.graph.segments[segment_id])
        self._schedule(self.clock + travel_time, "CONVEYOR_DONE", {
            "package": pkg,
            "segment_id": segment_id,
            "target_node": conv.to_node,
        })
        self._log_event(self.clock, "enter_conveyor", pkg.id, segment_id, pkg.destination)

        # If conveyor is now at capacity, block it
        if len(conv.packages_on) >= conv.capacity:
            self._block_conveyor(segment_id)

        return True

    def _block_conveyor(self, segment_id: str):
        """Block a conveyor - upstream nodes can no longer output onto it."""
        conv = self.conveyors[segment_id]
        if conv.blocked:
            return
        conv.blocked = True
        conv.blocked_time = self.clock
        self._log_event(self.clock, "conveyor_blocked", -1, segment_id)

        # Cascade: if blocking this conveyor means the upstream node's output is fully blocked,
        # then the upstream node's processing stalls too (for gates).
        from_node = conv.from_node
        if from_node in self.gates:
            all_out_blocked = all(
                self.conveyors[cid].blocked
                for cid in self.outgoing_conveyors.get(from_node, [])
            )
            if all_out_blocked:
                self.gates[from_node].blocked = True
                self._log_event(self.clock, "gate_blocked", -1, from_node)
                # Further cascade: block conveyors feeding into this gate
                self._cascade_block_upstream(from_node)

    def _cascade_block_upstream(self, node_id: str):
        """When a gate is fully blocked (can't output), its incoming conveyors become blocked."""
        if node_id not in self.gates:
            return
        gate = self.gates[node_id]
        if len(gate.queue) < gate.queue_capacity:
            return

        for conv_id in self.incoming_conveyors.get(node_id, []):
            self._block_conveyor(conv_id)

    def _unblock_conveyor(self, segment_id: str):
        """Unblock a conveyor and flush any waiting packages onto it."""
        conv = self.conveyors[segment_id]
        if not conv.blocked:
            return
        conv.blocked = False
        conv.total_blocked_time += self.clock - conv.blocked_time
        self._log_event(self.clock, "conveyor_unblocked", -1, segment_id)

        # Flush blocked queue onto conveyor
        while self.blocked_queues[segment_id] and len(conv.packages_on) < conv.capacity:
            pkg = self.blocked_queues[segment_id].popleft()
            self._try_enter_conveyor(pkg, segment_id)

        # Unblock upstream gate if it was blocked
        from_node = conv.from_node
        if from_node in self.gates and self.gates[from_node].blocked:
            has_available_out = any(
                not self.conveyors[cid].blocked
                for cid in self.outgoing_conveyors.get(from_node, [])
            )
            if has_available_out:
                self.gates[from_node].blocked = False
                self._log_event(self.clock, "gate_unblocked", -1, from_node)
                # Unblock conveyors feeding into this gate if it has queue space
                if len(self.gates[from_node].queue) < self.gates[from_node].queue_capacity:
                    for inc_id in self.incoming_conveyors.get(from_node, []):
                        if self.conveyors[inc_id].blocked:
                            self._unblock_conveyor(inc_id)
                # Resume processing if gate was stalled
                if not self.gates[from_node].busy and self.gates[from_node].queue:
                    self._start_processing(self.gates[from_node])

    def _on_arrive(self, event: Event):
        self.stats.arrival_count += 1
        pkg = Package(
            id=self.next_package_id,
            destination=event.data["destination"],
            arrival_time=self.clock,
            current_node=event.data["entrance"],
        )
        self.next_package_id += 1
        self._log_event(self.clock, "arrive", pkg.id, pkg.current_node, pkg.destination)

        segment = self.graph.get_next_segment(pkg.current_node, pkg.destination)
        if segment:
            if not self._try_enter_conveyor(pkg, segment.id):
                self.stats.dropped_count += 1
        else:
            self.stats.dropped_count += 1

    def _on_conveyor_done(self, event: Event):
        pkg: Package = event.data["package"]
        segment_id = event.data["segment_id"]
        target = event.data["target_node"]
        pkg.current_node = target

        # Remove from conveyor
        conv = self.conveyors[segment_id]
        if conv.packages_on and conv.packages_on[0].id == pkg.id:
            conv.packages_on.popleft()
        else:
            # Remove by id (might not be at front due to timing)
            conv.packages_on = deque(p for p in conv.packages_on if p.id != pkg.id)

        # Conveyor freed a slot — if it was blocked, unblock
        if conv.blocked and len(conv.packages_on) < conv.capacity:
            self._unblock_conveyor(segment_id)

        if target in self.layout.exit_bins:
            self._schedule(self.clock, "SORTED", {"package": pkg})
            return

        if target in self.gates:
            self._schedule(self.clock, "ENTER_GATE", {"package": pkg, "gate_id": target})
        else:
            segment = self.graph.get_next_segment(target, pkg.destination)
            if segment:
                if not self._try_enter_conveyor(pkg, segment.id):
                    pass  # queued in blocked_queue
            else:
                self._schedule(self.clock, "SORTED", {"package": pkg})

    def _on_enter_gate(self, event: Event):
        pkg: Package = event.data["package"]
        gate_id = event.data["gate_id"]
        gate = self.gates[gate_id]

        if len(gate.queue) >= gate.queue_capacity:
            # Gate full — block all incoming conveyors (cascade upstream)
            self._log_event(self.clock, "overflow", pkg.id, gate_id, pkg.destination)
            for conv_id in self.incoming_conveyors.get(gate_id, []):
                self._block_conveyor(conv_id)
            # Park this package in one of the incoming conveyor's blocked queues
            inc_convs = self.incoming_conveyors.get(gate_id, [])
            if inc_convs:
                self.blocked_queues[inc_convs[0]].append(pkg)
            else:
                self.stats.dropped_count += 1
            return

        pkg.enter_queue_time = self.clock
        gate.queue.append(pkg)
        gate.queue_history.append((self.clock, len(gate.queue)))
        self._log_event(self.clock, "enter_queue", pkg.id, gate_id, pkg.destination)

        if not gate.busy and not gate.blocked:
            self._start_processing(gate)

    def _start_processing(self, gate: GateState):
        if not gate.queue:
            return
        if gate.blocked:
            return

        pkg = gate.queue.popleft()
        gate.queue_history.append((self.clock, len(gate.queue)))
        gate.busy = True
        gate.busy_since = self.clock
        gate.current_package = pkg

        wait_time = self.clock - pkg.enter_queue_time
        gate.wait_times.append(wait_time)

        process_time = 1.0 / gate.processing_rate
        self._schedule(self.clock + process_time, "PROCESS_DONE", {
            "package": pkg,
            "gate_id": gate.id,
        })
        self._log_event(self.clock, "process", pkg.id, gate.id, pkg.destination)

    def _on_process_done(self, event: Event):
        pkg: Package = event.data["package"]
        gate_id = event.data["gate_id"]
        gate = self.gates[gate_id]

        gate.busy = False
        gate.total_busy_time += self.clock - gate.busy_since
        gate.total_packages += 1
        gate.current_package = None

        # Try to send package downstream
        segment = self.graph.get_next_segment(gate_id, pkg.destination)
        if segment:
            if gate.blocked:
                # Gate output blocked - package waits in output buffer
                self.blocked_queues[segment.id].append(pkg)
                self._log_event(self.clock, "blocked", pkg.id, segment.id, pkg.destination)
            else:
                if not self._try_enter_conveyor(pkg, segment.id):
                    # Conveyor just became blocked
                    pass
        else:
            self._schedule(self.clock, "SORTED", {"package": pkg})

        # Gate freed a queue slot — unblock incoming conveyors
        if len(gate.queue) < gate.queue_capacity:
            for conv_id in self.incoming_conveyors.get(gate_id, []):
                if self.conveyors[conv_id].blocked:
                    self._unblock_conveyor(conv_id)

        # Process next in queue
        if gate.queue and not gate.blocked:
            self._start_processing(gate)

    def _on_unblock_check(self, event: Event):
        """Periodic check to resolve any stuck states."""
        node_id = event.data.get("node_id")
        if node_id and node_id in self.gates:
            gate = self.gates[node_id]
            if len(gate.queue) < gate.queue_capacity:
                for conv_id in self.incoming_conveyors.get(node_id, []):
                    if self.conveyors[conv_id].blocked:
                        self._unblock_conveyor(conv_id)

    def _on_sorted(self, event: Event):
        pkg: Package = event.data["package"]
        processing_time = self.clock - pkg.arrival_time
        self.stats.sorted_count += 1
        self.stats.processing_times.append(processing_time)
        self._log_event(self.clock, "sorted", pkg.id, pkg.destination, pkg.destination)
