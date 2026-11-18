package com.weiguang.energy.demo;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteStatement;

import com.weiguang.energy.core.SqlSession;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Android's SQLiteDatabase. This is the on-phone database, not an in-memory stand-in. */
public final class AndroidSqlSession implements SqlSession {
    private final SQLiteDatabase db;

    public AndroidSqlSession(SQLiteDatabase db) {
        this.db = db;
    }

    @Override
    public void exec(String sql, Object... args) {
        if (args == null || args.length == 0) {
            db.execSQL(sql);
            return;
        }
        SQLiteStatement statement = db.compileStatement(sql);
        try {
            for (int i = 0; i < args.length; i++) {
                bind(statement, i + 1, args[i]);
            }
            statement.execute();
        } finally {
            statement.close();
        }
    }

    @Override
    public List<Map<String, Object>> query(String sql, Object... args) {
        String[] bound = new String[args.length];
        for (int i = 0; i < args.length; i++) {
            bound[i] = args[i] == null ? null : String.valueOf(args[i]);
        }
        Cursor cursor = db.rawQuery(sql, bound);
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            while (cursor.moveToNext()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 0; i < cursor.getColumnCount(); i++) {
                    row.put(cursor.getColumnName(i), value(cursor, i));
                }
                rows.add(row);
            }
            return rows;
        } finally {
            cursor.close();
        }
    }

    @Override
    public void transaction(Runnable work) {
        db.beginTransaction();
        try {
            work.run();
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private static void bind(SQLiteStatement statement, int index, Object value) {
        if (value == null) {
            statement.bindNull(index);
        } else if (value instanceof Integer) {
            statement.bindLong(index, ((Integer) value).longValue());
        } else if (value instanceof Long) {
            statement.bindLong(index, (Long) value);
        } else if (value instanceof Short) {
            statement.bindLong(index, ((Short) value).longValue());
        } else if (value instanceof Double) {
            statement.bindDouble(index, (Double) value);
        } else if (value instanceof Float) {
            statement.bindDouble(index, ((Float) value).doubleValue());
        } else if (value instanceof Boolean) {
            statement.bindLong(index, ((Boolean) value) ? 1L : 0L);
        } else {
            statement.bindString(index, String.valueOf(value));
        }
    }

    private static Object value(Cursor cursor, int index) {
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_NULL:
                return null;
            case Cursor.FIELD_TYPE_INTEGER:
                return cursor.getLong(index);
            case Cursor.FIELD_TYPE_FLOAT:
                return cursor.getDouble(index);
            case Cursor.FIELD_TYPE_BLOB:
                return cursor.getBlob(index);
            default:
                return cursor.getString(index);
        }
    }
}
