package com.passbook.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import org.json.JSONObject

/**
 * 密码本 v4.6.1：通用「选一个文件 → 流式拷贝到临时 → 回传」桥（透明无 UI）。
 * 由 __passbook_saf.pickRaw() 拉起：ACTION_OPEN_DOCUMENT 单选 → FileHub.stage
 * 拷贝（8KB 流式）+ sha256 → 结果 JSON { name, tempPath, size, sha256 } 写
 * lastResult，前端 pickRawResult() 同步轮询后用 Rust read_file_bytes_b64 取字节。
 *
 * 背景：tauri dialog 插件在 Android 返回 content:// URI（Rust fs 读不了），
 * pick_import_db 因此在手机端永远拿不到文件——导入 .db/CSV/JSON/文件仓 zip
 * 的选文件步骤全部改走本桥。
 */
class SafPickRawActivity : Activity() {
    companion object {
        const val REQ = 41030
        /** "pending" | JSON 字符串 | "false:<错误信息>" */
        @JvmStatic var lastResult: String = "pending"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lastResult = "pending"
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
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
            val st = FileHub.stage(this, uri, null, null)
            lastResult = JSONObject()
                .put("name", st.name)
                .put("tempPath", st.tempPath)
                .put("size", st.size)
                .put("sha256", st.sha256)
                .toString()
        } catch (e: Exception) {
            lastResult = "false:" + (e.message ?: "读取失败")
        }
        RustWebView.current?.post {
            RustWebView.current?.evaluateJavascript(
                "window.__passbookSafPickRawResult && window.__passbookSafPickRawResult(true)", null
            )
        }
        finish()
    }

    private fun finishWith(ok: Boolean, err: String) {
        lastResult = (if (ok) "" else "false:") + err
        finish()
    }
}
