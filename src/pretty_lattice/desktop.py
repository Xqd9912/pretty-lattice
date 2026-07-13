"""Entry point for the desktop sidecar process.

The Tauri shell spawns this program, reads a single handshake line from stdout to learn
which port to talk to and which token to send, then waits for /api/health before showing
the window. Nothing else is printed to stdout, so the shell can parse the line by prefix.

This is a separate entry point from `prl gui` on purpose: the GUI command serves the page
and the API from one origin and opens a browser, while the sidecar only serves the API and
lets the native window own the UI.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import sys
import threading

import uvicorn

from pretty_lattice.server.app import create_app

HANDSHAKE_PREFIX = "PRETTY_LATTICE_READY "

# The webview's origin, which is what the API sees in the Origin header. macOS and Linux
# serve the bundled app from a custom scheme; Windows (WebView2) cannot register one and
# uses an http:// host instead. The 127.0.0.1:5173 entries are the Vite dev server, used
# when running `tauri dev` against a debug build.
TAURI_ORIGINS = [
    "tauri://localhost",
    "http://tauri.localhost",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]


def main(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    token = secrets.token_urlsafe(32)

    # Bind before announcing, and hand the bound socket to uvicorn, so that no other
    # process can claim the port between us picking it and the server listening on it.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((args.host, args.port))
    port = int(sock.getsockname()[1])

    app = create_app(api_token=token, allow_origins=TAURI_ORIGINS)

    _announce(host=args.host, port=port, token=token)
    _exit_when_parent_dies()

    config = uvicorn.Config(app, log_level=args.log_level, access_log=False)
    uvicorn.Server(config).run(sockets=[sock])


def _exit_when_parent_dies() -> None:
    """Shut down if the desktop shell goes away.

    The shell kills this process on a normal quit, but a crash or a hard kill of the shell
    would otherwise leave us running and holding the port. The shell talks to us over a
    pipe, so when it dies our stdin reaches end-of-file; a blocking read is the simplest
    portable way to notice. Skipped when stdin is not a pipe, e.g. when run by hand.
    """
    if sys.stdin is None or not hasattr(sys.stdin, "fileno"):
        return

    try:
        fd = sys.stdin.fileno()
    except (OSError, ValueError):
        return

    def watch() -> None:
        try:
            while os.read(fd, 4096):
                pass
        except OSError:
            pass
        os._exit(0)

    threading.Thread(target=watch, name="parent-watchdog", daemon=True).start()


def _announce(*, host: str, port: int, token: str) -> None:
    payload = json.dumps({"host": host, "port": port, "token": token})
    sys.stdout.write(f"{HANDSHAKE_PREFIX}{payload}\n")
    sys.stdout.flush()


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pretty Lattice desktop API sidecar.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Port to bind. Defaults to 0, which lets the OS pick a free one.",
    )
    parser.add_argument("--log-level", default="warning")
    return parser.parse_args(argv)


if __name__ == "__main__":
    main()
