package com.passbook.app

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.Toast
import org.json.JSONObject
import java.io.File

/**
 * 密码本 v4.3.0：随手记快捷方式（对标微信扫一扫）。
 * 静态 App Shortcuts（res/xml/shortcuts.xml）长按图标直达。
 *
 * 产品核心：**绝不初始化 WebView / Tauri / Rust**——秒开。
 * 流程：获焦点后读剪贴板（Android 10+ 仅焦点应用可读，合规通道）→
 *   原生确认框预览前 80 字 → 确认后追加写 pending 队列文件（JSON 行）→
 *   Toast → finish；空剪贴板直接 toast 退出。
 * 队列文件由应用启动时前端经 Rust 命令 read_pending_notes 消费入 notes 表。
 *
 * v4.3.1：修复「复制后点快捷方式仍提示剪贴板为空」——onResume 时窗口
 * 常尚未获得焦点（ClipboardManager 返回 null），改为 onWindowFocusChanged
 * 读取 + 150ms×10 次重试兜底（部分 OEM 系统的焦点授权时序坑）。
 */
class QuickNoteActivity : Activity() {

    private var handled = false
    private val handler = Handler(Looper.getMainLooper())
    private var attempts = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 与 MainActivity 一致：预览内容不出现在截图与最近任务缩略图
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onResume() {
        super.onResume()
        tryReadClipboard() // 部分机型 onResume 即已可读（快路径）
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) tryReadClipboard() // 焦点到位的主通道
    }

    private val readTask = object : Runnable {
        override fun run() {
            if (handled || isFinishing) return
            attempts++
            if (tryReadClipboard()) return
            if (attempts >= 10) {
                giveUp()
            } else {
                handler.postDelayed(this, 150)
            }
        }
    }

    /** 读剪贴板；拿到非空文本则弹确认框并返回 true，否则调度重试 */
    private fun tryReadClipboard(): Boolean {
        if (handled || isFinishing) return true
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = runCatching {
            cm.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
        }.getOrNull()

        if (text.isNullOrBlank()) {
            if (attempts == 0) handler.postDelayed(readTask, 150) // 首次未读到 → 进入重试
            return false
        }
        handled = true
        handler.removeCallbacks(readTask)
        showConfirm(text)
        return true
    }

    private fun giveUp() {
        if (handled || isFinishing) return
        handled = true
        Toast.makeText(this, "剪贴板为空，先复制一段文字再试", Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun showConfirm(text: String) {
        val preview = text.replace(Regex("\\s+"), " ").trim().let {
            if (it.length > 80) it.take(80) + "…" else it
        }
        // v4.3.1：自定义简约卡片确认框（与应用视觉一致），替代原生 AlertDialog
        setContentView(R.layout.dialog_quick_confirm)
        findViewById<android.view.View>(R.id.qn_root).setOnClickListener { finish() } // 点遮罩取消
        findViewById<android.widget.TextView>(R.id.qn_title).text = "随手记"
        findViewById<android.widget.TextView>(R.id.qn_sub).text = "剪贴板内容预览（前 80 字）"
        findViewById<android.widget.TextView>(R.id.qn_preview).text = preview
        findViewById<android.widget.TextView>(R.id.qn_ok).text = "收入"
        findViewById<android.widget.TextView>(R.id.qn_cancel).setOnClickListener { finish() }
        findViewById<android.widget.TextView>(R.id.qn_ok).setOnClickListener {
            val ok = runCatching { appendPending(this, text, "clipboard") }.isSuccess
            Toast.makeText(
                this,
                if (ok) "已记录，下次打开应用自动入库" else "写入失败，请重试",
                if (ok) Toast.LENGTH_SHORT else Toast.LENGTH_LONG
            ).show()
            finish()
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(readTask)
        super.onDestroy()
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
