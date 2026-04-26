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
        configureWebViewForModuleBridge();
        registerBackgroundFetchHeadless();
    }

    private void configureWebViewForModuleBridge() {
        try {
            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView == null) return;
            WebSettings settings = webView.getSettings();
            if (settings == null) return;
            // 宿主页是 https://localhost，本地模块桥是 http://127.0.0.1:4399。
            // 部分 Android WebView 会把这条链路当成混合内容直接拦截，这里显式放行。
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            Log.i(TAG, "WebView mixed content enabled for module bridge");
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
