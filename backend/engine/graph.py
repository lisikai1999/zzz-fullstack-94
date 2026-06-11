from __future__ import annotations
from collections import defaultdict, deque
from ..models import LayoutConfig, ConveyorSegment


class ConveyorGraph:
    def __init__(self, layout: LayoutConfig):
        self.adjacency: dict[str, list[tuple[str, ConveyorSegment]]] = defaultdict(list)
        self.reverse_adj: dict[str, list[tuple[str, ConveyorSegment]]] = defaultdict(list)
        self.routing_table: dict[str, dict[str, str]] = {}
        self.segments: dict[str, ConveyorSegment] = {}
        self._build(layout)

    def _build(self, layout: LayoutConfig):
        for seg in layout.conveyors:
            self.adjacency[seg.from_node].append((seg.to_node, seg))
            self.reverse_adj[seg.to_node].append((seg.from_node, seg))
            self.segments[seg.id] = seg

        for exit_bin in layout.exit_bins:
            self._compute_routing(exit_bin, layout)

    def _compute_routing(self, exit_bin: str, layout: LayoutConfig):
        visited = set()
        queue = deque([exit_bin])
        visited.add(exit_bin)

        while queue:
            node = queue.popleft()
            for prev_node, seg in self.reverse_adj[node]:
                if prev_node in visited:
                    continue
                visited.add(prev_node)
                if prev_node not in self.routing_table:
                    self.routing_table[prev_node] = {}
                self.routing_table[prev_node][exit_bin] = seg.id
                queue.append(prev_node)

    def get_next_segment(self, current_node: str, destination: str) -> ConveyorSegment | None:
        routes = self.routing_table.get(current_node, {})
        seg_id = routes.get(destination)
        if seg_id:
            return self.segments[seg_id]
        if self.adjacency[current_node]:
            return self.adjacency[current_node][0][1]
        return None

    def get_travel_time(self, segment: ConveyorSegment) -> float:
        if segment.speed <= 0:
            return 0.0
        return segment.length / segment.speed
