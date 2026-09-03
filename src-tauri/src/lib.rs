use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use futures_util::StreamExt;

/// 应用数据根目录（setup 时确定，供命令读取）
struct DataRoot(PathBuf);

/// 默认数据库文件位置：<数据根目录>/passwords.db
fn default_db_path(app: &AppHandle) -> PathBuf {
    match app.try_state::<DataRoot>() {
        Some(root) => root.0.join("passwords.db"),
        None => PathBuf::from("passwords.db"),
    }
}

/// 前端获取默认数据库路径（设置界面展示用）
#[tauri::command]
fn get_default_db_path(app: AppHandle) -> String {
    default_db_path(&app).to_string_lossy().to_string()
}

/// 读取数据库文件字节（文件不存在返回 null）
#[tauri::command]
fn read_db_file(path: String) -> Result<Option<Vec<u8>>, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(None);
    }
    fs::read(&p).map(Some).map_err(|e| e.to_string())
}

/// 原子写入数据库文件：先写临时文件再改名，避免写入中断损坏数据
#[tauri::command]
fn write_db_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// 备份快照文件元信息（v2.2.0 自动备份）
#[derive(serde::Serialize)]
struct BackupFileInfo {
    name: String,
    size: u64,
    mtime_ms: i64,
}

/// 备份快照目录：<数据根目录>/backups
#[tauri::command]
fn get_backups_dir(app: AppHandle) -> String {
    let dir = match app.try_state::<DataRoot>() {
        Some(root) => root.0.join("backups"),
        None => PathBuf::from("backups"),
    };
    let _ = fs::create_dir_all(&dir);
    dir.to_string_lossy().to_string()
}

/// 列出目录内指定后缀的文件（按修改时间降序由前端排序，此处保持任意序）
#[tauri::command]
fn list_dir_files(dir: String, ext: String) -> Result<Vec<BackupFileInfo>, String> {
    let p = PathBuf::from(&dir);
    if !p.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&p).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let matches_ext = if ext.is_empty() {
            true
        } else {
            path.extension().map(|e| e.to_string_lossy().eq_ignore_ascii_case(&ext)).unwrap_or(false)
        };
        if !matches_ext {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(BackupFileInfo { name, size: meta.len(), mtime_ms });
    }
    Ok(out)
}

/// 删除文件（用于备份滚动清理；不存在视为成功）
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(());
    }
    fs::remove_file(&p).map_err(|e| e.to_string())
}

/// 弹出保存对话框，让用户选择数据库文件的新位置
#[tauri::command]
async fn pick_db_path(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("选择数据库文件位置")
        .set_file_name("passwords.db")
        .add_filter("SQLite 数据库", &["db"])
        .save_file(move |f| {
            let _ = tx.send(f.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p.to_string_lossy().to_string()),
                _ => None,
            }));
        });
    Ok(rx.await.unwrap_or(None))
}

/// 导出：保存对话框选择目标位置，复制当前数据库文件过去
#[tauri::command]
async fn export_db(app: AppHandle, src_path: String) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("导出数据库副本")
        .set_file_name("passwords.db")
        .add_filter("SQLite 数据库", &["db"])
        .save_file(move |f| {
            let _ = tx.send(f.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p),
                _ => None,
            }));
        });
    let dest = rx.await.unwrap_or(None);
    if let Some(dest) = dest {
        fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
        Ok(Some(dest.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// 导出 JSON 备份：保存对话框选择位置并写入文本
#[tauri::command]
async fn export_json(app: AppHandle, contents: String) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("导出 JSON 备份")
        .set_file_name("passbook-backup.json")
        .add_filter("JSON 文件", &["json"])
        .save_file(move |f| {
            let _ = tx.send(f.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p),
                _ => None,
            }));
        });
    let dest = rx.await.unwrap_or(None);
    if let Some(dest) = dest {
        fs::write(&dest, &contents).map_err(|e| e.to_string())?;
        Ok(Some(dest.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// 导入：打开对话框选择文件（.db/.csv/.json/.txt），读取字节返回给前端解析
#[tauri::command]
async fn pick_import_db(app: AppHandle) -> Result<Option<ImportFile>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("选择要导入的文件")
        .add_filter("密码本支持的数据文件", &["db", "csv", "json", "txt"])
        .pick_file(move |f| {
            let _ = tx.send(f.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p),
                _ => None,
            }));
        });
    let picked = rx.await.unwrap_or(None);
    if let Some(p) = picked {
        let bytes = fs::read(&p).map_err(|e| e.to_string())?;
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        Ok(Some(ImportFile { name, bytes }))
    } else {
        Ok(None)
    }
}

