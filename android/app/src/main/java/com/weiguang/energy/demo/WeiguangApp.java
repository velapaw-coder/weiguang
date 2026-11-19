package com.weiguang.energy.demo;

import android.app.ActivityManager;
import android.app.Application;
import android.app.ApplicationExitInfo;
import android.os.Build;

import com.weiguang.energy.core.ConnectDiagnostic;
import com.yc.utesdk.ble.open.UteBleClient;

import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

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
        rememberPreviousExit();
        rememberUncaught();
        DebugModelKeyInstall.ensure(this);
        ReminderScheduler.ensureChannel(this);
        // UteBleClient.initialize posts work to the main looper and waits. Doing that
        // on a background thread while holding ensureSdk's lock deadlocks MainActivity
        // when UteBandPlugin.load calls ensureSdk on the main thread. Keep init here.
        ensureSdk(this);
    }

    private void rememberPreviousExit() {
        if (Build.VERSION.SDK_INT < 30) {
            return;
        }
        try {
            ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            List<ApplicationExitInfo> exits = manager.getHistoricalProcessExitReasons(getPackageName(), 0, 1);
            if (exits == null || exits.isEmpty()) {
                return;
            }
            ApplicationExitInfo info = exits.get(0);
            String description = info.getDescription() == null ? "" : ConnectDiagnostic.redact(info.getDescription());
            if (description.length() > 160) {
                description = description.substring(0, 160);
            }
            String text = "phase=previous_exit\nsdk=" + Build.VERSION.SDK_INT
                    + "\nreason=" + info.getReason()
                    + "\nimportance=" + info.getImportance()
                    + "\nstatus=" + info.getStatus()
                    + "\ndescription=" + description + "\n";
            try (FileOutputStream out = openFileOutput("connect-exit.txt", MODE_PRIVATE)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) {
            // Exit history is optional. Do not block startup.
        }
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
