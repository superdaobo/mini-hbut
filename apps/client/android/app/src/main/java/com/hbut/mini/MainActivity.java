package com.hbut.mini;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private String pendingWidgetEvent = null;
    private String pendingWidgetPayload = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HBUTNativePlugin.class);
        registerPlugin(MiniHbutWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        configureWebViewForEmbeddedModules();
        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLinkIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        flushPendingWidgetEvent();
    }

    private void flushPendingWidgetEvent() {
        if (pendingWidgetPayload == null || pendingWidgetEvent == null) return;
        if (getBridge() == null) return;
        getBridge().triggerJSEvent(pendingWidgetEvent, "window", pendingWidgetPayload);
        pendingWidgetEvent = null;
        pendingWidgetPayload = null;
    }

    private void dispatchWidgetEvent(String eventName, String payloadJson) {
        Log.i(TAG, "Widget event " + eventName + ": " + payloadJson);
        if (getBridge() != null) {
            getBridge().triggerJSEvent(eventName, "window", payloadJson);
            return;
        }
        pendingWidgetEvent = eventName;
        pendingWidgetPayload = payloadJson;
    }

    /**
     * 解析 minihbut:// 深链接并派发到 Web 层。
     */
    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!"minihbut".equals(data.getScheme())) return;

        String host = data.getHost();
        if (host == null) return;

        switch (host) {
            case "schedule": {
                String date = data.getQueryParameter("date");
                String source = data.getQueryParameter("source");
                String period = data.getQueryParameter("period");
                StringBuilder json = new StringBuilder("{");
                json.append("\"date\":").append(date != null ? "\"" + escapeJson(date) + "\"" : "null");
                json.append(",\"source\":").append(source != null ? "\"" + escapeJson(source) + "\"" : "\"widget\"");
                json.append(",\"period\":").append(period != null ? period : "null");
                json.append("}");
                dispatchWidgetEvent("widgetDeeplink", json.toString());
                break;
            }
            case "electricity": {
                String source = data.getQueryParameter("source");
                String payload = "{\"view\":\"electricity\",\"source\":\""
                    + escapeJson(source != null ? source : "widget") + "\"}";
                dispatchWidgetEvent("widgetNavigate", payload);
                break;
            }
            case "exam": {
                String source = data.getQueryParameter("source");
                String payload = "{\"view\":\"exams\",\"source\":\""
                    + escapeJson(source != null ? source : "widget") + "\"}";
                dispatchWidgetEvent("widgetNavigate", payload);
                break;
            }
            default:
                break;
        }
    }

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
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setDomStorageEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            Log.i(TAG, "WebView configured for embedded local module pages");
        } catch (Throwable e) {
            Log.w(TAG, "WebView configure skipped: " + e.getMessage());
        }
    }
}
