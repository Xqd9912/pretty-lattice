from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest
from pymatgen.core import Lattice, Structure

import glance.electronic.ipr as ipr_module
from glance.electronic.ipr import (
    IprReadError,
    aggregate_ipr_bands,
    compute_ipr,
    normalize_kpoint_weights,
)


def test_aggregate_ipr_bands_uses_k_weighted_atomic_composition() -> None:
    projected = np.array(
        [
            [[[[1.0]], [[0.0]], [[0.0]]]],
            [[[[0.0]], [[1.0]], [[1.0]]]],
        ]
    ).reshape(2, 1, 3, 1)
    eigenvalues = np.array([[[5.0, 1.0]], [[7.0, 0.0]]])

    states, compositions, warnings = aggregate_ipr_bands(
        projected=projected,
        eigenvalues=eigenvalues,
        kpoint_weights=[1.0, 3.0],
        efermi=6.0,
        atom_count=3,
    )

    assert warnings == ()
    assert compositions.dtype == np.float32
    assert compositions[0] == pytest.approx([0.25, 0.375, 0.375])
    assert states[0].state_id == "band-0"
    assert states[0].energy == pytest.approx(0.5)
    assert states[0].energy_min == pytest.approx(-1.0)
    assert states[0].energy_max == pytest.approx(1.0)
    assert states[0].occupation == pytest.approx(0.25)
    assert states[0].ipr == pytest.approx(0.25**2 + 0.375**2 + 0.375**2)
    assert states[0].ipr == pytest.approx(float(np.sum(compositions[0] ** 2)))
    assert states[0].k_point_count == 2


def test_zero_weight_kpoint_is_excluded_from_every_aggregate() -> None:
    projected = np.array(
        [
            [[[1.0], [0.0]]],
            [[[0.0], [0.0]]],
            [[[0.0], [1.0]]],
        ]
    )
    eigenvalues = np.array([[[2.0, 1.0]], [[100.0, 0.5]], [[4.0, 0.0]]])

    states, compositions, _ = aggregate_ipr_bands(
        projected=projected,
        eigenvalues=eigenvalues,
        kpoint_weights=[1.0, 0.0, 1.0],
        efermi=2.0,
        atom_count=2,
    )

    assert compositions[0] == pytest.approx([0.5, 0.5])
    assert states[0].energy == pytest.approx(1.0)
    assert states[0].energy_min == pytest.approx(0.0)
    assert states[0].energy_max == pytest.approx(2.0)
    assert states[0].occupation == pytest.approx(0.5)
    assert states[0].k_point_count == 2


def test_states_are_sorted_by_energy_but_keep_band_ids() -> None:
    projected = np.ones((1, 2, 1, 1))
    eigenvalues = np.array([[[2.0, 0.0], [-1.0, 1.0]]])

    states, _, _ = aggregate_ipr_bands(
        projected=projected,
        eigenvalues=eigenvalues,
        kpoint_weights=None,
        efermi=0.0,
        atom_count=1,
    )

    assert [state.state_id for state in states] == ["band-1", "band-0"]
    assert [state.band_index for state in states] == [1, 0]


def test_zero_projection_band_is_omitted_with_warning() -> None:
    projected = np.array([[[[1.0]], [[0.0]]]])
    eigenvalues = np.array([[[0.0, 1.0], [1.0, 0.0]]])

    states, compositions, warnings = aggregate_ipr_bands(
        projected=projected,
        eigenvalues=eigenvalues,
        kpoint_weights=[1.0],
        efermi=0.0,
        atom_count=1,
    )

    assert [state.band_index for state in states] == [0]
    assert compositions.shape == (1, 1)
    assert "#2" in warnings[0]


def test_all_zero_projection_bands_are_rejected() -> None:
    with pytest.raises(IprReadError, match="No bands contain valid projected weight"):
        aggregate_ipr_bands(
            projected=np.zeros((1, 1, 1, 1)),
            eigenvalues=np.zeros((1, 1, 2)),
            kpoint_weights=[1.0],
            efermi=0.0,
            atom_count=1,
        )


def test_tiny_negative_projection_is_clipped_but_material_negative_is_rejected() -> None:
    states, compositions, _ = aggregate_ipr_bands(
        projected=np.array([[[[-1e-9, 1.0], [1.0, 0.0]]]]),
        eigenvalues=np.array([[[0.0, 1.0]]]),
        kpoint_weights=[1.0],
        efermi=0.0,
        atom_count=2,
    )
    assert states[0].ipr == pytest.approx(0.5)
    assert compositions[0] == pytest.approx([0.5, 0.5])

    with pytest.raises(IprReadError, match="materially negative"):
        aggregate_ipr_bands(
            projected=np.array([[[[-1e-4], [1.0]]]]),
            eigenvalues=np.array([[[0.0, 1.0]]]),
            kpoint_weights=[1.0],
            efermi=0.0,
            atom_count=2,
        )


