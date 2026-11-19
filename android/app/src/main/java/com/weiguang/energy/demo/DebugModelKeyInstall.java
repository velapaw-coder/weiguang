package com.weiguang.energy.demo;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;

import com.weiguang.energy.core.DebugModelKeyBootstrap;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;

/** Copies the optional debug asset into private preferences. Release builds return first. */
public final class DebugModelKeyInstall {
    private DebugModelKeyInstall() {}

    public static void ensure(Context context) {
        boolean debug = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        SharedPreferences prefs = context.getSharedPreferences(
                DebugModelKeyBootstrap.PREFS_NAME, Context.MODE_PRIVATE);
        DebugModelKeyBootstrap.ensure(debug, () -> readAsset(context), new DebugModelKeyBootstrap.Store() {
            @Override
            public String get() {
                return prefs.getString(DebugModelKeyBootstrap.PREFS_KEY, "");
            }

            @Override
            public void set(String value) {
                prefs.edit().putString(DebugModelKeyBootstrap.PREFS_KEY, value).apply();
            }
        });
    }

    private static byte[] readAsset(Context context) {
        try (InputStream input = context.getAssets().open(DebugModelKeyBootstrap.ASSET_NAME)) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[1024];
            int count;
            int total = 0;
            while ((count = input.read(chunk)) >= 0) {
                total += count;
                if (total > 4096) {
                    return null;
                }
                buffer.write(chunk, 0, count);
            }
            return buffer.toByteArray();
        } catch (FileNotFoundException missing) {
            return null;
        } catch (Exception ignored) {
            return null;
        }
    }
}
