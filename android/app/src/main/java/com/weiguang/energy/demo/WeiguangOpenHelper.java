package com.weiguang.energy.demo;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

/**
 * Opens weiguang.db in application storage. Uninstall deletes this file.
 * Schema versions live in schema_migrations, applied by HealthRepository.
 */
public final class WeiguangOpenHelper extends SQLiteOpenHelper {
    public static final String FILE_NAME = "weiguang.db";

    public WeiguangOpenHelper(Context context) {
        super(context.getApplicationContext(), FILE_NAME, null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        // HealthRepository.migrate creates the tables.
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Schema changes are applied by HealthRepository against schema_migrations.
    }
}
