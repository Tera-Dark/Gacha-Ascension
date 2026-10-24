package com.teradark.gachaascension;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.taptap.sdk.core.TapTapSdk;
import com.taptap.sdk.core.TapTapSdkOptions;
import com.taptap.sdk.core.TapTapRegion;
import com.taptap.sdk.initializer.api.TapInitCallback;
import com.taptap.sdk.compliance.TapTapCompliance;
import com.taptap.sdk.compliance.option.TapTapComplianceOptions;
import com.taptap.sdk.kit.internal.callback.TapTapCallback;
import com.taptap.sdk.kit.internal.exception.TapTapException;
import com.taptap.sdk.login.TapTapAccount;
import com.taptap.sdk.login.TapTapLogin;

/** Native privacy -> initialized SDK -> login -> compliance. Never trusts a JS grant. */
final class PlatformGate {
    interface Listener { void changed(boolean allowed); }
    private final Activity activity;
    private final Listener listener;
    private final LinearLayout panel;
    private final TextView message;
    private final Button action;
    private boolean initialized, initializing, busy, destroyed;
    private final TapInitCallback initCallback = new TapInitCallback() {
        @Override public void onInitSuccess() { activity.runOnUiThread(() -> { if (destroyed) return; initialized = true; initializing = false; authenticate(); }); }
        @Override public void onInitFail(int code, @NonNull String detail) { activity.runOnUiThread(() -> { initializing = false; block("平台初始化失败，请检查网络或应用配置后重试。"); }); }
    };

    PlatformGate(Activity activity, FrameLayout root, Listener listener) {
        this.activity = activity; this.listener = listener;
        panel = new LinearLayout(activity); panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER);
        panel.setPadding(32, 20, 32, 20); panel.setBackgroundColor(0xff10292d);
        message = new TextView(activity); message.setTextColor(0xffe6d8ab); message.setGravity(Gravity.CENTER); message.setTextSize(18);
        panel.addView(message); action = new Button(activity); panel.addView(action);
        Button privacy = new Button(activity); privacy.setText("隐私政策"); privacy.setOnClickListener(v -> open(BuildConfig.PRIVACY_URL)); panel.addView(privacy);
        Button terms = new Button(activity); terms.setText("用户协议"); terms.setOnClickListener(v -> open(BuildConfig.TERMS_URL)); panel.addView(terms);
        Button exit = new Button(activity); exit.setText("退出"); exit.setOnClickListener(v -> activity.finish()); panel.addView(exit);
        root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
        listener.changed(false);
        action.setOnClickListener(v -> {
            activity.getPreferences(0).edit().putBoolean("privacy-v1", true).apply();
            if (!initialized) initialize(); else authenticate();
        });
        if (!activity.getPreferences(0).getBoolean("privacy-v1", false)) {
            message.setText("抽卡修仙传\n请先阅读隐私政策与用户协议。平台登录和实名认证需要联网；游戏进度保存在本机。"); action.setText("同意并继续");
        } else { message.setText("正在准备平台认证…"); action.setText("重试认证"); initialize(); }
    }
    private void open(String url) { if (url.startsWith("https://")) activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
    private void block(String text) {
        if (destroyed) return; busy = false; listener.changed(false); panel.setVisibility(View.VISIBLE);
        message.setText(text); action.setText("重试认证"); action.setEnabled(true);
    }
    private void initialize() {
        if (destroyed || initializing) return;
        if (BuildConfig.TAP_CLIENT_ID.isEmpty() || BuildConfig.TAP_CLIENT_TOKEN.isEmpty() || !BuildConfig.PRIVACY_URL.startsWith("https://") || !BuildConfig.TERMS_URL.startsWith("https://")) { block("平台配置未完成，暂时无法进入公开试玩。"); return; }
        initializing = true; action.setEnabled(false);
        try {
            TapTapCompliance.registerComplianceCallback((code, extra) -> activity.runOnUiThread(() -> {
                if (destroyed) return;
                if (code == 500) { busy = false; panel.setVisibility(View.GONE); listener.changed(true); }
                else if (code == 1001 || code == 1000) { block("请重新登录并完成认证。游戏进度仍保留在本机。"); TapTapLogin.logout(); }
                else if (code == 1030 || code == 1050 || code == 1100) block("当前账号暂不可游玩，请按照平台提示安排时间。");
                else if (code == 1200 || code == 9002) block("认证未完成，请检查网络或重新认证。");
                else block("平台认证状态待确认，请重试。");
            }));
            TapTapSdk.addInitCallback(initCallback);
            TapTapSdkOptions options = new TapTapSdkOptions(BuildConfig.TAP_CLIENT_ID, BuildConfig.TAP_CLIENT_TOKEN, TapTapRegion.CN);
            options.setEnableLog(false);
            TapTapSdk.init(activity.getApplicationContext(), options, new TapTapComplianceOptions(true, false));
        } catch (Exception error) { initializing = false; block("平台初始化未完成，请重试。"); }
    }
    private void authenticate() {
        if (destroyed || busy) return;
        busy = true; listener.changed(false); action.setEnabled(false); message.setText("正在连接 TapTap 并进行认证…");
        TapTapAccount cached = TapTapLogin.getCurrentTapAccount();
        if (cached != null) { certify(cached); return; }
        TapTapLogin.loginWithScopes(activity, new String[]{"basic_info"}, new TapTapCallback<TapTapAccount>() {
            @Override public void onSuccess(TapTapAccount account) { activity.runOnUiThread(() -> certify(account)); }
            @Override public void onFail(@NonNull TapTapException error) { activity.runOnUiThread(() -> block("登录失败，请检查网络后重试。")); }
            @Override public void onCancel() { activity.runOnUiThread(() -> block("登录已取消，可稍后继续。")); }
        });
    }
    private void certify(TapTapAccount account) { if (!destroyed) TapTapCompliance.startup(activity, account.getOpenId()); }
    void destroy() { destroyed = true; TapTapSdk.removeInitCallback(initCallback); }
}
