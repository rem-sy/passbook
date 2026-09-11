package com.passbook.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * 密码本 v3.0.5：SAF「另存为」桥（透明无 UI）。
 * 桌面端导出/另存用 tauri dialog 保存框；Android 无该能力，改走系统
 * Storage Access Framework：JS 先把字节经 Rust 命令 saf_temp_write 写入
 * 应用缓存临时文件，再调 __passbook_saf.save(名字, 临时路径) 拉起本
 * Activity → ACTION_CREATE_DOCUMENT 系统另存为界面 → 流式拷贝临时文件
 * 到用户选择的位置 → 结果写入 lastResult 供 __passbook_saf.result()
 * 同步轮询（同 BioBridge 模式，不依赖 evaluateJavascript 时序）。
 */
class SafSaveActivity : Activity() {
    companion object {
        const val REQ = 41027
        @JvmStatic var tempPath: String = ""
        @JvmStatic var displayName: String = "passbook.bin"
        /** "pending" | "true" | "false:<错误信息>" */
        @JvmStatic var lastResult: String = "pending"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lastResult = "pending"
        val i = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*" // v4.6.1：octet-stream 会被部分系统选择器按 MIME 强改扩展名成 .bin；改 */* 保留 EXTRA_TITLE 全名
            putExtra(Intent.EXTRA_TITLE, displayName)
        }
        @Suppress("DEPRECATION")
        startActivityForResult(i, REQ)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ) { finish(); return }
        val uri: Uri? = data?.data
        if (resultCode != RESULT_OK || uri == null) { finishWith(false, "已取消"); return }
        try {
            contentResolver.openOutputStream(uri, "wt")!!.use { out ->
                java.io.File(tempPath).inputStream().use { it.copyTo(out) }
            }
            finishWith(true, "")
        } catch (e: Exception) {
            finishWith(false, e.message ?: "写入失败")
        }
    }

    private fun finishWith(ok: Boolean, err: String) {
        lastResult = (if (ok) "true" else "false:") + err
        RustWebView.current?.post {
            RustWebView.current?.evaluateJavascript(
                "window.__passbookSafResult && window.__passbookSafResult(" + ok + ")", null
            )
        }
        finish()
    }
}
