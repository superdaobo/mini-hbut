package com.hbut.mini;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.lang.reflect.Method;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HBUTNativePlugin.class);
        registerPlugin(MiniHbutWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        configureWebViewForEmbeddedModules();
        registerBackgroundFetchHeadless();
        // 冷启动时也检查 intent 中的 deep link
        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDeepLinkIntent(intent);
    }

    /**
     * 解析 minihbut://schedule 深链接并派发到 Web 层
     * 仅当 scheme == "minihbut" 且 host == "schedule" 时处理
     */
    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!"minihbut".equals(data.getScheme()) || !"schedule".equals(data.getHost())) return;

        String date = data.getQueryParameter("date");
        String source = data.getQueryParameter("source");
        String period = data.getQueryParameter("period");

        // 构建 JSON payload
        StringBuilder json = new StringBuilder("{");
        json.append("\"date\":").append(date != null ? "\"" + escapeJson(date) + "\"" : "null");
        json.append(",\"source\":").append(source != null ? "\"" + escapeJson(source) + "\"" : "\"widget\"");
        json.append(",\"period\":").append(period != null ? period : "null");
        json.append("}");

        String payloadJson = json.toString();
        Log.i(TAG, "Widget deep link received: " + payloadJson);

        if (getBridge() != null) {
            getBridge().triggerJSEvent("widgetDeeplink", "window", payloadJson);
        }
    }

    /** 简单 JSON 字符串转义（防止注入） */
    private static String escapeJson(String value) {
        if (value == null) return "";
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t");
    }

    private void configureWebViewForEmbeddedModules() {
        try {
            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            if (settings == null) return;
            // 安卓模块页统一改为 Capacitor 本地文件映射内嵌。
            // 宿主页仍是 https://localhost，部分 WebView 对本地映射资源会误判为混合内容，
            // 这里保留兼容配置，但不再把 127.0.0.1 module bridge 视为安卓预期链路。
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            Log.i(TAG, "WebView configured for embedded local module pages");
        } catch (Throwable e) {
            Log.w(TAG, "WebView configure skipped: " + e.getMessage());
        }
    }

    private void registerBackgroundFetchHeadless() {
        try {
            Class<?> bgClass = Class.forName("com.transistorsoft.tsbackgroundfetch.BackgroundFetch");
            Method method = bgClass.getMethod("registerHeadlessTask", Class.class);
            method.invoke(null, BackgroundFetchHeadlessTask.class);
            Log.i(TAG, "BackgroundFetch headless task registered");
        } catch (Throwable e) {
            Log.w(TAG, "BackgroundFetch headless register skipped: " + e.getMessage());
        }
    }
}
