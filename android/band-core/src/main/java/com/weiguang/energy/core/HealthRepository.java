package com.weiguang.energy.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Phone SQLite repository. Callers pass a real SQLite session, not a memory map. */
public final class HealthRepository {
    private final SqlSession db;

    public HealthRepository(SqlSession db) {
        this.db = db;
    }

    public void migrate(long now) {
        int current = currentVersion();
        for (int version = current + 1; version <= WeiguangSql.VERSION; version++) {
            final int step = version;
            db.transaction(() -> WeiguangSql.applyMigration(db, step, now));
        }
    }

    public int currentVersion() {
        try {
            List<Map<String, Object>> rows = db.query("SELECT MAX(version) AS version FROM schema_migrations");
            if (rows.isEmpty() || rows.get(0).get("version") == null) {
                return 0;
            }
            return ((Number) rows.get(0).get("version")).intValue();
        } catch (RuntimeException ex) {
            return 0;
        }
    }

    /** @return true when a new row was inserted */
    public boolean upsertObservation(
            String key,
            String address,
            String metric,
            String deviceSampledAt,
            long phoneReceivedAt,
            String syncId,
            String valueJson,
            String quality,
            long now) {
        List<Map<String, Object>> existing = db.query(
                "SELECT id FROM observations WHERE idempotency_key = ?", key);
        if (!existing.isEmpty()) {
            db.exec(
                    "UPDATE observations SET value_json = ?, phone_received_at = ?, sync_id = ?, quality = ?, device_sampled_at = ? WHERE idempotency_key = ?",
                    valueJson, phoneReceivedAt, syncId, quality, deviceSampledAt, key);
            return false;
        }
        db.exec(
                "INSERT INTO observations(idempotency_key, device_address, metric, device_sampled_at, phone_received_at, sync_id, value_json, quality, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                key, address, metric, deviceSampledAt, phoneReceivedAt, syncId, valueJson, quality, now);
        return true;
    }

    /**
     * Newest first by the band's own clock. A history sync can deliver old days last, so receive
     * order alone would show a past day as the current reading. Rows without a device time rank last.
     */
    private static final String BAND_CLOCK_ORDER =
            " ORDER BY CASE WHEN device_sampled_at IS NULL OR device_sampled_at = '' THEN 0 ELSE 1 END DESC,"
                    + " device_sampled_at DESC, phone_received_at DESC LIMIT ?";

    public List<Map<String, Object>> listObservations(String address, String metric, int limit) {
        if (address == null || address.isEmpty()) {
            return db.query("SELECT * FROM observations WHERE metric = ?" + BAND_CLOCK_ORDER, metric, limit);
        }
        return db.query(
                "SELECT * FROM observations WHERE device_address = ? AND metric = ?" + BAND_CLOCK_ORDER,
                address, metric, limit);
    }

    public Map<String, Object> latestObservation(String metric) {
        List<Map<String, Object>> rows = listObservations(null, metric, 1);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void touchSync(String address, String metric, String status, String error, String cursor, Long successAt, long attemptAt) {
        List<Map<String, Object>> existing = db.query(
                "SELECT cursor_value, last_success_at FROM sync_cursors WHERE device_address = ? AND metric = ?",
                address, metric);
        Object keptCursor = cursor;
        Object keptSuccess = successAt;
        if (!existing.isEmpty()) {
            if (keptCursor == null) {
                keptCursor = existing.get(0).get("cursor_value");
            }
            if (keptSuccess == null) {
                keptSuccess = existing.get(0).get("last_success_at");
            }
        }
        db.exec(
                "INSERT OR REPLACE INTO sync_cursors(device_address, metric, cursor_value, last_success_at, last_attempt_at, last_status, last_error) VALUES(?,?,?,?,?,?,?)",
                address, metric, keptCursor, keptSuccess, attemptAt, status, error);
    }

    public List<Map<String, Object>> listSync() {
        return db.query("SELECT * FROM sync_cursors ORDER BY metric");
    }

    public void upsertDevice(String address, String name, String firmware, String uiVersion, String sn, String capabilitiesJson, Long connectedAt, long now) {
        List<Map<String, Object>> existing = db.query("SELECT address FROM devices WHERE address = ?", address);
        if (existing.isEmpty()) {
            db.exec(
                    "INSERT INTO devices(address, name, firmware, ui_version, sn, capabilities_json, last_connect_at, updated_at) VALUES(?,?,?,?,?,?,?,?)",
                    address, name, firmware, uiVersion, sn, capabilitiesJson, connectedAt, now);
        } else {
            db.exec(
                    "UPDATE devices SET name = COALESCE(?, name), firmware = COALESCE(?, firmware), ui_version = COALESCE(?, ui_version), sn = COALESCE(?, sn), capabilities_json = COALESCE(?, capabilities_json), last_connect_at = COALESCE(?, last_connect_at), updated_at = ? WHERE address = ?",
                    name, firmware, uiVersion, sn, capabilitiesJson, connectedAt, now, address);
        }
    }

    public List<Map<String, Object>> listDevices() {
        return db.query("SELECT * FROM devices ORDER BY updated_at DESC");
    }

    public void saveGoal(String id, String text, long now) {
        db.exec(
                "INSERT OR REPLACE INTO goals(id, text, created_at, archived) VALUES(?,?,?,0)",
                id, text, now);
    }

    /** Archives every active goal carrying this text; older builds saved one row per confirmation. */
    public void archiveGoalsByText(String text) {
        db.exec("UPDATE goals SET archived = 1 WHERE text = ? AND archived = 0", text);
    }

    public List<Map<String, Object>> listGoals() {
        return db.query("SELECT * FROM goals WHERE archived = 0 ORDER BY created_at");
    }

    public void insertTask(Map<String, Object> task) {
        db.exec(
                "INSERT INTO tasks(id, title, detail, source, status, due_local, timezone, reminder_enabled, reminder_local, repeat_daily, rationale_json, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                task.get("id"), task.get("title"), task.get("detail"), task.get("source"), task.get("status"),
                task.get("due_local"), task.get("timezone"), task.get("reminder_enabled"), task.get("reminder_local"),
                task.get("repeat_daily"), task.get("rationale_json"), task.get("created_at"), task.get("updated_at"));
        addEvent(String.valueOf(task.get("id")), "create", String.valueOf(task.get("source")), ((Number) task.get("created_at")).longValue());
    }

    public void updateTaskStatus(String id, String status, long now) {
        db.exec("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", status, now, id);
        addEvent(id, status, null, now);
    }

    public void updateTaskText(String id, String title, String detail, long now) {
        db.exec("UPDATE tasks SET title = ?, detail = ?, updated_at = ? WHERE id = ?", title, detail, now, id);
        addEvent(id, "edit", null, now);
    }

    public void setReminder(String id, boolean enabled, String reminderLocal, boolean repeatDaily, String zone, long now) {
        db.exec(
                "UPDATE tasks SET reminder_enabled = ?, reminder_local = ?, repeat_daily = ?, timezone = ?, updated_at = ? WHERE id = ?",
                enabled ? 1 : 0, reminderLocal, repeatDaily ? 1 : 0, zone, now, id);
        addEvent(id, enabled ? "reminder_on" : "reminder_off", reminderLocal, now);
    }

    public Map<String, Object> getTask(String id) {
        List<Map<String, Object>> rows = db.query("SELECT * FROM tasks WHERE id = ?", id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<Map<String, Object>> listTasks() {
        return db.query("SELECT * FROM tasks ORDER BY updated_at DESC");
    }

    public void addEvent(String taskId, String kind, String note, long at) {
        db.exec("INSERT INTO task_events(task_id, kind, note, at_ms) VALUES(?,?,?,?)", taskId, kind, note, at);
    }

    public List<Map<String, Object>> listEvents(String taskId) {
        return db.query("SELECT * FROM task_events WHERE task_id = ? ORDER BY at_ms", taskId);
    }

    public boolean recordReminderFire(String taskId, String localDate, long firedAt) {
        List<Map<String, Object>> existing = db.query(
                "SELECT task_id FROM reminder_fires WHERE task_id = ? AND local_date = ?", taskId, localDate);
        if (!existing.isEmpty()) {
            return false;
        }
        db.exec("INSERT INTO reminder_fires(task_id, local_date, fired_at) VALUES(?,?,?)", taskId, localDate, firedAt);
        addEvent(taskId, "reminded", localDate, firedAt);
        return true;
    }

    public Map<String, Object> lastReminderFire(String taskId) {
        List<Map<String, Object>> rows = db.query(
                "SELECT * FROM reminder_fires WHERE task_id = ? ORDER BY fired_at DESC LIMIT 1", taskId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void setMeta(String key, String value) {
        db.exec("INSERT OR REPLACE INTO app_meta(key, value) VALUES(?,?)", key, value);
    }

    public String getMeta(String key) {
        List<Map<String, Object>> rows = db.query("SELECT value FROM app_meta WHERE key = ?", key);
        if (rows.isEmpty() || rows.get(0).get("value") == null) {
            return null;
        }
        return String.valueOf(rows.get(0).get("value"));
    }

    public Map<String, String> allMeta() {
        Map<String, String> out = new LinkedHashMap<>();
        for (Map<String, Object> row : db.query("SELECT key, value FROM app_meta ORDER BY key")) {
            out.put(String.valueOf(row.get("key")), row.get("value") == null ? "" : String.valueOf(row.get("value")));
        }
        return out;
    }

    public void saveGraphSnapshot(String threadId, String valuesJson, String checkpointJson, long now) {
        db.exec(
                "INSERT OR REPLACE INTO graph_snapshots(thread_id, values_json, checkpoint_json, updated_at) VALUES(?,?,?,?)",
                threadId, valuesJson, checkpointJson, now);
    }

    public Map<String, Object> getGraphSnapshot(String threadId) {
        List<Map<String, Object>> rows = db.query("SELECT * FROM graph_snapshots WHERE thread_id = ?", threadId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void saveCoachResult(String id, String threadId, String status, String summaryJson, String resultJson, long now) {
        db.exec(
                "INSERT INTO coach_results(id, thread_id, status, summary_json, result_json, created_at) VALUES(?,?,?,?,?,?)",
                id, threadId, status, summaryJson, resultJson, now);
    }

    public List<Map<String, Object>> listCoachResults(int limit) {
        return db.query("SELECT * FROM coach_results ORDER BY created_at DESC LIMIT ?", limit);
    }

    public void deleteAllUserData() {
        db.transaction(() -> {
            db.exec("DELETE FROM observations");
            db.exec("DELETE FROM sync_cursors");
            db.exec("DELETE FROM devices");
            db.exec("DELETE FROM goals");
            db.exec("DELETE FROM task_events");
            db.exec("DELETE FROM tasks");
            db.exec("DELETE FROM reminder_fires");
            db.exec("DELETE FROM graph_snapshots");
            db.exec("DELETE FROM coach_results");
            db.exec("DELETE FROM app_meta");
        });
    }

    public int countObservations(String address) {
        List<Map<String, Object>> rows = db.query(
                "SELECT COUNT(*) AS n FROM observations WHERE device_address = ?", address);
        return ((Number) rows.get(0).get("n")).intValue();
    }

    public static String normalizeAddress(String address) {
        return address == null ? "" : address.trim().toUpperCase(Locale.US);
    }

    public static List<String> metricsOf(List<Map<String, Object>> rows) {
        List<String> metrics = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            metrics.add(String.valueOf(row.get("metric")));
        }
        return metrics;
    }
}
