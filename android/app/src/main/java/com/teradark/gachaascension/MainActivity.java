package com.teradark.gachaascension;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONObject;

/** Offline preview host. All gameplay and reward decisions remain in src/v8. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/assets/game/preview-v0.8.html";
    private static final int EXPORT = 41, IMPORT = 42, MAX_SAVE_BYTES = 2 * 1024 * 1024;
    private WebView webView;
    private String pendingExport;
    private boolean pickerOpen, pageReady, hostPaused;
    private volatile boolean playAllowed;
    private boolean gameLoaded;
    private volatile boolean compatibilityFailed;
    private PlatformGate platformGate;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this); root.setBackgroundColor(0xff0c2025);
        webView = new WebView(this); webView.setBackgroundColor(0xff0c2025);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1)); setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            }
            return insets;
        });
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false); settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.addJavascriptInterface(new HostBridge(), "GachaAndroid");
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", path -> {
            WebResourceResponse response = assets.handle(path);
            if (response != null) {
                if (path.endsWith(".mjs")) response.setMimeType("text/javascript");
                else if (path.endsWith(".json")) response.setMimeType("application/json");
                response.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-store"));
            }
            return response;
        }).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (HOST.equals(request.getUrl().getHost())) return loader.shouldInterceptRequest(request.getUrl());
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Offline preview", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost()) && "https".equals(uri.getScheme())) return false;
                if (request.isForMainFrame() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true; dispatchVisibility(hostPaused || !playAllowed);
                view.evaluateJavascript("Boolean(window.structuredClone && window.Worker && navigator.locks)", supported -> {
                    if (!"true".equals(supported) && !compatibilityFailed) {
                        compatibilityFailed = true; dispatchVisibility(true);
                        new AlertDialog.Builder(MainActivity.this).setTitle("请更新系统网页组件")
                            .setMessage("当前 Android System WebView 缺少游戏所需能力，进度未被重置。请在应用商店更新 Android System WebView 或系统浏览器后再试。")
                            .setPositiveButton("关闭游戏", (dialog, which) -> finish()).setCancelable(false).show();
                    }
                });
            }
        });
        webView.setWebChromeClient(new WebChromeClient());
        platformGate = new PlatformGate(this, root, allowed -> {
            playAllowed = allowed;
            if (allowed && !gameLoaded) { gameLoaded = true; webView.loadUrl(HOME); }
            dispatchVisibility(hostPaused || !allowed);
        });
        immersive();
    }

    private void immersive() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            android.view.WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    private void dispatchVisibility(boolean hidden) {
        if (pageReady) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gacha:visibility',{detail:{hidden:" + (hidden || !playAllowed || compatibilityFailed) + "}}))", null);
    }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) immersive(); }
    @Override protected void onPause() { hostPaused = true; dispatchVisibility(true); webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); hostPaused = false; if (webView != null) { webView.onResume(); dispatchVisibility(!playAllowed); immersive(); } }
    @Override protected void onDestroy() { if (platformGate != null) platformGate.destroy(); webView.removeJavascriptInterface("GachaAndroid"); webView.destroy(); super.onDestroy(); }
    @Override public void onBackPressed() {
        if (!pageReady) { super.onBackPressed(); return; }
        webView.evaluateJavascript("window.dispatchEvent(new Event('gacha:back'))", null);
    }
    private void message(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }

    private final class HostBridge {
        @JavascriptInterface public boolean isPlayAllowed() { return playAllowed && !compatibilityFailed; }
        @JavascriptInterface public void openFeedback() { runOnUiThread(() -> { if (BuildConfig.FEEDBACK_URL.startsWith("https://")) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.FEEDBACK_URL))); else message("反馈页尚未配置，请复制诊断交给开发者。"); }); }
        @JavascriptInterface public void backHandled(boolean handled) {
            if (!handled) runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this).setMessage("退出游戏？修行安排和存档会保留。").setNegativeButton("继续修行", null).setPositiveButton("退出", (dialog, which) -> finish()).show());
        }
        @JavascriptInterface public void exportSave(String json) {
            runOnUiThread(() -> {
                if (pickerOpen || json == null || json.length() > MAX_SAVE_BYTES) return;
                pendingExport = json; pickerOpen = true;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_TITLE, "gacha-ascension-save.json");
                try { startActivityForResult(intent, EXPORT); } catch (Exception error) { pickerOpen = false; pendingExport = null; message("无法打开系统文件选择器"); }
            });
        }
        @JavascriptInterface public void selectSave() {
            runOnUiThread(() -> {
                if (pickerOpen) return; pickerOpen = true;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try { startActivityForResult(intent, IMPORT); } catch (Exception error) { pickerOpen = false; message("无法打开系统文件选择器"); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data); pickerOpen = false;
        if (result != RESULT_OK || data == null || data.getData() == null) { pendingExport = null; return; }
        try {
            if (request == EXPORT && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) { out.write(pendingExport.getBytes(StandardCharsets.UTF_8)); }
                pendingExport = null; message("存档已导出");
            } else if (request == IMPORT) {
                String json;
                try (InputStream in = getContentResolver().openInputStream(data.getData()); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = in.read(buffer)) != -1) { if (out.size() + count > MAX_SAVE_BYTES) throw new IllegalArgumentException("存档文件需小于2MB"); out.write(buffer, 0, count); }
                    json = out.toString(StandardCharsets.UTF_8.name());
                }
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('gacha:import',{detail:" + JSONObject.quote(json) + "}))", null);
            }
        } catch (Exception error) { pendingExport = null; message("文件操作失败：" + error.getMessage()); }
    }
}
