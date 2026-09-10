package com.passbook.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import android.widget.TextView
import android.widget.Toast

/**
 * 密码本 v4.3.0：文本分享接收（微信/QQ 里长按文字 → 分享 → 密码本）。
 * manifest 挂 ACTION_SEND text/plain intent-filter。
 *
 * 拿 EXTRA_TEXT 走 QuickNoteActivity 的同一 pending 队列（source=share）；
 * 纯原生零 WebView，秒开；确认后入库，下次启动消费入 notes 表。
 * v4.3.1：改用自定义简约卡片确认框（dialog_quick_confirm），与随手记同 UI。
 */
class ShareTextActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        val text = runCatching {
            if (intent?.action == Intent.ACTION_SEND) {
                @Suppress("DEPRECATION")
                intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
            } else null
        }.getOrNull()

        if (text.isNullOrBlank()) {
            Toast.makeText(this, "没有收到可保存的文字", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        val preview = text.replace(Regex("\\s+"), " ").trim().let {
            if (it.length > 80) it.take(80) + "…" else it
        }
        setContentView(R.layout.dialog_quick_confirm)
        findViewById<android.view.View>(R.id.qn_root).setOnClickListener { finish() } // 点遮罩取消
        findViewById<TextView>(R.id.qn_title).text = "存入随手记"
        findViewById<TextView>(R.id.qn_sub).text = "分享内容预览（前 80 字）"
        findViewById<TextView>(R.id.qn_preview).text = preview
        findViewById<TextView>(R.id.qn_ok).text = "保存"
        findViewById<TextView>(R.id.qn_cancel).setOnClickListener { finish() }
        findViewById<TextView>(R.id.qn_ok).setOnClickListener {
            val ok = runCatching { QuickNoteActivity.appendPending(this, text, "share") }.isSuccess
            Toast.makeText(
                this,
                if (ok) "已保存，下次打开应用自动入库" else "保存失败，请重试",
                if (ok) Toast.LENGTH_SHORT else Toast.LENGTH_LONG
            ).show()
            finish()
        }
    }
}
