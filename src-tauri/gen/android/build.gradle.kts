buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")
    }
}

allprojects {
    repositories {
        // 本地 Maven：app.tauri:tauri-android / tauri-plugin-dialog AAR（由 .android-dev\tauri-aar\patch-publish.ps1 发布）
        mavenLocal()
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

