package com.weiguang.energy.core;

public final class WeiguangSql {
    public static final int VERSION = 2;

    public static final String MIGRATION_1 =
            "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);"
                    + "CREATE TABLE devices (address TEXT PRIMARY KEY, name TEXT, firmware TEXT, ui_version TEXT, sn TEXT, capabilities_json TEXT, last_connect_at INTEGER, updated_at INTEGER NOT NULL);"
                    + "CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE, device_address TEXT NOT NULL, metric TEXT NOT NULL, device_sampled_at TEXT, phone_received_at INTEGER NOT NULL, sync_id TEXT, value_json TEXT NOT NULL, quality TEXT NOT NULL, created_at INTEGER NOT NULL);"
                    + "CREATE INDEX idx_obs_device_metric ON observations(device_address, metric, phone_received_at);"
                    + "CREATE TABLE sync_cursors (device_address TEXT NOT NULL, metric TEXT NOT NULL, cursor_value TEXT, last_success_at INTEGER, last_attempt_at INTEGER, last_status TEXT, last_error TEXT, PRIMARY KEY (device_address, metric));"
                    + "CREATE TABLE goals (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);"
                    + "CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT, source TEXT NOT NULL, status TEXT NOT NULL, due_local TEXT, timezone TEXT, reminder_enabled INTEGER NOT NULL DEFAULT 0, reminder_local TEXT, repeat_daily INTEGER NOT NULL DEFAULT 0, rationale_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);"
                    + "CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, at_ms INTEGER NOT NULL);"
                    + "CREATE TABLE reminder_fires (task_id TEXT NOT NULL, local_date TEXT NOT NULL, fired_at INTEGER NOT NULL, PRIMARY KEY (task_id, local_date));"
                    + "CREATE TABLE graph_snapshots (thread_id TEXT PRIMARY KEY, values_json TEXT NOT NULL, checkpoint_json TEXT, updated_at INTEGER NOT NULL);"
                    + "CREATE TABLE coach_results (id TEXT PRIMARY KEY, thread_id TEXT, status TEXT NOT NULL, summary_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL);"
                    + "CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);";

    public static final String MIGRATION_2 =
            "ALTER TABLE observations ADD COLUMN user_note TEXT;";

    private static final String[] MIGRATIONS = {MIGRATION_1, MIGRATION_2};

    private WeiguangSql() {}

    public static void applyMigration(SqlSession db, int version, long now) {
        execScript(db, MIGRATIONS[version - 1]);
        db.exec("INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)", version, now);
    }

    public static void execScript(SqlSession db, String script) {
        String[] parts = script.split(";");
        for (String part : parts) {
            String sql = part.trim();
            if (!sql.isEmpty()) {
                db.exec(sql);
            }
        }
    }

    public static String migration(int version) {
        return MIGRATIONS[version - 1];
    }
}