@pytest.mark.parametrize(
    ("weights", "nk", "message"),
    [
        (None, 2, "Multiple k-points"),
        ([1.0], 2, "Expected 2"),
        ([1.0, -1.0], 2, "cannot be negative"),
        ([0.0, 0.0], 2, "at least one positive"),
        ([1.0, np.nan], 2, "finite"),
    ],
)
def test_invalid_kpoint_weights_are_rejected(
    weights: list[float] | None, nk: int, message: str
) -> None:
    with pytest.raises(IprReadError, match=message):
        normalize_kpoint_weights(weights, nk)


def test_single_missing_kpoint_weight_defaults_to_one() -> None:
    weights, positive = normalize_kpoint_weights(None, 1)
    assert weights.tolist() == [1.0]
    assert positive.tolist() == [True]


def test_shape_nion_state_and_memory_limits_are_validated(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(IprReadError, match="different shapes"):
        aggregate_ipr_bands(
            projected=np.ones((2, 1, 1, 1)),
            eigenvalues=np.ones((1, 1, 2)),
            kpoint_weights=[0.5, 0.5],
            efermi=0.0,
            atom_count=1,
        )
    with pytest.raises(IprReadError, match="does not match"):
        aggregate_ipr_bands(
            projected=np.ones((1, 1, 2, 1)),
            eigenvalues=np.ones((1, 1, 2)),
            kpoint_weights=[1.0],
            efermi=0.0,
            atom_count=1,
        )

    monkeypatch.setattr(ipr_module, "MAX_IPR_STATES", 1)
    with pytest.raises(IprReadError, match="at most 1"):
        aggregate_ipr_bands(
            projected=np.ones((1, 2, 1, 1)),
            eigenvalues=np.ones((1, 2, 2)),
            kpoint_weights=[1.0],
            efermi=0.0,
            atom_count=1,
        )

    monkeypatch.setattr(ipr_module, "MAX_IPR_STATES", 20_000)
    monkeypatch.setattr(ipr_module, "MAX_IPR_COMPOSITION_VALUES", 1)
    with pytest.raises(IprReadError, match="too large"):
        aggregate_ipr_bands(
            projected=np.ones((1, 1, 2, 1)),
            eigenvalues=np.ones((1, 1, 2)),
            kpoint_weights=[1.0],
            efermi=0.0,
            atom_count=2,
        )


@pytest.mark.parametrize(
    ("parameters", "message"),
    [
        ({"ISPIN": 2}, "ISPIN = 1"),
        ({"ISPIN": 1, "LSORBIT": True}, "LSORBIT"),
        ({"ISPIN": 1, "LNONCOLLINEAR": ".TRUE."}, "LNONCOLLINEAR"),
    ],
)
def test_unsupported_calculation_modes_are_rejected(
    parameters: dict[str, object], message: str
) -> None:
    with pytest.raises(IprReadError, match=message):
        ipr_module._validate_calculation_mode(SimpleNamespace(parameters=parameters))


def test_compute_ipr_parses_once_and_keeps_final_structure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = _structure()
    fake = SimpleNamespace(
        parameters={"ISPIN": 1, "LSORBIT": False, "LNONCOLLINEAR": False},
        projected_eigenvalues={1: np.array([[[[0.7], [0.3]]]])},
        eigenvalues={1: np.array([[[5.0, 1.0]]])},
        actual_kpoints_weights=[1.0],
        final_structure=structure,
        efermi=4.0,
        tdos=SimpleNamespace(energies=[3.0, 4.0], densities={1: [2.0, 3.0]}),
    )
    calls = 0

    def fake_parse(payload: bytes) -> object:
        nonlocal calls
        assert payload == b"vasprun"
        calls += 1
        return fake

    monkeypatch.setattr(ipr_module, "_parse_vasprun", fake_parse)
    data = compute_ipr(b"vasprun")

    assert calls == 1
    assert data.structure is structure
    assert data.elements == ("H", "He")
    assert data.dos == {"energy": [-1.0, 0.0], "total": [2.0, 3.0]}
    assert data.states[0].energy == pytest.approx(1.0)


def _structure() -> Structure:
    return Structure(
        Lattice.cubic(3.0),
        ["H", "He"],
        [[0.0, 0.0, 0.0], [0.5, 0.5, 0.5]],
    )
