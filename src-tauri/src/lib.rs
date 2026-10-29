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
    write_db_bytes(&path, &bytes)
}

/// v4.1.1：base64 写库——JSON 数字数组 IPC 随库体积线性变慢（兆级库删除近 10 秒），base64 一次编解码即可
#[tauri::command]
fn write_db_file_b64(path: String, b64: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    write_db_bytes(&path, &bytes)
}

fn write_db_bytes(p_str: &str, bytes: &[u8]) -> Result<(), String> {
    let p = PathBuf::from(p_str);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

/// v4.1.1：base64 读库（同理避免 JSON 数字数组大载荷）
#[tauri::command]
fn read_db_file_b64(path: String) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(Some(
        base64::engine::general_purpose::STANDARD.encode(&bytes),
    ))
}

/// v4.3.0：读取并清空随手记 pending 队列文件（手机快捷方式/分享写入的 JSON 行）。
/// 返回 base64 编码的文件内容（IPC 走 b64 惯例）；读完即清空（消费语义）。
/// 路径双候选：数据根目录与 files/ 子目录（QuickNoteActivity 按 dataDir 根写入）。
#[tauri::command]
fn read_pending_notes(app: AppHandle) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let root = match app.try_state::<DataRoot>() {
        Some(r) => r.0.clone(),
        None => return Ok(None),
    };
    for cand in [
        root.join("pending_quicknotes.jsonl"),
        root.join("files").join("pending_quicknotes.jsonl"),
    ] {
        if cand.exists() {
            let bytes = fs::read(&cand).map_err(|e| e.to_string())?;
            // 清空队列（写入空文件而非删除，避免与原生追加方竞争重建）
            fs::write(&cand, b"").map_err(|e| e.to_string())?;
            if bytes.is_empty() {
                continue;
            }
            return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)));
        }
    }
    Ok(None)
}

/// v4.4.0：读取并清空文件仓 pending 队列（ShareFileActivity/OpenFileActivity 写入的 JSON 行）。
/// 返回 base64 内容；读完清空（消费语义），路径双候选同 read_pending_notes 惯例。
#[tauri::command]
fn read_pending_files(app: AppHandle) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let root = match app.try_state::<DataRoot>() {
        Some(r) => r.0.clone(),
        None => return Ok(None),
    };
    for cand in [
        root.join("pending_files.jsonl"),
        root.join("files").join("pending_files.jsonl"),
    ] {
        if cand.exists() {
            let bytes = fs::read(&cand).map_err(|e| e.to_string())?;
            fs::write(&cand, b"").map_err(|e| e.to_string())?;
            if bytes.is_empty() {
                continue;
            }
            return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)));
        }
    }
    Ok(None)
}

