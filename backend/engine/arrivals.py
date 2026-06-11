import numpy as np


def generate_arrivals(rng: np.random.Generator, rate: float, duration: float) -> np.ndarray:
    expected_count = int(rate * duration * 1.5) + 10
    inter_arrivals = rng.exponential(1.0 / rate, size=expected_count)
    arrival_times = np.cumsum(inter_arrivals)
    return arrival_times[arrival_times <= duration]


def assign_destinations(rng: np.random.Generator, exit_bins: list[str], count: int) -> list[str]:
    indices = rng.integers(0, len(exit_bins), size=count)
    return [exit_bins[i] for i in indices]
