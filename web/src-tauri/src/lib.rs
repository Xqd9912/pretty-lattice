//! Desktop shell for Pretty Lattice.
//!
//! The analysis backend is the same Python/FastAPI server that `prl gui` runs. It cannot
//! move into Rust or into the webview, because it is built on pymatgen, numpy and numba.
//! So the shell runs it as a child process ("sidecar") and brokers the connection:
//!
//!   1. spawn the server, which binds a free port and mints a one-off API token,
//!   2. read those back from its first stdout line,
//!   3. wait until the port actually accepts connections,
//!   4. create the main window with the address and token injected into the page,
//!   5. kill the server when the app exits.
//!
//! A splash window covers steps 1-3, which take a few seconds mostly because importing
//! pymatgen is slow.

use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The server prints exactly one line with this prefix once it knows its own address.
const HANDSHAKE_PREFIX: &str = "PRETTY_LATTICE_READY ";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(90);
const LISTEN_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Deserialize)]
struct Handshake {
    host: String,
    port: u16,
    token: String,
}

impl Handshake {
    fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }
}

/// The running server, kept so that it can be stopped when the app exits.
#[derive(Default)]
struct Sidecar(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Sidecar::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(message) = start_backend(&handle).await {
                    report_failure(&handle, &message);
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Pretty Lattice desktop app");

    app.run(|app, event| {
        // Without this the Python process outlives the window and keeps holding its port.
        if let RunEvent::Exit = event {
            if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}

async fn start_backend(app: &AppHandle) -> Result<(), String> {
    let (mut events, child) = spawn_server(app)?;
    app.state::<Sidecar>().0.lock().unwrap().replace(child);

    let handshake = read_handshake(&mut events).await?;
    wait_until_listening(&handshake).await?;
    open_main_window(app, &handshake)?;

    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }

    Ok(())
}

/// In a release build the server is a frozen binary shipped inside the app. In development
/// it runs straight from the working tree, so that changing Python code does not mean
/// re-freezing a binary first.
fn spawn_server(
    app: &AppHandle,
) -> Result<(tauri::async_runtime::Receiver<CommandEvent>, CommandChild), String> {
    #[cfg(debug_assertions)]
    let command = {
        let repo_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .map_err(|error| format!("Could not locate the project root: {error}"))?;

        app.shell()
            .command("uv")
            .current_dir(repo_root)
            .args(["run", "python", "-m", "pretty_lattice.desktop"])
    };

    // The frozen server is a directory (executable plus its libraries), so it ships as an
    // app resource rather than as a Tauri "external binary", which only handles lone files.
    #[cfg(not(debug_assertions))]
    let command = {
        let executable = app
            .path()
            .resource_dir()
            .map_err(|error| format!("Could not locate the app resources: {error}"))?
            .join("binaries/prl-server")
            .join(if cfg!(windows) {
                "prl-server.exe"
            } else {
                "prl-server"
            });

        if !executable.is_file() {
            return Err(format!(
                "The bundled analysis engine is missing at {}.",
                executable.display()
            ));
        }

        app.shell().command(executable)
    };

    command
        .spawn()
        .map_err(|error| format!("The analysis engine failed to start: {error}"))
}

async fn read_handshake(
    events: &mut tauri::async_runtime::Receiver<CommandEvent>,
) -> Result<Handshake, String> {
    let deadline = Instant::now() + HANDSHAKE_TIMEOUT;

    loop {
        if Instant::now() > deadline {
            return Err("The analysis engine did not report itself ready in time.".into());
        }

        let Some(event) = events.recv().await else {
            return Err("The analysis engine stopped before it was ready.".into());
        };

        match event {
            CommandEvent::Stdout(line) => {
                let line = String::from_utf8_lossy(&line);
                let Some(payload) = line.trim().strip_prefix(HANDSHAKE_PREFIX) else {
                    continue;
                };
                return serde_json::from_str::<Handshake>(payload).map_err(|error| {
                    format!("The analysis engine sent an address we could not read: {error}")
                });
            }
            // uvicorn logs to stderr; forward it so that a failed launch is diagnosable.
            CommandEvent::Stderr(line) => {
                eprint!("[prl-server] {}", String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(status) => {
                return Err(format!(
                    "The analysis engine exited before it was ready (code {}).",
                    status
                        .code
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "unknown".into())
                ));
            }
            _ => {}
        }
    }
}

/// The handshake is printed as soon as the address is known, a moment before the server is
/// actually accepting. Connecting is enough to tell the difference: a socket that is bound
/// but not yet listening refuses the connection.
async fn wait_until_listening(handshake: &Handshake) -> Result<(), String> {
    let address = format!("{}:{}", handshake.host, handshake.port);

    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + LISTEN_TIMEOUT;
        let target = address
            .parse()
            .map_err(|error| format!("The analysis engine reported a bad address: {error}"))?;

        while Instant::now() < deadline {
            if TcpStream::connect_timeout(&target, Duration::from_millis(500)).is_ok() {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        Err("The analysis engine never started listening.".to_string())
    })
    .await
    .map_err(|error| format!("Could not wait for the analysis engine: {error}"))?
}

fn open_main_window(app: &AppHandle, handshake: &Handshake) -> Result<(), String> {
    // The page is loaded from the app, not from the server, so it has no way to guess the
    // server's address. Hand it over before any application code runs.
    let config = serde_json::json!({
        "baseUrl": handshake.base_url(),
        "token": handshake.token,
    });

    WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("Pretty Lattice")
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 640.0)
        .center()
        .initialization_script(&format!("window.__PRETTY_LATTICE_API__ = {config};"))
        .build()
        .map_err(|error| format!("Could not open the main window: {error}"))?;

    Ok(())
}

/// Turn the splash into an error card rather than leaving it spinning forever.
fn report_failure(app: &AppHandle, message: &str) {
    eprintln!("[pretty-lattice] startup failed: {message}");

    let Some(splash) = app.get_webview_window("splash") else {
        return;
    };

    let text = serde_json::to_string(message).unwrap_or_else(|_| "\"Startup failed.\"".into());
    let _ = splash.eval(&format!(
        r#"
        const status = document.querySelector('[data-role="status"]');
        const track = document.querySelector('[data-role="track"]');
        if (status) {{
          status.textContent = {text};
          status.dataset.failed = "true";
        }}
        if (track) {{
          track.dataset.failed = "true";
        }}
        "#
    ));
}
