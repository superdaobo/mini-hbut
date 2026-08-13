// Kotlin 骨架构建配置：纯 JVM 库工程（单测不依赖 Android SDK）。
// 运行：cd src-tauri/plugins/tauri-plugin-hbut-background/android && gradle test
// （需 gradle 8.5+；#612 接入 WorkManager 时改为 Android library 模块并挂到 gen/android 工程）

plugins {
    kotlin("jvm") version "2.0.21"
}

repositories {
    mavenCentral()
}

dependencies {
    // org.json 与 Android 平台内置实现同 API，保证 JVM 单测与真机行为一致
    implementation("org.json:json:20240303")
    testImplementation("junit:junit:4.13.2")
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(17)
}

// HbutBackgroundPlugin.kt 依赖 android.content.Context，仅真机编译（#612 集成进 app 工程）；
// JVM 单测工程（models + store 为纯 Kotlin/org.json）排除该文件。
sourceSets {
    main {
        kotlin {
            exclude("**/HbutBackgroundPlugin.kt")
        }
    }
}

tasks.test {
    // 契约测试读取插件根目录的 contract-fixtures（三端共享单一事实源）
    systemProperty("contract.fixtures.dir", "${projectDir.parentFile.parentFile}/contract-fixtures")
    testLogging {
        events("passed", "failed")
    }
}
