import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// 签名配置：读取 gen/android/keystore.properties（不入库；无此文件时走 debug 签名）
// 注意用 UTF-8 reader：Properties 默认 ISO-8859-1 会把中文路径读成乱码
val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.reader(Charsets.UTF_8).use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "com.passbook.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.passbook.app"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        if (keystoreProperties["storeFile"] != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties["storeFile"].toString())
                storePassword = keystoreProperties["storePassword"].toString()
                keyAlias = keystoreProperties["keyAlias"].toString()
                keyPassword = keystoreProperties["keyPassword"].toString()
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
            if (keystoreProperties["storeFile"] != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    // Tauri Android 运行时（旁路模式下手动声明，版本与 Cargo.lock 的 crate 一致；
    // 正常 tauri android build 由 tauri.build.gradle.kts 注入）
    implementation("app.tauri:tauri-android:2.11.1")
    implementation("app.tauri:tauri-plugin-dialog:2.7.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

// 旁路守卫：PASSBOOK_SKIP_TAURI_SCRIPT=1 时跳过 tauri-cli 的 cargo/符号链接脚本，
// .so 与前端资源由 scripts/build-android.ps1 预先复制到 jniLibs/assets
if (System.getenv("PASSBOOK_SKIP_TAURI_SCRIPT") != "1") {
    apply(from = "tauri.build.gradle.kts")
}

// 新版 buildSrc 会把 rust* 任务直接挂进 assemble 链；旁路模式下将其短路跳过
tasks.configureEach {
    if (name.startsWith("rust") && System.getenv("PASSBOOK_SKIP_TAURI_SCRIPT") == "1") {
        onlyIf { false }
    }
}