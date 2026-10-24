package com.teradark.gachaascension;
import android.app.Activity;
import android.widget.FrameLayout;
/** Explicit local preview, excluded from release source sets. */
final class PlatformGate {
    interface Listener { void changed(boolean allowed); }
    PlatformGate(Activity activity, FrameLayout root, Listener listener) { listener.changed(true); }
    void destroy() {}
}
