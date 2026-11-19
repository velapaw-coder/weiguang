package com.weiguang.energy.demo;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** System bars and the back key for the single-activity WebView shell. */
@CapacitorPlugin(name = "AppShell")
public class AppShellPlugin extends Plugin {
    static final String BACK_EVENT = "backButton";

    /** @return false when the page has not subscribed, so the activity must handle back itself. */
    boolean dispatchBack() {
        if (!hasListeners(BACK_EVENT)) {
            return false;
        }
        notifyListeners(BACK_EVENT, new JSObject());
        return true;
    }

    @PluginMethod
    public void setBars(PluginCall call) {
        Activity activity = getActivity();
        Integer status = parse(call.getString("status"));
        Integer navigation = parse(call.getString("navigation"));
        boolean darkIcons = Boolean.TRUE.equals(call.getBoolean("darkIcons", true));
        if (activity == null || status == null || navigation == null) {
            call.resolve(result(false));
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(status);
            window.setNavigationBarColor(navigation);
            // Shows wherever the WebView does not reach: a display cutout taller than the status bar, or the gap while the keyboard animates.
            window.setBackgroundDrawable(new ColorDrawable(status));
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setAppearanceLightStatusBars(darkIcons);
            bars.setAppearanceLightNavigationBars(darkIcons);
            call.resolve(result(true));
        });
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.moveTaskToBack(true);
        }
        call.resolve(result(activity != null));
    }

    private static Integer parse(String color) {
        if (color == null) {
            return null;
        }
        try {
            return Color.parseColor(color);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static JSObject result(boolean ok) {
        JSObject result = new JSObject();
        result.put("ok", ok);
        return result;
    }
}
