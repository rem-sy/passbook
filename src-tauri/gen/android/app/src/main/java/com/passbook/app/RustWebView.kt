/* THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!! */

// Copyright 2020-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

@file:Suppress("unused", "SetJavaScriptEnabled")

package com.passbook.app

import android.annotation.SuppressLint
import android.webkit.*
import android.content.Context
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlin.collections.Map

@SuppressLint("RestrictedApi")
class RustWebView(context: Context, val initScripts: Array<String>, val id: String): WebView(context) {
    val isDocumentStartScriptEnabled: Boolean

    companion object {
        @JvmStatic var current: RustWebView? = null
    }

    /** 密码本 v2.6.0：生物识别 JS 桥（window.__passbook_bio）；v3.0.5 增加同步轮询 result() */
    inner class JsBio {
        @android.webkit.JavascriptInterface
        fun available(): String {
            val km = context.getSystemService(android.content.Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
            return if (km.isKeyguardSecure) "yes" else "no"
        }

        @android.webkit.JavascriptInterface
        fun result(): String { return BioBridgeActivity.lastResult }

        @android.webkit.JavascriptInterface
        fun prompt(reason: String) {
            BioBridgeActivity.reason = reason.ifBlank { "解锁密码本" }
            val i = android.content.Intent(context, BioBridgeActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }
    }

    /** 密码本 v3.0.5：SAF 另存为 JS 桥（window.__passbook_saf，配合 SafSaveActivity） */
    inner class JsSaf {
        @android.webkit.JavascriptInterface
        fun result(): String { return SafSaveActivity.lastResult }

        @android.webkit.JavascriptInterface
        fun save(name: String, tempPath: String) {
            SafSaveActivity.displayName = name.ifBlank { "passbook.bin" }
            SafSaveActivity.tempPath = tempPath
            val i = android.content.Intent(context, SafSaveActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }
    }

    init {
        // 密码本 v2.6.0/v3.0.5：JS 桥（生物识别 + SAF 另存为）
        current = this
        addJavascriptInterface(JsBio(), "__passbook_bio")
        addJavascriptInterface(JsSaf(), "__passbook_saf")
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.setGeolocationEnabled(true)
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.javaScriptCanOpenWindowsAutomatically = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            isDocumentStartScriptEnabled = true
            for (script in initScripts) {
                WebViewCompat.addDocumentStartJavaScript(this, script, setOf("*"));
            }
        } else {
          isDocumentStartScriptEnabled = false
        }

        
    }

    fun loadUrlMainThread(url: String) {
        post {
          loadUrl(url)
        }
    }

    fun loadUrlMainThread(url: String, additionalHttpHeaders: Map<String, String>) {
        post {
          loadUrl(url, additionalHttpHeaders)
        }
    }

    override fun loadUrl(url: String) {
        if (!Rust.shouldOverride(id, url)) {
            super.loadUrl(url);
        }
    }

    override fun loadUrl(url: String, additionalHttpHeaders: Map<String, String>) {
        if (!Rust.shouldOverride(id, url)) {
            super.loadUrl(url, additionalHttpHeaders);
        }
    }

    fun loadHTMLMainThread(html: String) {
        post {
          super.loadData(html, "text/html", null)
        }
    }

    fun evalScript(id: Int, script: String) {
        post {
            super.evaluateJavascript(script) { result ->
                Rust.onEval(this.id, id, result)
            }
        }
    }

    fun clearAllBrowsingData() {
        try {
            super.getContext().deleteDatabase("webviewCache.db")
            super.getContext().deleteDatabase("webview.db")
            super.clearCache(true)
            super.clearHistory()
            super.clearFormData()
        } catch (ex: Exception) {
            Logger.error("Unable to create temporary media capture file: " + ex.message)
        }
    }

    fun getCookies(url: String): String {
        val cookieManager = CookieManager.getInstance()
        return cookieManager.getCookie(url)
    }

    
}
