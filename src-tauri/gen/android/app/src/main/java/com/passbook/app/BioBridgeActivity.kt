package com.passbook.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Bundle

/**
 * 密码本 v2.6.0：生物识别解锁确认页（透明无 UI）。
 * 用 KeyguardManager.createConfirmDeviceCredentialIntent 拉起系统
 * 指纹/面容/锁屏 PIN 确认，零第三方依赖；结果回推给 WebView 里的
 * window.__passbookBioResult(ok)。JS 入口在 RustWebView.JsBio。
 *
 * v3.0.5：结果同时写入伴生对象 lastResult（"true"/"false"），JS 侧可经
 * __passbook_bio.result() 同步轮询——修复凭据页遮挡/WebView 暂停时
 * evaluateJavascript 回调丢失导致解锁卡死的问题；并兼容部分 OEM
 * 以 RESULT_FIRST_USER 上报成功的怪癖。
 */
class BioBridgeActivity : Activity() {
    companion object {
        const val REQ = 41026
        @JvmStatic var reason: String = "解锁密码本"
        /** "pending" | "true" | "false"：JsBio.result() 同步读取 */
        @JvmStatic var lastResult: String = "pending"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lastResult = "pending"
        val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
        if (!km.isKeyguardSecure) { finishWith(false); return }
        val intent = km.createConfirmDeviceCredentialIntent(null, reason)
        if (intent == null) { finishWith(false); return }
        @Suppress("DEPRECATION")
        startActivityForResult(intent, REQ)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ) { finish() ; return }
        // 部分厂商（OPPO/一加等）成功时返回 RESULT_FIRST_USER(1) 而非 RESULT_OK(-1)
        finishWith(resultCode == RESULT_OK || resultCode == RESULT_FIRST_USER)
    }

    private fun finishWith(ok: Boolean) {
        lastResult = if (ok) "true" else "false"
        RustWebView.current?.post {
            RustWebView.current?.evaluateJavascript(
                "window.__passbookBioResult && window.__passbookBioResult(" + ok + ")", null
            )
        }
        finish()
    }
}
