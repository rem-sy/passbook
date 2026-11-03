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

        // 密码本 v4.4.0：文件仓「系统打开」桥 PbFileHubOpen（FileProvider + ACTION_VIEW）
        @android.webkit.JavascriptInterface
        fun open(tempPath: String, mime: String) {
            val f = java.io.File(tempPath)
            if (!f.exists()) return
            val uri = androidx.core.content.FileProvider.getUriForFile(
                context, context.packageName + ".fileprovider", f)
            val i = android.content.Intent(android.content.Intent.ACTION_VIEW)
            i.setDataAndType(uri, mime.ifBlank { "*/*" })
            i.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        // 密码本 v4.4.0：SAF 批量导入桥（配合 SafImportActivity，ACTION_OPEN_DOCUMENT 多选）
        @android.webkit.JavascriptInterface
        fun pick() {
            SafImportActivity.lastResult = "pending" // v4.6.4：同款残留隐患
            val i = android.content.Intent(context, SafImportActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        @android.webkit.JavascriptInterface
        fun pickResult(): String { return SafImportActivity.lastResult }

        // 密码本 v4.6.1：通用单文件选取桥（配合 SafPickRawActivity，导入选文件用）
        @android.webkit.JavascriptInterface
        fun pickRaw() {
            SafPickRawActivity.lastResult = "pending" // v4.6.4：启动前重置（静态残留教训）
            val i = android.content.Intent(context, SafPickRawActivity::class.java)
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }

        @android.webkit.JavascriptInterface
        fun pickRawResult(): String { return SafPickRawActivity.lastResult }
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
        // 密码本 v4.0.0：相机权限转发（扫码）PbCamGrant
        webChromeClient = object : android.webkit.WebChromeClient() {
            override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                if (!request.resources.contains(android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny(); return
                }
                // WebView 层放行 + 并行触发系统运行时权限（未授权时相机设备本就打不开，用户拒绝则流失败走 onFail）
                request.grant(request.resources)
                (context as? android.app.Activity)?.requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 41028)
            }
        }
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