/// v4.3.0：注册/更换桌面随手记全局快捷键（默认 Ctrl+Alt+N，设置里可改）。
/// 触发时读剪贴板 → 弹主窗 → 事件 quicknote-clip（payload=base64 文本）交前端确认入库。
#[cfg(windows)]
#[tauri::command]
fn set_quicknote_shortcut(app: AppHandle, accel: String) -> Result<(), String> {
    use base64::Engine as _;
    use tauri_plugin_clipboard_manager::ClipboardExt;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let gs = app.global_shortcut();
    let _ = gs.unregister_all(); // 更换快捷键：先全部注销
    let shortcut: tauri_plugin_global_shortcut::Shortcut =
        accel.parse().map_err(|e| format!("快捷键格式无效: {e:?}"))?;
    gs.on_shortcut(shortcut, move |app, _s, event| {
        if event.state() == ShortcutState::Pressed {
            let text = app.clipboard().read_text().ok().unwrap_or_default();
            if !text.trim().is_empty() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let b64 = base64::engine::general_purpose::STANDARD.encode(text.as_bytes());
                let _ = app.emit("quicknote-clip", b64);
            }
        }
    })
    .map_err(|e| format!("注册全局快捷键失败: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
fn set_quicknote_shortcut(_app: AppHandle, _accel: String) -> Result<(), String> {
    Ok(()) // 桌面（Windows）专属；移动端无全局快捷键概念
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

/* ---------------- 文件仓（v4.4.0）：加密本体分桶存文件系统，绝不进 SQLite ---------------- */

/// 文件仓存储根目录：<数据根>/files-store；桶内相对路径 <sha256前两位>/<sha256> 由前端 PassFiles.bucketPath 计算
fn files_store_dir(app: &AppHandle) -> PathBuf {
    match app.try_state::<DataRoot>() {
        Some(root) => root.0.join("files-store"),
        None => PathBuf::from("files-store"),
    }
}

/// 前端获取文件仓目录（展示用）
#[tauri::command]
fn get_files_store_dir(app: AppHandle) -> String {
    files_store_dir(&app).to_string_lossy().to_string()
}

/// 写入加密本体（字节 IPC 一律 b64）：sha256 定位桶路径，原子写（先 tmp 再改名）
#[tauri::command]
fn store_blob_write_b64(app: AppHandle, sha256: String, b64: String) -> Result<(), String> {
    use base64::Engine as _;
    let s = sha256.trim().to_lowercase();
    if s.len() != 64 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("sha256 格式非法".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    let rel = PathBuf::from(&s[..2]).join(&s);
    let p = files_store_dir(&app).join(rel);
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

/// 读取加密本体（b64）；不存在返回 null
#[tauri::command]
fn store_blob_read_b64(app: AppHandle, sha256: String) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let s = sha256.trim().to_lowercase();
    let p = files_store_dir(&app).join(PathBuf::from(&s[..2]).join(&s));
    if !p.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

/// 本体是否已存在（sha256 去重：已存在则跳过重写）
#[tauri::command]
fn store_blob_exists(app: AppHandle, sha256: String) -> Result<bool, String> {
    let s = sha256.trim().to_lowercase();
    let p = files_store_dir(&app).join(PathBuf::from(&s[..2]).join(&s));
    Ok(p.exists())
}

/// 物理删除本体（引用计数归零后调用）；返回是否确实删除
#[tauri::command]
fn store_blob_delete(app: AppHandle, sha256: String) -> Result<bool, String> {
    let s = sha256.trim().to_lowercase();
    let p = files_store_dir(&app).join(PathBuf::from(&s[..2]).join(&s));
    if p.exists() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
        // 桶目录空了顺手清掉（忽略失败）
        if let Some(dir) = p.parent() {
            let _ = fs::remove_dir(dir);
        }
        Ok(true)
    } else {
        Ok(false)
    }
}

/// 列出全部本体 sha256（换密钥重加密 / 一致性校验用）
#[tauri::command]
fn store_blob_list(app: AppHandle) -> Result<Vec<String>, String> {
    let root = files_store_dir(&app);
    let mut out = Vec::new();
    if let Ok(dirs) = fs::read_dir(&root) {
        for d in dirs.flatten() {
            if let Ok(files) = fs::read_dir(d.path()) {
                for f in files.flatten() {
                    if let Some(name) = f.file_name().to_str() {
                        if name.len() == 64 && name.chars().all(|c| c.is_ascii_hexdigit()) {
                            out.push(name.to_lowercase());
                        }
                    }
                }
            }
        }
    }
    out.sort();
    Ok(out)
}

/// v4.4.0：多选文件（桌面导入通道，pick_import_db 的泛化多选版，旧命令语义不变）。
/// 返回 [{ name, path, size }]；字节由前端按需 read_file_bytes_b64 逐个读取（b64 IPC）。
#[derive(serde::Serialize)]
struct PickedFile {
    name: String,
    path: String,
    size: u64,
}

#[tauri::command]
async fn pick_files(app: AppHandle) -> Result<Option<Vec<PickedFile>>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("选择要导入文件仓的文件")
        .pick_files(move |fs| {
            let _ = tx.send(fs.and_then(|list| {
                let mut out = Vec::new();
                for fp in list {
                    if let FilePath::Path(p) = fp {
                        out.push(p);
                    }
                }
                if out.is_empty() { None } else { Some(out) }
            }));
        });
    let picked = rx.await.unwrap_or(None);
    match picked {
        None => Ok(None),
        Some(paths) => {
            let mut out = Vec::new();
            for p in paths {
                let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let size = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                out.push(PickedFile { name, path: p.to_string_lossy().to_string(), size });
            }
            Ok(Some(out))
        }
    }
}

/// 读取任意本地文件字节（b64；桌面 pick_files 选中后由前端逐个拉取）
#[tauri::command]
fn read_file_bytes_b64(path: String) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)))
}

