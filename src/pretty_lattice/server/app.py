from __future__ import annotations

from importlib import resources
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from pretty_lattice.server.routes import router
from pretty_lattice.server.security import ApiTokenMiddleware


def create_app(
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
    api_token: str | None = None,
    allow_origins: list[str] | None = None,
) -> FastAPI:
    """Build the app.

    `prl gui` calls this with no token and no extra origins: the page is served from the
    same origin as the API, so neither is needed. The desktop shell passes both, because
    there the webview is a foreign origin talking to a local port.
    """
    app = FastAPI(title="Pretty Lattice", version="0.1.0")

    # Starlette runs the last-added middleware outermost. Add the token guard first so
    # CORS ends up wrapping it, otherwise a 401 comes back without CORS headers and the
    # webview reports an opaque network failure instead of the real status.
    if api_token is not None:
        app.add_middleware(ApiTokenMiddleware, token=api_token)

    if allow_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allow_origins,
            allow_credentials=False,
            allow_methods=["*"],
            # Allow any request header. The webview sends the API token plus per-request
            # headers such as x-pretty-lattice-filename, and a preflight that omits any one
            # of them is rejected by the browser before the real request is ever sent.
            # Safe here because credentials are disabled and the only allowed origin is the
            # app's own webview.
            allow_headers=["*"],
        )

    app.include_router(router, prefix="/api")
    _mount_static_web(app, static_root=static_root, dev_static_fallback=dev_static_fallback)
    return app


def _mount_static_web(
    app: FastAPI,
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
) -> None:
    resolved_static_root = _resolve_static_root(
        static_root,
        dev_static_fallback=dev_static_fallback,
    )

    if resolved_static_root is None:
        _mount_missing_web_page(app)
        return

    assets_root = resolved_static_root / "assets"
    index_file = resolved_static_root / "index.html"

    if assets_root.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_root), name="assets")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        static_file = _resolve_static_file(resolved_static_root, path)
        if static_file is not None:
            return FileResponse(static_file)
        if path == "favicon.ico":
            raise HTTPException(status_code=404)
        return FileResponse(index_file)


def _resolve_static_root(
    static_root: Path | None = None,
    dev_static_fallback: bool = True,
) -> Path | None:
    candidates: list[Path] = []
    if static_root is not None:
        candidates.append(static_root)

    candidates.append(Path(str(resources.files("pretty_lattice") / "web_static")))
    if dev_static_fallback:
        candidates.extend(_dev_static_candidates())

    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate

    return None


def _resolve_static_file(static_root: Path, path: str) -> Path | None:
    root = static_root.resolve()
    candidate = (root / path).resolve()
    if not candidate.is_relative_to(root):
        return None
    if candidate.is_file():
        return candidate
    return None


def _dev_static_candidates() -> list[Path]:
    current_file = Path(__file__).resolve()
    roots = [Path.cwd(), *Path.cwd().parents, current_file, *current_file.parents]
    candidates: list[Path] = []
    seen: set[Path] = set()

    for root in roots:
        candidate = root / "web" / "dist"
        if candidate not in seen:
            seen.add(candidate)
            candidates.append(candidate)

    return candidates


def _mount_missing_web_page(app: FastAPI) -> None:
    @app.get("/", include_in_schema=False)
    def missing_web() -> HTMLResponse:
        return HTMLResponse(
            """
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Pretty Lattice</title>
                <style>
                  body {
                    margin: 0;
                    font-family:
                      ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
                      "Segoe UI", sans-serif;
                    color: #22272e;
                    background: #f7f8f4;
                  }
                  main {
                    display: grid;
                    min-height: 100vh;
                    place-items: center;
                    padding: 24px;
                  }
                  section {
                    width: min(620px, 100%);
                    border: 1px solid rgb(34 39 46 / 0.12);
                    border-radius: 8px;
                    background: white;
                    padding: 24px;
                    box-shadow: 0 18px 44px rgb(34 39 46 / 0.12);
                  }
                  h1 {
                    margin: 0 0 12px;
                    font-size: 1.4rem;
                  }
                  p {
                    margin: 0 0 14px;
                    color: #4f5b66;
                    line-height: 1.55;
                  }
                  code {
                    display: block;
                    margin-top: 10px;
                    padding: 10px 12px;
                    border-radius: 6px;
                    background: #f0f3f4;
                    color: #22272e;
                    white-space: pre-wrap;
                  }
                </style>
              </head>
              <body>
                <main>
                  <section>
                    <h1>Pretty Lattice frontend is not built</h1>
                    <p>The Python API is running, but no bundled web app was found.</p>
                    <p>For the built GUI, run:</p>
                    <code>cd web
bun run build
cd ..
uv run prl gui</code>
                    <p>For live frontend development, run the Python API and Vite separately:</p>
                    <code>uv run prl gui --no-open
cd web && bun run dev</code>
                  </section>
                </main>
              </body>
            </html>
            """,
            status_code=503,
        )

    @app.get("/{path:path}", include_in_schema=False)
    def missing_web_fallback(path: str) -> HTMLResponse:
        return missing_web()
