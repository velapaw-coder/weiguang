package com.weiguang.energy.demo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UteBandPlugin.class);
        registerPlugin(WeiguangStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
