package com.hbut.mini;

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
        super.onCreate(savedInstanceState);
        configureWebViewForEmbeddedModules();
        registerBackgroundFetchHeadless();
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
