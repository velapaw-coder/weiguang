package com.weiguang.energy.demo;

import android.app.Application;

import com.weiguang.energy.core.ConnectDiagnostic;
import com.yc.utesdk.ble.open.UteBleClient;

import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

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
        rememberUncaught();
        DebugModelKeyInstall.ensure(this);
        ensureSdk(this);
        ReminderScheduler.ensureChannel(this);
    }

    private void rememberUncaught() {
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try (FileOutputStream out = openFileOutput("connect-diagnostic.txt", MODE_PRIVATE)) {
                out.write(ConnectDiagnostic.format("uncaught", error).getBytes(StandardCharsets.UTF_8));
            } catch (Throwable ignored) {
                // The previous handler still runs.
            }
            if (previous != null) {
                previous.uncaughtException(thread, error);
            }
        });
    }
}