/// 解密后预览/系统打开临时文件：<cache>/filehub_tmp/<name>（FileProvider file_paths 覆盖 cache-path filehub_tmp/）
#[tauri::command]
fn filehub_temp_write_b64(app: AppHandle, name: String, b64: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    let dir = app.path().cache_dir().map_err(|e| e.to_string())?.join("filehub_tmp");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 文件名去路径分隔符，防逃逸
    let safe = name.replace(['/', '\\'], "_");
    let p = dir.join(safe);
    fs::write(&p, &bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// 桌面「用系统应用打开」：shell open（Android 走 __passbook_saf.open 原生桥，不经此命令）
#[tauri::command]
#[cfg(windows)]
fn shell_open(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// 非 Windows 平台占位（Android 走 __passbook_saf.open 原生桥，不经此命令）
#[tauri::command]
#[cfg(not(windows))]
fn shell_open(_path: String) -> Result<(), String> {
    Err("此平台不支持系统打开".into())
}

/// v4.4.0：文件仓导出 zip（加密本体 + 清单）——export_bytes 的 b64 版（大数据 IPC 惯例）
#[tauri::command]
async fn export_bytes_b64(app: AppHandle, b64: String, suggested_name: String) -> Result<Option<String>, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| format!("base64 解码失败: {e}"))?;
    export_bytes(app, bytes, suggested_name).await
}

/// 附件等二进制另存为（v2.4.0）：弹保存对话框写文件
#[tauri::command]
async fn export_bytes(app: AppHandle, bytes: Vec<u8>, suggested_name: String) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("保存附件")
        .set_file_name(&suggested_name)
        .save_file(move |f| {
            let _ = tx.send(f.and_then(|fp| match fp {
                FilePath::Path(p) => Some(p),
                _ => None,
            }));
        });
    let dest = rx.await.unwrap_or(None);
    if let Some(dest) = dest {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
        Ok(Some(dest.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
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

/// v3.0.9：Android WebView 外部请求（fetch/img）全被 tauri 拦截层拦截，
/// favicon 改由 reqwest 下载并转 data:URL 注入。限 512KB、超时 8s；
/// content-type image/* 或图片魔数（PNG/GIF/JPEG/ICO）才返回 Some，否则 None。
#[tauri::command]
async fn favicon_fetch(url: String) -> Result<Option<String>, String> {
    fn b64_std(data: &[u8]) -> String {
        const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
        for c in data.chunks(3) {
            let b0 = c[0] as u32;
            let b1 = *c.get(1).unwrap_or(&0) as u32;
            let b2 = *c.get(2).unwrap_or(&0) as u32;
            let n = (b0 << 16) | (b1 << 8) | b2;
            out.push(T[(n >> 18) as usize & 63] as char);
            out.push(T[(n >> 12) as usize & 63] as char);
            out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
            out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
        }
        out
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .danger_accept_invalid_certs(true) // v3.3.7: favicon 是公开资源，放行自签证书站点
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or("").trim().to_ascii_lowercase())
        .unwrap_or_default();
    let bytes = resp.bytes().await.map_err(|e| format!("read body failed: {}", e))?;
    if bytes.is_empty() || bytes.len() > 512 * 1024 {
        return Ok(None);
    }
    let m_png = bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
    let m_gif = bytes.starts_with(&[0x47, 0x49, 0x46, 0x38]);
    let m_jpg = bytes.starts_with(&[0xFF, 0xD8, 0xFF]);
    let m_ico = bytes.starts_with(&[0x00, 0x01, 0x00, 0x00]);
    if !(mime.starts_with("image/") || m_png || m_gif || m_jpg || m_ico) {
        return Ok(None); // HTML 劫持页/非图片内容
    }
    let mime = if mime.starts_with("image/") {
        mime
    } else if m_png {
        "image/png".to_string()
    } else if m_gif {
        "image/gif".to_string()
    } else if m_jpg {
        "image/jpeg".to_string()
    } else {
        "image/x-icon".to_string()
    };
    Ok(Some(format!("data:{};base64,{}", mime, b64_std(&bytes))))
}

/// Android SAF 另存为（v3.0.5）：把字节写入应用缓存临时文件，供 SafSaveActivity 流式拷贝
#[tauri::command]
async fn saf_temp_write(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<String, String> {
    use std::io::Write;
    let dir = app
        .path()
        .cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let _ = std::fs::create_dir_all(&dir);
    let p = dir.join("passbook-saf.tmp");
    let mut f = std::fs::File::create(&p).map_err(|e| e.to_string())?;
    f.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().into_owned())
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
        Ok(Some(ImportFile {
            name,
            b64: {
                use base64::Engine as _;
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            },
        }))
    } else {
        Ok(None)
    }
}

/// 导入文件载荷：文件名 + base64 字节（v4.1.1 改 b64，避免大文件 JSON 数字数组 IPC）
#[derive(serde::Serialize)]
struct ImportFile {
    name: String,
    b64: String,
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

/* ---------------- v4.9.0 自动更新 ----------------
 * 桌面：tauri-plugin-updater（端点 GitHub Releases latest.json，passive 安装，安装器自动重启）
 * Android：GitHub API 查最新 Release → 流式下载 APK 到 cache/filehub_tmp → 原生桥 ACTION_VIEW 安装
 * 私有仓期间：token 以 Authorization 头随检查与下载请求（updater 构建器级 header 两处同生效）
 * 代理策略：先按设置（默认直连），网络层失败自动回退 http://127.0.0.1:7890 重试一次
 */

#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
    date: Option<String>,
}

#[derive(serde::Serialize)]
struct ReleaseInfo {
    tag: String,
    name: Option<String>,
    notes: Option<String>,
    apk_url: Option<String>,
    apk_size: u64,
    html_url: String,
}

/// 暂存待安装更新（update_check 成功后由 update_download_install 消费）
struct PendingUpdate(std::sync::Mutex<Option<tauri_plugin_updater::Update>>);

/// 当前应用版本（前端与 Release tag 比较用）
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 桌面：构建 Updater（token 头 / 代理 / 超时）
#[cfg(desktop)]
fn build_updater(
    app: &AppHandle,
    token: &Option<String>,
    proxy: Option<&str>,
) -> Result<tauri_plugin_updater::Updater, String> {
    use tauri_plugin_updater::UpdaterExt;
    let mut b = app.updater_builder().timeout(std::time::Duration::from_secs(30));
    if let Some(t) = token.as_deref() {
        let t = t.trim();
        if !t.is_empty() {
            b = b
                .header("Authorization", format!("Bearer {t}"))
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(p) = proxy.map(str::trim).filter(|s| !s.is_empty()) {
        let url: tauri::Url = p.parse().map_err(|e| format!("代理地址无效: {e}"))?;
        b = b.proxy(url);
    }
    b.build().map_err(|e| e.to_string())
}

#[cfg(desktop)]
async fn check_with(
    app: &AppHandle,
    token: &Option<String>,
    proxy: Option<String>,
) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let updater = build_updater(app, token, proxy.as_deref())?;
    updater.check().await.map_err(|e| e.to_string())
}

/// 桌面：检查更新（updater 插件全链路：latest.json + 验签比较）；None = 已是最新
#[cfg(desktop)]
#[tauri::command]
async fn update_check(
    app: AppHandle,
    state: tauri::State<'_, PendingUpdate>,
    token: Option<String>,
    proxy: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    let res = check_with(&app, &token, proxy.clone()).await;
    let update = match res {
        Ok(u) => u,
        Err(e) => {
            // 网络层失败（直连不通）→ 回退本机代理再试一次；其余错误（如 404/验签）原样报
            let networkish = e.contains("timed out") || e.contains("request") || e.contains("dns") || e.contains("connect");
            if !networkish || proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
                return Err(e);
            }
            check_with(&app, &token, Some("http://127.0.0.1:7890".into()))
                .await
                .map_err(|_| e)?
        }
    };
    match update {
        Some(u) => {
            let info = UpdateInfo {
                version: u.version.clone(),
                notes: u.body.clone(),
                date: u.date.map(|d| d.to_string()),
            };
            *state.0.lock().unwrap() = Some(u);
            Ok(Some(info))
        }
        None => {
            *state.0.lock().unwrap() = None;
            Ok(None)
        }
    }
}

/// 桌面：下载并安装（passive 模式；NSIS 安装完成后自动重启应用，本命令正常不返回）
#[cfg(desktop)]
#[tauri::command]
async fn update_download_install(
    app: AppHandle,
    state: tauri::State<'_, PendingUpdate>,
) -> Result<(), String> {
    // 短锁取出（MutexGuard 不能跨 await）
    let update = {
        let mut guard = state.0.lock().unwrap();
        guard.take().ok_or("没有待安装的更新（请先检查更新）")?
    };
    let app2 = app.clone();
    update
        .download_and_install(
            |downloaded, total| {
                let _ = app2.emit("update-progress", serde_json::json!({ "downloaded": downloaded, "total": total }));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
async fn update_check(
    _state: tauri::State<'_, PendingUpdate>,
    _token: Option<String>,
    _proxy: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    Err("桌面版才支持自动安装更新，手机请用应用内下载".into())
}

#[cfg(not(desktop))]
#[tauri::command]
async fn update_download_install(_state: tauri::State<'_, PendingUpdate>) -> Result<(), String> {
    Err("桌面版才支持自动安装更新".into())
}

/// 双平台：GitHub API 查最新 Release（Android 主用；404 = 仓库无 Release 或无权限）
#[tauri::command]
async fn update_query_latest(
    token: Option<String>,
    proxy: Option<String>,
) -> Result<Option<ReleaseInfo>, String> {
    async fn query(token: &Option<String>, proxy: Option<String>) -> Result<Option<ReleaseInfo>, String> {
        let mut b = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .user_agent("passbook-updater");
        if let Some(p) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            b = b.proxy(reqwest::Proxy::all(p).map_err(|e| e.to_string())?);
        }
        let client = b.build().map_err(|e| e.to_string())?;
        let mut req = client
            .get("https://api.github.com/repos/rem-sy/passbook/releases/latest")
            .header("Accept", "application/vnd.github+json");
        if let Some(t) = token.as_deref() {
            let t = t.trim();
            if !t.is_empty() {
                req = req.header("Authorization", format!("Bearer {t}"));
            }
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if status == 404 {
            return Ok(None); // 无 Release（或 token 无权看私有仓，与不存在同表现）
        }
        if status == 401 {
            return Err("GitHub Token 无效（401），请检查设置里的 Token".into());
        }
        if status == 403 {
            return Err("GitHub API 限流（403），稍后再试".into());
        }
        if status >= 400 {
            return Err(format!("GitHub API 返回 {status}"));
        }
        let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Release 响应解析失败: {e}"))?;
        let tag = v["tag_name"].as_str().unwrap_or_default().trim().to_string();
        if tag.is_empty() {
            return Ok(None);
        }
        let mut apk_url = None;
        let mut apk_size = 0u64;
        if let Some(assets) = v["assets"].as_array() {
            for a in assets {
                let n = a["name"].as_str().unwrap_or_default();
                // 正式 APK（排除预置版）；预置版绝不上传 Release，双保险
                if n.starts_with("Passbook-Android-") && n.ends_with("-arm64.apk") && !n.contains("preset") {
                    apk_url = a["browser_download_url"].as_str().map(String::from);
                    apk_size = a["size"].as_u64().unwrap_or(0);
                    break;
                }
            }
        }
        Ok(Some(ReleaseInfo {
            tag,
            name: v["name"].as_str().map(String::from),
            notes: v["body"].as_str().map(String::from),
            apk_url,
            apk_size,
            html_url: v["html_url"].as_str().unwrap_or_default().to_string(),
        }))
    }
    match query(&token, proxy.clone()).await {
        Ok(x) => Ok(x),
        Err(e) => {
            // 网络层失败且未自配代理 → 回退本机代理
            let networkish = e.contains("timed out") || e.contains("request") || e.contains("dns") || e.contains("connect");
            if !networkish || proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
                return Err(e);
            }
            query(&token, Some("http://127.0.0.1:7890".into())).await.map_err(|_| e)
        }
    }
}

/// 双平台：流式下载 APK 到 <cache>/filehub_tmp/passbook-update.apk（FileProvider 覆盖路径），
/// 进度事件 update-progress {downloaded,total}；仅接受本仓 Release 资产地址
#[tauri::command]
async fn update_download_apk(
    app: AppHandle,
    url: String,
    token: Option<String>,
    proxy: Option<String>,
) -> Result<String, String> {
    if !url.starts_with("https://github.com/rem-sy/passbook/releases/") {
        return Err("仅允许下载本仓库 Release 资产".into());
    }
    let dir = app
        .path()
        .cache_dir()
        .map_err(|e| e.to_string())?
        .join("filehub_tmp");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("passbook-update.apk");

    async fn dl(
        app: &AppHandle,
        url: &str,
        dest: &std::path::Path,
        token: &Option<String>,
        proxy: Option<String>,
    ) -> Result<u64, String> {
        use std::io::Write;
        let mut b = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(600))
            .user_agent("passbook-updater");
        if let Some(p) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            b = b.proxy(reqwest::Proxy::all(p).map_err(|e| e.to_string())?);
        }
        let client = b.build().map_err(|e| e.to_string())?;
        let mut req = client.get(url);
        if let Some(t) = token.as_deref() {
            let t = t.trim();
            if !t.is_empty() {
                req = req.header("Authorization", format!("Bearer {t}"));
            }
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
        if status == 404 {
            return Err("下载地址 404（私有仓需填 Token，或资产已删除）".into());
        }
        if status >= 400 {
            return Err(format!("下载失败（HTTP {status}）"));
        }
        let total = resp.content_length();
        let mut file = fs::File::create(dest).map_err(|e| e.to_string())?;
        let mut stream = resp.bytes_stream();
        let mut done: u64 = 0;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| e.to_string())?;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            done += bytes.len() as u64;
            let _ = app.emit("update-progress", serde_json::json!({ "downloaded": done, "total": total }));
        }
        Ok(done)
    }

    match dl(&app, &url, &dest, &token, proxy.clone()).await {
        Ok(n) => {
            if n == 0 {
                return Err("下载内容为空".into());
            }
            Ok(dest.to_string_lossy().to_string())
        }
        Err(e) => {
            let networkish = e.contains("timed out") || e.contains("request") || e.contains("dns") || e.contains("connect");
            if !networkish || proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_some() {
                return Err(e);
            }
            dl(&app, &url, &dest, &token, Some("http://127.0.0.1:7890".into()))
                .await
                .map_err(|_| e)?;
            Ok(dest.to_string_lossy().to_string())
        }
    }
}

/// 重启应用（桌面更新安装后的手动重启入口；Windows passive 安装通常自动重启，此命令兜底）
#[tauri::command]
fn update_restart(app: AppHandle) {
    app.restart();
}

/* ---------------- 生物识别解锁（v2.6.0） ----------------
 * 桌面：Windows Hello（UserConsentVerifier，指纹/面容/系统 PIN）
 * Android：不经 Rust——前端直接调 RustWebView 注入的 __passbook_bio JS 桥
 */
#[tauri::command]
async fn bio_available() -> bool {
    #[cfg(windows)]
    {
        return windows_hello::available();
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[tauri::command]
async fn bio_prompt(reason: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let _ = reason;
        return windows_hello::prompt();
    }
    #[cfg(not(windows))]
    {
        let _ = reason;
        Err("当前平台不支持生物识别".into())
    }
}

#[cfg(windows)]
mod windows_hello {
    // Windows Hello：UserConsentVerifier 只验证「设备持有者身份」，不产生任何密钥材料
    use windows::Security::Credentials::UI::{UserConsentVerificationResult, UserConsentVerifier};

    /// windows 0.61 未暴露可用性查询；假定可用，未配置 Hello 时由 prompt 的结果枚举兜底
    pub fn available() -> bool {
        true
    }

    pub fn prompt() -> Result<bool, String> {
        // .get() 阻塞等待用户完成验证（命令在 tauri 线程池执行，不卡 UI）
        let op = UserConsentVerifier::RequestVerificationAsync(
            &windows::core::HSTRING::from("解锁密码本"),
        )
        .map_err(|e| format!("Windows Hello 调用失败: {e}"))?;
        let r = op.get().map_err(|e| format!("Windows Hello 失败: {e}"))?;
        Ok(matches!(r, UserConsentVerificationResult::Verified))
    }
}

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
            read_db_file_b64,
            write_db_file,
            write_db_file_b64,
            pick_db_path,
            export_db,
            export_json,
            pick_import_db,
            get_backups_dir,
            list_dir_files,
            delete_file,
            export_bytes,
            saf_temp_write,
            favicon_fetch,
            agent_http,
            agent_http_stream,
            agent_abort,
            log_front,
            bio_available,
            bio_prompt,
            read_pending_notes,
            read_pending_files,
            set_quicknote_shortcut,
            get_files_store_dir,
            store_blob_write_b64,
            store_blob_read_b64,
            store_blob_exists,
            store_blob_delete,
            store_blob_list,
            pick_files,
            read_file_bytes_b64,
            filehub_temp_write_b64,
            shell_open,
            export_bytes_b64,
            app_version,
            update_check,
            update_download_install,
            update_query_latest,
            update_download_apk,
            update_restart
        ]);

    // v4.9.0 自动更新：updater 插件仅桌面；PendingUpdate 状态全平台托管（非桌面命令为 stub）
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    let builder = builder.manage(PendingUpdate(std::sync::Mutex::new(None)));

    // v4.3.0：桌面随手记——全局快捷键 + 剪贴板读取（仅 Windows 桌面构建）
    #[cfg(windows)]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init());

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
