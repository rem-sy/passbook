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
 */
class BioBridgeActivity : Activity() {
    companion object {
        const val REQ = 41026
        @JvmStatic var reason: String = "解锁密码本"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        if (requestCode == REQ) finishWith(resultCode == RESULT_OK)
    }

    private fun finishWith(ok: Boolean) {
        RustWebView.current?.post {
            RustWebView.current?.evaluateJavascript(
                "window.__passbookBioResult && window.__passbookBioResult(" + ok + ")", null
            )
        }
        finish()
    }
}
