package com.passbook.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

/**
 * 密码本 v4.4.0：文件分享接收（主通道）。
 * 微信/QQ 里长按文件 → 分享 → 密码本（ACTION_SEND 任意类型 + 常见 mime 过滤器）。
 *
 * 纯原生零 WebView秒开（透明、noHistory）：
 *   EXTRA_STREAM 的 content:// URI 流式拷贝（8KB buffer）→ 算 sha256 →
 *   dialog_quick_confirm 自定义卡片确认（文件名/大小/类型/去重提示）→
 *   确认写 pending_files 队列（加密入库由前端消费完成）→ Toast → 唤起主界面 → finish。
 * 纯文本（无 EXTRA_STREAM）兜底走随手记 pending 队列（与 ShareTextActivity 同口径）。
 */
class ShareFileActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        if (intent?.action != Intent.ACTION_SEND) {
            toastAndFinish("没有收到可保存的文件")
            return
        }

        @Suppress("DEPRECATION")
        val stream: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
        if (stream == null) {
            // 纯文本兜底：与 ShareTextActivity 同队列（*/* 过滤器也会收到 text/plain 的选择）
            @Suppress("DEPRECATION")
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
            if (text.isNullOrBlank()) { toastAndFinish("没有收到可保存的内容"); return }
            QuickNoteActivity.appendPending(this, text, "share")
            Toast.makeText(this, "已保存到随手记，下次打开应用自动入库", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val staged = try {
            @Suppress("DEPRECATION")
            FileHub.stage(this, stream, intent.getStringExtra(Intent.EXTRA_TITLE), intent.type)
        } catch (e: Exception) {
            toastAndFinish("读取文件失败：" + (e.message ?: "未知错误"))
            return
        }
        val source = FileHub.detectSource(this, intent)
        val dup = FileHub.dupCount(this, staged.sha256)

        setContentView(R.layout.dialog_quick_confirm)
        findViewById<View>(R.id.qn_root).setOnClickListener { FileHub.deleteTemp(staged); finish() } // 点遮罩取消（丢弃暂存）
        findViewById<TextView>(R.id.qn_title).text = "存入文件仓"
        findViewById<TextView>(R.id.qn_sub).text = "${staged.name} · ${FileHub.humanSize(staged.size)} · ${staged.mime}"
        val dupLine = if (dup > 0) "\n\n与已有 $dup 个文件内容相同（同内容共用一份加密存储）" else ""
        findViewById<TextView>(R.id.qn_preview).text = "将加密保存到文件仓，仅在打开时解密。$dupLine"
        findViewById<TextView>(R.id.qn_cancel).setOnClickListener { FileHub.deleteTemp(staged); finish() }
        findViewById<TextView>(R.id.qn_ok).text = "保存"
        findViewById<TextView>(R.id.qn_ok).setOnClickListener {
            val ok = runCatching { FileHub.appendPending(this, staged, source, false) }.isSuccess
            Toast.makeText(
                this,
                if (ok) "已接收，打开密码本完成加密入库" else "保存失败，请重试",
                if (ok) Toast.LENGTH_SHORT else Toast.LENGTH_LONG
            ).show()
            if (ok) launchMain()
            finish()
        }
    }

    /** 确认后唤起主界面，前端启动消费 pending 队列完成加密入库 */
    private fun launchMain() {
        runCatching {
            val i = Intent(this, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(i)
        }
    }

    private fun toastAndFinish(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        finish()
    }
}