/// 导入文件载荷：文件名 + 字节
#[derive(serde::Serialize)]
struct ImportFile {
    name: String,
    bytes: Vec<u8>,
}

/// 前端诊断日志（转发到 stderr）
#[tauri::command]
fn log_front(msg: String) {
    eprintln!("[front] {msg}");
}

/// 全局中止标志：AI 流式输出时用户点击「停止」，
/// 前端 invoke agent_abort()，agent_http_stream 循环退出并 emit done。
static AGENT_ABORT: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn agent_abort() {
    AGENT_ABORT.store(true, Ordering::SeqCst);
}

/// 注入到每个页面的诊断脚本：把页面错误报回 Rust 侧（仅桌面端注入）
#[cfg(desktop)]
const DIAG_SCRIPT: &str = r#"
(function () {
  var send = function (m) {
    try { window.__TAURI_INTERNALS__.invoke('log_front', { msg: m }); } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    send('onerror: ' + (e.message || '(no message)') + ' at ' + (e.filename || '') + ':' + (e.lineno || 0) + (e.error && e.error.stack ? '\n' + e.error.stack : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    send('unhandledrejection: ' + (e.reason && (e.reason.message || e.reason) ));
  });
  window.addEventListener('DOMContentLoaded', function () {
    send('DOMContentLoaded url=' + location.href + ' readyState=' + document.readyState);
  });
  setTimeout(function () {
    send('init-script ok url=' + location.href + ' hasTAURI=' + (!!window.__TAURI__) + ' hasINTERNALS=' + (!!window.__TAURI_INTERNALS__));
  }, 1500);
})();
"#;

/// AI 助理 HTTP 代理：桌面版 WebView 无 CORS 限制地访问用户配置的 OpenAI 兼容渠道
#[derive(serde::Serialize)]
struct AgentHttpResponse {
    status: u16,
    body: String,
}

#[tauri::command]
async fn agent_http(
    url: String,
    method: String,
    headers: serde_json::Value,
    body: Option<String>,
) -> Result<AgentHttpResponse, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http(s) 地址".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(m, &url);
    if let Some(map) = headers.as_object() {
        for (k, v) in map {
            if let Some(vs) = v.as_str() {
                req = req.header(k.as_str(), vs);
            }
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(AgentHttpResponse { status, body: text })
}

/// AI 助理 HTTP 流式代理：逐块读取响应并通过 Tauri 事件推给前端（SSE 流式输出）。
/// 事件：agent-stream-status(状态码) / agent-stream-chunk(文本块) / agent-stream-done / agent-stream-error(错误文本)
#[tauri::command]
async fn agent_http_stream(
    app: tauri::AppHandle,
    url: String,
    method: String,
    headers: serde_json::Value,
    body: Option<String>,
) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅支持 http(s) 地址".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let m = reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client.request(m, &url);
    if let Some(map) = headers.as_object() {
        for (k, v) in map {
            if let Some(vs) = v.as_str() {
                req = req.header(k.as_str(), vs);
            }
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit("agent-stream-error", e.to_string());
            return Err(e.to_string());
        }
    };
    let status = resp.status().as_u16();
    let _ = app.emit("agent-stream-status", status);
    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        let _ = app.emit("agent-stream-error", err_text);
        return Ok(());
    }
    // 重置中止标志：本轮取消不干扰后续请求
    AGENT_ABORT.store(false, Ordering::SeqCst);
    // 增量 UTF-8 解码：网络分块可能从多字节字符中间切开，
    // 不能直接 String::from_utf8(整块)（失败会整块丢弃 → 手机端"不流式"）。
    let mut pending: Vec<u8> = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        // 用户点击「停止」时提前退出
        if AGENT_ABORT.load(Ordering::SeqCst) {
            break;
        }
        match chunk {
            Ok(bytes) => {
                pending.extend_from_slice(&bytes);
                // 找出最长的完整 UTF-8 前缀（第一个无效字节之前都是合法前缀）
                let valid = match std::str::from_utf8(&pending) {
                    Ok(_) => pending.len(),
                    Err(e) => e.valid_up_to(),
                };
                if valid > 0 {
                    let s = String::from_utf8_lossy(&pending[..valid]).to_string();
                    let _ = app.emit("agent-stream-chunk", s);
                    pending.drain(..valid);
                }
            }
            Err(e) => {
                let _ = app.emit("agent-stream-error", e.to_string());
                return Ok(());
            }
        }
    }
    // 流结束：flush 剩余字节（正常时尾部是完整字符；异常时用 lossy 兜底）
    if !pending.is_empty() {
        let s = String::from_utf8_lossy(&pending).to_string();
        let _ = app.emit("agent-stream-chunk", s);
    }
    let _ = app.emit("agent-stream-done", ());
    Ok(())
}

