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

// Android-only 文件依赖 android.*/androidx.work/androidx.core，仅真机编译（#612 集成进 app 工程）；
// JVM 单测工程排除这些文件。其余文件（models/store/signature/parser/core/policy/http fetcher）
// 为纯 Kotlin + org.json + java.net，JVM 单测直接覆盖。
sourceSets {
    main {
        kotlin {
            exclude("**/HbutBackgroundPlugin.kt")
            exclude("**/GradesCheckWorker.kt")
            exclude("**/GradesCheckScheduler.kt")
            exclude("**/GradesNotificationSender.kt")
            // #615：新增业务（考试/学校消息）的 Android-only 文件同样排除
            exclude("**/BusinessChecksWorker.kt")
            exclude("**/BusinessChecksScheduler.kt")
            exclude("**/BusinessNotificationSender.kt")
        }
    }
}

tasks.test {
    // 契约测试读取插件根目录的 contract-fixtures（三端共享单一事实源）。
    // 注意：projectDir = android/，其父目录即插件根目录（tauri-plugin-hbut-background）。
    systemProperty("contract.fixtures.dir", "${projectDir.parentFile}/contract-fixtures")
    testLogging {
        events("passed", "failed")
    }
}
