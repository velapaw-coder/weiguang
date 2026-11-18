package com.weiguang.energy.demo;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;

import com.weiguang.energy.core.HealthRepository;

public final class WeiguangStores {
    private static HealthRepository repository;

    private WeiguangStores() {}

    public static synchronized HealthRepository get(Context context) {
        if (repository == null) {
            WeiguangOpenHelper helper = new WeiguangOpenHelper(context);
            SQLiteDatabase db = helper.getWritableDatabase();
            repository = new HealthRepository(new AndroidSqlSession(db));
            repository.migrate(System.currentTimeMillis());
        }
        return repository;
    }
}
