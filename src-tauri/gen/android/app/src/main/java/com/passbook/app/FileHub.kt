package com.passbook.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * 密码本 v4.4.0：文件仓收件公共管线（ShareFileActivity / OpenFileActivity 共用）。
 *
 * 管线：ContentResolver 流式拷贝 content:// URI（8KB buffer，禁止 readBytes）→
 *   算 sha256 → 拷入 inbox 临时文件 → 弹自定义卡片确认 → 确认后写 pending 队列
 *   （JSON 行）→ 前端启动消费：读临时文件 → AES-GCM 加密入桶 → files 元数据入库。
 * 原生侧只做「接收与暂存」，加密与入库密钥在 WebView 侧（DbCrypto 同体系），绝不初始化 WebView。
 */
object FileHub {

    const val BUF = 8 * 1024

    /** inbox：<cache>/filehub_inbox（前端经 Rust read_file_bytes_b64 读取后删除） */
    fun inboxDir(ctx: Context): File {
        val d = File(ctx.cacheDir, "filehub_inbox")
        if (!d.exists()) d.mkdirs()
        return d
    }

    /** pending 队列文件：<dataDir>/pending_files.jsonl（Rust read_pending_files 双候选同 notes 惯例） */
    fun pendingFile(ctx: Context): File {
        val dataDir = ctx.filesDir.parentFile ?: ctx.filesDir
        return File(dataDir, "pending_files.jsonl")
    }

    class Staged(
        val name: String,
        val mime: String,
        val size: Long,
        val sha256: String,
        val tempPath: String,
    )

    /** 流式拷贝 URI → inbox 临时文件，同时算 sha256；显示名/大小优先取 ContentResolver 查询 */
    fun stage(ctx: Context, uri: Uri, fallbackName: String?, hintMime: String?): Staged {
        var name = fallbackName ?: ""
        var size = -1L
        runCatching {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) {
                    val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val si = c.getColumnIndex(OpenableColumns.SIZE)
                    if (ni >= 0 && !c.isNull(ni)) name = c.getString(ni)
                    if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                }
            }
        }
        if (name.isBlank()) name = uri.lastPathSegment ?: "文件"
        val mime = (hintMime ?: ctx.contentResolver.getType(uri)) ?: "application/octet-stream"

        val tmp = File(inboxDir(ctx), "recv-" + System.currentTimeMillis() + "-" + name.replace(Regex("[/\\\\]"), "_"))
        val md = MessageDigest.getInstance("SHA-256")
        var copied = 0L
        ctx.contentResolver.openInputStream(uri)?.use { ins ->
            java.io.FileOutputStream(tmp).use { outs ->
                val buf = ByteArray(BUF) // 8KB 流式，绝不 readBytes
                while (true) {
                    val n = ins.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                    outs.write(buf, 0, n)
                    copied += n
                }
            }
        } ?: throw IllegalStateException("无法读取该文件（来源未授权）")
        if (size < 0) size = copied
        val sha = md.digest().joinToString("") { "%02x".format(it) }
        return Staged(name, mime, size, sha, tmp.absolutePath)
    }

    /** 来源识别：EXTRA_CALLING_PACKAGE / callingPackage 尽量识别微信/QQ，识别不了归 other（键值与前端 PassFiles.detectSource 一致） */
    fun detectSource(activity: Activity, intent: Intent): String {
        var pkg: String? = null
        // EXTRA_CALLING_PACKAGE 常量需 API 34；用字面量兼容低版本编译
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            pkg = runCatching { intent.getStringExtra("android.intent.extra.CALLING_PACKAGE") }.getOrNull()
        }
        if (pkg.isNullOrBlank()) {
            @Suppress("DEPRECATION")
            pkg = runCatching { activity.callingPackage }.getOrNull()
        }
        val p = pkg?.trim()?.lowercase() ?: return "other"
        if (p == "com.tencent.mm" || p.startsWith("com.tencent.mm")) return "wechat"
        if (p == "com.tencent.mobileqq" || p.startsWith("com.tencent.mobileqq") || p == "com.tencent.tim") return "qq"
        return "other"
    }

    /** 确认后写入 pending 队列（open=true 表示「用密码本打开」：入库后直接唤起预览） */
    fun appendPending(ctx: Context, s: Staged, source: String, open: Boolean) {
        val line = JSONObject()
            .put("name", s.name)
            .put("mime", s.mime)
            .put("size", s.size)
            .put("sha256", s.sha256)
            .put("source", source)
            .put("tempPath", s.tempPath)
            .put("open", open)
            .put("ts", System.currentTimeMillis())
            .toString() + "\n"
        pendingFile(ctx).appendText(line, Charsets.UTF_8)
    }

    fun deleteTemp(s: Staged) {
        runCatching { File(s.tempPath).delete() }
    }

    /**
     * 同内容条数（「与已有 N 个文件内容相同」提示）：
     * 尽力而为——磁盘 .db 为明文 SQLite 时只读查询 files 表；加密库 / 无库 / 查询失败返回 -1（不提示）。
     */
    fun dupCount(ctx: Context, sha256: String): Int {
        return runCatching {
            val dbFile = File(ctx.filesDir.parentFile ?: ctx.filesDir, "passwords.db")
            if (!dbFile.exists()) return -1
            val head = java.io.RandomAccessFile(dbFile, "r").use { raf ->
                val b = ByteArray(16); raf.readFully(b); b
            }
            if (!String(head, 0, 6, Charsets.US_ASCII).equals("SQLite", ignoreCase = true)) return -1 // 加密库不预查
            android.database.sqlite.SQLiteDatabase.openDatabase(
                dbFile.absolutePath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY
            ).use { db ->
                db.rawQuery("SELECT COUNT(*) FROM files WHERE sha256 = ?", arrayOf(sha256)).use { c ->
                    if (c.moveToFirst()) c.getInt(0) else -1
                }
            }
        }.getOrDefault(-1)
    }

    fun humanSize(n: Long): String {
        if (n < 1024) return "$n B"
        if (n < 1024 * 1024) return String.format("%.1f KB", n / 1024.0)
        return String.format("%.1f MB", n / 1024.0 / 1024.0)
    }
}
