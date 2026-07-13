from __future__ import annotations

import secrets

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

API_TOKEN_HEADER = "x-pretty-lattice-token"


class ApiTokenMiddleware:
    """Reject /api requests that do not carry the shared token.

    The desktop build talks to a local HTTP server, which every other process on the
    machine can also reach. The token is generated per launch and handed to the webview
    by the Tauri shell, so only that window can drive the API.

    This is a raw ASGI middleware rather than a BaseHTTPMiddleware subclass so that
    large uploads (CHGCAR grids run to hundreds of MB) keep streaming instead of being
    buffered in memory.
    """

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self.token = token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        provided = Headers(scope=scope).get(API_TOKEN_HEADER, "")
        if not secrets.compare_digest(provided, self.token):
            response = JSONResponse(
                {"detail": "Invalid or missing API token."},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
