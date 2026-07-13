"""Freeze the Pretty Lattice API server for the desktop app.

The desktop shell spawns the server as a child process. Users of the desktop app have no
Python install, so the server is frozen with PyInstaller and shipped inside the app bundle.

    uv run --group desktop python scripts/build_sidecar.py

The result lands in web/src-tauri/binaries/prl-server/, which is where tauri.conf.json
picks it up as an app resource. PyInstaller cannot cross-compile, so this has to run on
each platform you intend to ship.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SPEC_FILE = PROJECT_ROOT / "packaging" / "prl_server.spec"
BUILD_ROOT = PROJECT_ROOT / "build" / "sidecar"
DIST_ROOT = BUILD_ROOT / "dist"
TARGET_DIR = PROJECT_ROOT / "web" / "src-tauri" / "binaries" / "prl-server"

EXECUTABLE_NAME = "prl-server.exe" if sys.platform == "win32" else "prl-server"


def main() -> None:
    args = parse_args()

    run_pyinstaller(clean=args.clean)
    frozen = DIST_ROOT / "prl-server"
    verify_frozen(frozen)
    install(frozen)

    if not args.skip_smoke_test:
        smoke_test(TARGET_DIR / EXECUTABLE_NAME)

    print(f"\nSidecar ready at {TARGET_DIR.relative_to(PROJECT_ROOT)} ({directory_size(TARGET_DIR)})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Discard PyInstaller's caches before building.",
    )
    parser.add_argument(
        "--skip-smoke-test",
        action="store_true",
        help="Do not launch the frozen server to check that it starts.",
    )
    return parser.parse_args()


def run_pyinstaller(*, clean: bool) -> None:
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(SPEC_FILE),
        "--distpath",
        str(DIST_ROOT),
        "--workpath",
        str(BUILD_ROOT / "work"),
        "--noconfirm",
    ]
    if clean:
        command.append("--clean")

    print(f"$ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=PROJECT_ROOT, check=True)


def verify_frozen(frozen: Path) -> None:
    executable = frozen / EXECUTABLE_NAME
    if not executable.is_file():
        raise SystemExit(f"PyInstaller did not produce {executable}")


def install(frozen: Path) -> None:
    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)
    TARGET_DIR.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(frozen, TARGET_DIR)
    print(f"Installed frozen server into {TARGET_DIR.relative_to(PROJECT_ROOT)}", flush=True)


def smoke_test(executable: Path) -> None:
    """Start the frozen server and wait for its handshake line.

    This is the check that matters: a bundle can build cleanly and still fail at startup
    because PyInstaller missed a lazily imported module. Reaching the handshake means the
    whole import graph loaded inside the frozen environment.
    """
    from pretty_lattice.desktop import HANDSHAKE_PREFIX

    print("Smoke-testing the frozen server...", flush=True)
    process = subprocess.Popen(
        [str(executable)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        assert process.stdout is not None
        for line in process.stdout:
            if line.startswith(HANDSHAKE_PREFIX):
                print(f"  handshake OK: {line.strip()}", flush=True)
                return

        stderr = process.stderr.read() if process.stderr else ""
        raise SystemExit(f"Frozen server exited before the handshake.\n{stderr}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def directory_size(path: Path) -> str:
    total = sum(item.stat().st_size for item in path.rglob("*") if item.is_file())
    return f"{total / 1_000_000:.0f} MB"


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
