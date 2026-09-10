package com.passbook.app

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import org.json.JSONObject
import java.io.File

/**
 * 密码本 v4.3.0：随手记快捷方式（对标微信扫一扫）。
 * 静态 App Shortcuts（res/xml/shortcuts.xml）长按图标直达。
 *
 * 产品核心：**绝不初始化 WebView / Tauri / Rust**——秒开。
 * 流程：onResume（已获焦点，Android 10+ 合规读剪贴板通道）→
 *   原生确认框预览前 80 字 → 确认后追加写 pending 队列文件（JSON 行）→
 *   Toast → finish；空剪贴板直接 toast 退出。
 * 队列文件由应用启动时前端经 Rust 命令 read_pending_notes 消费入 notes 表。
 */
class QuickNoteActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 与 MainActivity 一致：预览内容不出现在截图与最近任务缩略图
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onResume() {
        super.onResume()
        // onResume 时本 Activity 已获焦点——Android 10+ 唯一合规的剪贴板读取时机
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = runCatching {
            cm.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
        }.getOrNull()

        if (text.isNullOrBlank()) {
            Toast.makeText(this, "剪贴板为空，先复制一段文字再试", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val preview = text.replace(Regex("\\s+"), " ").trim().let {
            if (it.length > 80) it.take(80) + "…" else it
        }
        AlertDialog.Builder(this)
            .setTitle("随手记：收入剪贴板内容？")
            .setMessage(preview)
            .setPositiveButton("收入") { _, _ ->
                val ok = runCatching { appendPending(this, text, "clipboard") }.isSuccess
                Toast.makeText(
                    this,
                    if (ok) "已记录，下次打开应用自动入库" else "写入失败，请重试",
                    if (ok) Toast.LENGTH_SHORT else Toast.LENGTH_LONG
                ).show()
                finish()
            }
            .setNegativeButton("取消") { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }

    companion object {
        /** pending 队列文件：<dataDir>/pending_quicknotes.jsonl（Rust DataRoot 同目录） */
        @JvmStatic
        fun pendingFile(ctx: Context): File {
            val dataDir = ctx.filesDir.parentFile ?: ctx.filesDir
            return File(dataDir, "pending_quicknotes.jsonl")
        }

        /** 追加一行 JSON（content/source/ts）；与应用内 ShareTextActivity 共用 */
        @JvmStatic
        fun appendPending(ctx: Context, content: String, source: String) {
            val f = pendingFile(ctx)
            val line = JSONObject()
                .put("content", content)
                .put("source", source)
                .put("ts", System.currentTimeMillis())
                .toString() + "\n"
            f.appendText(line, Charsets.UTF_8)
        }
    }
}
