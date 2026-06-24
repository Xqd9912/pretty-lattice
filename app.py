from pathlib import Path

from pretty_lattice.server.app import create_app


app = create_app(static_root=Path(__file__).resolve().parent / "web" / "dist")
