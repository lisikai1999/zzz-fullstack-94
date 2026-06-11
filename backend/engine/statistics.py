from __future__ import annotations
import numpy as np
from ..models import GateStats, SystemStats, LayoutConfig
from .entities import GateState


class StatsCollector:
    def __init__(self, layout: LayoutConfig):
        self.gate_ids = [g.id for g in layout.gates]
        self.arrival_count = 0
        self.sorted_count = 0
        self.dropped_count = 0
        self.processing_times: list[float] = []

    def compute_gate_stats(self, gates: dict[str, GateState], total_time: float) -> list[GateStats]:
        results = []
        for gate_id, state in gates.items():
            utilization = state.total_busy_time / total_time if total_time > 0 else 0.0
            utilization = min(utilization, 1.0)

            avg_queue = 0.0
            max_queue = 0
            if state.queue_history:
                times = [t for t, _ in state.queue_history]
                lengths = [l for _, l in state.queue_history]
                max_queue = max(lengths)
                if len(times) > 1:
                    total_area = 0.0
                    for i in range(len(times) - 1):
                        dt = times[i + 1] - times[i]
                        total_area += lengths[i] * dt
                    last_dt = total_time - times[-1]
                    total_area += lengths[-1] * last_dt
                    avg_queue = total_area / total_time if total_time > 0 else 0.0

            avg_wait = np.mean(state.wait_times) if state.wait_times else 0.0
            max_wait = max(state.wait_times) if state.wait_times else 0.0

            results.append(GateStats(
                gate_id=gate_id,
                utilization=round(utilization, 4),
                avg_queue_length=round(avg_queue, 2),
                max_queue_length=max_queue,
                avg_wait_time=round(float(avg_wait), 4),
                max_wait_time=round(float(max_wait), 4),
                packages_processed=state.total_packages,
                is_bottleneck=utilization > 0.90,
            ))
        return results

    def compute_system_stats(self, total_time: float) -> SystemStats:
        throughput = self.sorted_count / total_time if total_time > 0 else 0.0
        avg_proc = float(np.mean(self.processing_times)) if self.processing_times else 0.0
        max_proc = float(max(self.processing_times)) if self.processing_times else 0.0

        return SystemStats(
            total_packages_arrived=self.arrival_count,
            total_packages_sorted=self.sorted_count,
            throughput=round(throughput, 4),
            avg_processing_time=round(avg_proc, 4),
            max_processing_time=round(max_proc, 4),
            packages_dropped=self.dropped_count,
        )
