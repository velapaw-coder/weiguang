package com.weiguang.energy.demo;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.weiguang.energy.core.HealthRepository;

public final class WeiguangStores {
    private static WeiguangOpenHelper helper;
    private static HealthRepository repository;

    private WeiguangStores() {}

    public static synchronized HealthRepository get(Context context) {
        if (repository == null) {
            helper = new WeiguangOpenHelper(context);
            SQLiteDatabase db = helper.getWritableDatabase();
            repository = new HealthRepository(new AndroidSqlSession(db));
            repository.migrate(System.currentTimeMillis());
        }
        return repository;
    }

    /** Instrumentation only: close the on-disk DB handle to simulate process death + reopen. */
    public static synchronized void resetForTests() {
        if (helper != null) {
            try {
                helper.close();
            } catch (RuntimeException ignored) {
                // Best-effort close before the next open.
            }
        }
        helper = null;
        repository = null;
    }
}
