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
 * 密码本 v4.4.0：【其他应用打开】通道。
 * 微信/QQ 文件右上角「选择用其他应用打开」→ 密码本出现在打开方式列表
 * （manifest 挂 ACTION_VIEW，content/file scheme + 常见文档 mime）。
 *
 * 关键时序：content URI 授权只在 Activity 存活期内有效 —— **先流式拷贝+算 sha256
 * 再弹框，全程不 finish**。
 * 卡片两个动作：
 *   「保存到文件仓」→ pending 队列（open=false）→ Toast → finish
 *   「用密码本打开」→ pending 队列（open=true）→ 唤起主界面 → 前端入库后直跳文件仓 tab 并打开预览
 * 纯原生零 WebView。
 */
class OpenFileActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)

        if (intent?.action != Intent.ACTION_VIEW) {
            toastAndFinish("无法处理该打开请求")
            return
        }
        val uri: Uri = intent.data ?: run { toastAndFinish("没有收到文件"); return }

        // 1) 先拷贝（URI 授权随本 Activity 生命周期，弹框期间不可再读）
        val staged = try {
            FileHub.stage(this, uri, null, intent.type)
        } catch (e: Exception) {
            toastAndFinish("读取文件失败：" + (e.message ?: "未知错误"))
            return
        }
        val source = "open"
        val dup = FileHub.dupCount(this, staged.sha256)

        // 2) 再弹框（不 finish）
        setContentView(R.layout.dialog_quick_confirm)
        findViewById<View>(R.id.qn_root).setOnClickListener { FileHub.deleteTemp(staged); finish() } // 遮罩 = 不保存退出
        findViewById<TextView>(R.id.qn_title).text = "用密码本打开"
        findViewById<TextView>(R.id.qn_sub).text = "${staged.name} · ${FileHub.humanSize(staged.size)} · ${staged.mime}"
        val dupLine = if (dup > 0) "\n与已有 $dup 个文件内容相同。" else ""
        findViewById<TextView>(R.id.qn_preview).text = "保存后可在文件仓统一检索与预览（全程本机加密，不上传）。$dupLine"
        findViewById<TextView>(R.id.qn_cancel).text = "保存到文件仓"
        findViewById<TextView>(R.id.qn_cancel).setOnClickListener {
            val ok = runCatching { FileHub.appendPending(this, staged, source, false) }.isSuccess
            Toast.makeText(this, if (ok) "已保存，打开密码本完成加密入库" else "保存失败，请重试", Toast.LENGTH_SHORT).show()
            if (ok) launchMain()
            finish()
        }
        findViewById<TextView>(R.id.qn_ok).text = "用密码本打开"
        findViewById<TextView>(R.id.qn_ok).setOnClickListener {
            val ok = runCatching { FileHub.appendPending(this, staged, source, true) }.isSuccess
            if (!ok) {
                Toast.makeText(this, "保存失败，请重试", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            launchMain()
            finish()
        }
    }

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
