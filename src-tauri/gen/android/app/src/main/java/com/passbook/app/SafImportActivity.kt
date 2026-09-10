package com.passbook.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * 密码本 v4.4.0：应用内 SAF 批量导入（透明无 UI）。
 * 由 __passbook_saf.pick() 拉起：ACTION_OPEN_DOCUMENT + EXTRA_ALLOW_MULTIPLE →
 * 流式拷贝（8KB）+ sha256 → 逐个写 pending_files 队列（source=saf）→
 * 结果写 lastResult（"true:N" / "false:<错误>"）供 pickResult() 同步轮询
 * （同 SafSaveActivity 模式）；前端收到后消费队列完成加密入库。
 */
class SafImportActivity : Activity() {
    companion object {
        const val REQ = 41029
        /** "pending" | "true:N" | "false:<错误信息>" */
        @JvmStatic var lastResult: String = "pending"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lastResult = "pending"
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        @Suppress("DEPRECATION")
        startActivityForResult(i, REQ)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ) { finish(); return }
        val uris = ArrayList<Uri>()
        if (resultCode == RESULT_OK && data != null) {
            val cd = data.clipData
            if (cd != null) for (k in 0 until cd.itemCount) uris.add(cd.getItemAt(k).uri)
            else data.data?.let { uris.add(it) }
        }
        if (uris.isEmpty()) { finishWith(false, "已取消"); return }
        var ok = 0
        for (u in uris) {
            try {
                val st = FileHub.stage(this, u, null, null)
                FileHub.appendPending(this, st, "saf", false)
                ok++
            } catch (_: Exception) { /* 单个失败跳过，其余继续 */ }
        }
        finishWith(ok > 0, if (ok > 0) "$ok" else "没有可导入的文件")
    }

    private fun finishWith(ok: Boolean, msg: String) {
        lastResult = (if (ok) "true:" else "false:") + msg
        RustWebView.current?.post {
            RustWebView.current?.evaluateJavascript(
                "window.__passbookSafPickResult && window.__passbookSafPickResult(" + ok + ")", null
            )
        }
        finish()
    }
}
