package com.weiguang.energy.demo;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UteBandPlugin.class);
        registerPlugin(WeiguangStorePlugin.class);
        registerPlugin(AppShellPlugin.class);
        super.onCreate(savedInstanceState);
        // Without this the default back action finishes the activity, which drops the page and looks like a crash.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                PluginHandle handle = getBridge() == null ? null : getBridge().getPlugin("AppShell");
                AppShellPlugin shell = handle == null ? null : (AppShellPlugin) handle.getInstance();
                if (shell == null || !shell.dispatchBack()) {
                    moveTaskToBack(true);
                }
            }
        });
    }
}
