use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeLogEvent {
    stream: String,
    message: String,
    timestamp: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeState {
    pub status: String,
    pub version: String,
    pub source: String,
    pub binary_path: String,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
}

pub struct RuntimeManager {
    pub child: Mutex<Option<Child>>,
    pub state: Mutex<RuntimeState>,
}

impl Drop for RuntimeManager {
    fn drop(&mut self) {
        if let Ok(child_slot) = self.child.get_mut() {
            if let Some(mut child) = child_slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Default for RuntimeManager {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            state: Mutex::new(RuntimeState {
                status: "stopped".into(),
                version: "unknown".into(),
                source: "local".into(),
                binary_path: String::new(),
                pid: None,
                started_at: None,
            }),
        }
    }
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|error| format!("读取文件失败：{error}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("文件路径不能为空".into());
    }
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;
        }
    }
    std::fs::write(&path, contents).map_err(|error| format!("写入文件失败：{error}"))
}

#[tauri::command]
fn get_runtime_state(manager: State<'_, RuntimeManager>) -> Result<RuntimeState, String> {
    manager
        .state
        .lock()
        .map(|state| state.clone())
        .map_err(|_| "runtime state lock poisoned".into())
}

#[tauri::command]
fn start_gost(
    binary_path: String,
    config_path: String,
    manager: State<'_, RuntimeManager>,
    app: AppHandle,
) -> Result<RuntimeState, String> {
    if binary_path.trim().is_empty() {
        return Err("请先在设置中指定 GOST 二进制文件路径".into());
    }
    if config_path.trim().is_empty() {
        return Err("配置文件路径不能为空".into());
    }

    let mut child_slot = manager.child.lock().map_err(|_| "runtime lock poisoned")?;
    if let Some(child) = child_slot.as_mut() {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            let state = manager
                .state
                .lock()
                .map_err(|_| "runtime state lock poisoned")?;
            return Ok(state.clone());
        }
    }

    let mut child = Command::new(&binary_path)
        .arg("-C")
        .arg(&config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 GOST 失败：{error}"))?;

    let pid = child.id();
    if let Some(stdout) = child.stdout.take() {
        forward_logs(app.clone(), "stdout", stdout);
    }
    if let Some(stderr) = child.stderr.take() {
        forward_logs(app.clone(), "stderr", stderr);
    }
    *child_slot = Some(child);
    let mut state = manager
        .state
        .lock()
        .map_err(|_| "runtime state lock poisoned")?;
    state.status = "running".into();
    state.binary_path = binary_path;
    state.pid = Some(pid);
    state.started_at = Some(chrono_like_now());
    Ok(state.clone())
}

#[tauri::command]
fn stop_gost(manager: State<'_, RuntimeManager>) -> Result<RuntimeState, String> {
    let mut child_slot = manager.child.lock().map_err(|_| "runtime lock poisoned")?;
    if let Some(mut child) = child_slot.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    let mut state = manager
        .state
        .lock()
        .map_err(|_| "runtime state lock poisoned")?;
    state.status = "stopped".into();
    state.pid = None;
    Ok(state.clone())
}

fn forward_logs<R>(app: AppHandle, stream: &'static str, reader: R)
where
    R: std::io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let _ = app.emit(
                "gost-log",
                RuntimeLogEvent {
                    stream: stream.into(),
                    message: line,
                    timestamp: chrono_like_now(),
                },
            );
        }
    });
}

fn chrono_like_now() -> String {
    // Keep the core shell dependency-free. The UI treats this as an opaque timestamp.
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RuntimeManager::default())
        .invoke_handler(tauri::generate_handler![
            get_runtime_state,
            start_gost,
            stop_gost,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running GOST Studio");
}