// mobile 入口宏：生成 Android 端 Rust.create() 等所需的 JNI 符号，缺失会导致启动即闪退
//（windows_subsystem 已在 main.rs 以 crate 级别设置，不需要在此重复）
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 应用数据根目录：优先 PASSBOOK_DATA_DIR 环境变量；
            // 桌面端未设置时默认用 exe 所在目录（便携式，不写 C 盘）；
            //   若 exe 目录不可写（如装在 Program Files），则回退系统 app data。
            // Android 用应用内部存储（不涉及 C 盘）。
            #[cfg(desktop)]
            let root = {
                let from_env = std::env::var_os("PASSBOOK_DATA_DIR").map(PathBuf::from);
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()));
                if let Some(dir) = from_env.or(exe_dir) {
                    let probe = dir.join(".pbwrite-test");
                    if std::fs::write(&probe, b"1").is_ok() {
                        let _ = std::fs::remove_file(&probe);
                        dir
                    } else {
                        app.path().app_data_dir().map_err(|e| e.to_string())?
                    }
                } else {
                    app.path().app_data_dir().map_err(|e| e.to_string())?
                }
            };
            #[cfg(mobile)]
            let root = match std::env::var_os("PASSBOOK_DATA_DIR") {
                Some(dir) => PathBuf::from(dir),
                None => app.path().app_data_dir().map_err(|e| e.to_string())?,
            };
            std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
            app.manage(DataRoot(root.clone()));

            // 主窗口：桌面与移动端都显式创建（移动端挂到当前 Activity 上）
            #[allow(unused_mut)]
            let mut wb = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("密码本");

            // 桌面端专属：尺寸/居中 + WebView2 数据收敛到应用专属目录
            #[cfg(desktop)]
            {
                let wv_dir = root.join("webview2");
                std::fs::create_dir_all(&wv_dir).map_err(|e| e.to_string())?;
                std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &wv_dir);
                wb = wb
                    .inner_size(1000.0, 720.0)
                    .min_inner_size(520.0, 600.0)
                    .center()
                    .data_directory(wv_dir)
                    .initialization_script(DIAG_SCRIPT);
            }

            match wb.build() {
                Ok(w) => { eprintln!("[passbook] window created: {}", w.label()); }
                Err(e) => { eprintln!("[passbook] window build error: {e}"); return Err(e.to_string().into()); }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_default_db_path,
            read_db_file,
            write_db_file,
            pick_db_path,
            export_db,
            export_json,
            pick_import_db,
            get_backups_dir,
            list_dir_files,
            delete_file,
            agent_http,
            agent_http_stream,
            agent_abort,
            log_front
        ]);

    // 单实例（重复启动聚焦已有窗口）仅桌面端可用
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running passbook desktop");
}
