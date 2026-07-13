# PyInstaller spec for the desktop sidecar: the Pretty Lattice API server, frozen so that
# the desktop app does not require a Python install.
#
# Built as a directory (not a one-file archive) on purpose. A one-file build unpacks the
# whole bundle into a temp directory on every launch, and this bundle is large enough that
# doing so would add seconds to every cold start.
#
# Run it through scripts/build_sidecar.py rather than calling pyinstaller directly.

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files

PROJECT_ROOT = Path(SPECPATH).parent

PACKAGE_DATA = PROJECT_ROOT / "src" / "pretty_lattice" / "structures"

datas = [
    # Read at import time through importlib.resources, so PyInstaller does not pick them up
    # by following imports. Note that web_static/ is deliberately left out: the desktop app
    # serves the frontend itself, and the frozen server only answers API calls.
    (str(PACKAGE_DATA / "scene_contract.json"), "pretty_lattice/structures"),
    (str(PACKAGE_DATA / "covalent_radii.json"), "pretty_lattice/structures"),
    # pymatgen ships its element data, ionic radii and bond lengths as package data files;
    # without these it cannot even build a Structure.
    *collect_data_files("pymatgen"),
    *collect_data_files("spglib"),
]

hiddenimports = [
    # Imported inside functions rather than at module scope, so the static analysis that
    # PyInstaller does cannot see them.
    "pymatgen.io.vasp.outputs",  # XDATCAR trajectories
    "pymatgen.io.lammps.outputs",  # LAMMPS dump trajectories
    "skimage.measure",  # marching cubes for CHGCAR/ELFCAR isosurfaces
    "fastatomstruct",  # MSD / ALTBC dynamics
    # uvicorn picks its event loop and protocol implementations by name at runtime.
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
]

excludes = [
    # Transitive pymatgen dependencies that none of the server's code paths reach. Together
    # they are around 100 MB of the bundle. Verified by importing every module the server
    # can reach, including the lazy ones, and checking what actually lands in sys.modules.
    #
    # pandas and ase are deliberately NOT excluded: pymatgen's LAMMPS dump reader is built
    # on pandas, and ase is reachable from the trajectory readers.
    "matplotlib",
    "plotly",
    "sympy",
    "IPython",
    "tkinter",
    "h5py",
    "pytest",
]

a = Analysis(
    [str(PROJECT_ROOT / "src" / "pretty_lattice" / "desktop.py")],
    pathex=[str(PROJECT_ROOT / "src")],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="prl-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    # Must stay a console program: the desktop shell reads the handshake line from stdout.
    # On Windows, Tauri spawns it with CREATE_NO_WINDOW, so no console window appears.
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="prl-server",
)
