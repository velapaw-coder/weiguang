package com.weiguang.energy.demo;

import android.app.Application;

import com.yc.utesdk.ble.open.UteBleClient;

public class WeiguangApp extends Application {
    private static String sdkInitError;

    public static String sdkInitError() {
        return sdkInitError;
    }

    public static synchronized void ensureSdk(Application application) {
        if (sdkInitError != null) {
            return;
        }
        try {
            if (UteBleClient.getUteBleClient() != null) {
                return;
            }
            UteBleClient.initialize(application);
        } catch (Throwable error) {
            sdkInitError = error.getClass().getSimpleName();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureSdk(this);
        ReminderScheduler.ensureChannel(this);
    }
}
