from __future__ import annotations

import tomllib
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from pathlib import Path
from typing import Any


class ElementRegistryError(ValueError):
    """Raised when bundled element radius data cannot be resolved."""


@dataclass(frozen=True, slots=True)
class ElementRecord:
    symbol: str
    atomic_radius: float
    vdw_radius: float
    ionic_radius: float
    uniform_radius: float


@dataclass(frozen=True, slots=True)
class ElementRegistry:
    records: dict[str, ElementRecord]

    def resolve(self, symbol: str) -> ElementRecord:
        normalized = normalize_symbol(symbol)
        try:
            return self.records[normalized]
        except KeyError as exc:
            raise ElementRegistryError(f"No bundled element data for {symbol!r}.") from exc


def normalize_symbol(symbol: str) -> str:
    normalized = symbol.strip()
    if not normalized:
        raise ElementRegistryError("Element symbol cannot be empty.")
    return normalized[0].upper() + normalized[1:].lower()


@lru_cache
def load_element_registry(path: str | Path | None = None) -> ElementRegistry:
    if path is None:
        resource = resources.files("pretty_lattice").joinpath("data/elements.toml")
        payload = resource.read_bytes()
    else:
        payload = Path(path).read_bytes()

    data = tomllib.loads(payload.decode("utf-8"))
    raw_elements = data.get("elements")
    if not isinstance(raw_elements, dict):
        raise ElementRegistryError("Element registry must contain [elements].")

    records: dict[str, ElementRecord] = {}
    for raw_symbol, raw_record in raw_elements.items():
        symbol = normalize_symbol(raw_symbol)
        if not isinstance(raw_record, dict):
            raise ElementRegistryError(f"Invalid registry record for {symbol}.")
        records[symbol] = _parse_record(symbol, raw_record)

    return ElementRegistry(records=records)


def resolve_element_data(symbol: str) -> ElementRecord:
    return load_element_registry().resolve(symbol)


def _parse_record(symbol: str, raw_record: dict[str, Any]) -> ElementRecord:
    try:
        atomic_radius = float(raw_record["atomic_radius"])
        vdw_radius = float(raw_record["vdw_radius"])
        ionic_radius = float(raw_record["ionic_radius"])
        uniform_radius = float(raw_record["uniform_radius"])
    except KeyError as exc:
        raise ElementRegistryError(
            f"Element registry record for {symbol} is missing {exc.args[0]}."
        ) from exc

    if {"hex", "rgb", "oklch", "color"}.intersection(raw_record):
        raise ElementRegistryError(f"Element registry record for {symbol} must not define colors.")

    if atomic_radius <= 0 or vdw_radius <= 0 or ionic_radius <= 0 or uniform_radius <= 0:
        raise ElementRegistryError(f"Element radii for {symbol} must be positive.")

    return ElementRecord(
        symbol=symbol,
        atomic_radius=atomic_radius,
        vdw_radius=vdw_radius,
        ionic_radius=ionic_radius,
        uniform_radius=uniform_radius,
    )
