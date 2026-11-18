package com.weiguang.energy.demo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.weiguang.energy.core.HealthRepository;
import com.weiguang.energy.core.ReminderPolicy;

import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "WeiguangStore")
public class WeiguangStorePlugin extends Plugin {
    @PluginMethod
    public void snapshot(PluginCall call) {
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void listObservations(PluginCall call) {
        String address = call.getString("address", "");
        String metric = call.getString("metric", "steps");
        int limit = call.getInt("limit", 60);
        JSObject result = new JSObject();
        result.put("rows", rows(repo().listObservations(address, metric, Math.min(Math.max(limit, 1), 500))));
        call.resolve(result);
    }

    @PluginMethod
    public void saveGoal(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.resolve(error("empty_goal"));
            return;
        }
        String id = call.getString("id", UUID.randomUUID().toString());
        repo().saveGoal(id, text, System.currentTimeMillis());
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void createTask(PluginCall call) {
        String title = call.getString("title", "").trim();
        String source = call.getString("source", "user");
        if (title.isEmpty()) {
            call.resolve(error("empty_task"));
            return;
        }
        if (!"user".equals(source) && !"langgraph".equals(source) && !"local_rule".equals(source)) {
            call.resolve(error("bad_source"));
            return;
        }
        long now = System.currentTimeMillis();
        java.util.HashMap<String, Object> task = new java.util.HashMap<>();
        task.put("id", UUID.randomUUID().toString());
        task.put("title", title);
        task.put("detail", call.getString("detail", ""));
        task.put("source", source);
        task.put("status", "active");
        task.put("due_local", call.getString("dueLocal"));
        task.put("timezone", zone(call));
        task.put("reminder_enabled", 0);
        task.put("reminder_local", null);
        task.put("repeat_daily", 0);
        task.put("rationale_json", call.getString("rationaleJson", ""));
        task.put("created_at", now);
        task.put("updated_at", now);
        repo().insertTask(task);
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void updateTask(PluginCall call) {
        String id = call.getString("id", "");
        if (repo().getTask(id) == null) {
            call.resolve(error("missing_task"));
            return;
        }
        repo().updateTaskText(id, call.getString("title", ""), call.getString("detail", ""), System.currentTimeMillis());
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void setTaskStatus(PluginCall call) {
        String id = call.getString("id", "");
        String status = call.getString("status", "");
        if (!"active".equals(status) && !"done".equals(status) && !"dismissed".equals(status)) {
            call.resolve(error("bad_status"));
            return;
        }
        if (repo().getTask(id) == null) {
            call.resolve(error("missing_task"));
            return;
        }
        repo().updateTaskStatus(id, status, System.currentTimeMillis());
        if (!"active".equals(status)) {
            ReminderScheduler.cancel(getContext(), id);
        }
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void setReminder(PluginCall call) {
        String id = call.getString("id", "");
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        boolean userConfirmed = Boolean.TRUE.equals(call.getBoolean("userConfirmed", false));
        if (repo().getTask(id) == null) {
            call.resolve(error("missing_task"));
            return;
        }
        if (enabled && !userConfirmed) {
            JSObject denied = error("unconfirmed");
            denied.put("alarmMode", ReminderPolicy.MODE_INEXACT);
            call.resolve(denied);
            return;
        }
        repo().setReminder(
                id,
                enabled,
                call.getString("reminderLocal"),
                Boolean.TRUE.equals(call.getBoolean("repeatDaily", false)),
                zone(call),
                System.currentTimeMillis());
        ReminderPolicy.Decision decision = ReminderScheduler.schedule(getContext(), id, userConfirmed);
        JSObject result = snapshotObject();
        result.put("schedule", decision.schedule);
        result.put("reason", decision.reason);
        result.put("alarmMode", decision.alarmMode);
        result.put("localDate", decision.localDate);
        call.resolve(result);
    }

    @PluginMethod
    public void deleteAll(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("confirmed", false))) {
            call.resolve(error("unconfirmed"));
            return;
        }
        ReminderScheduler.cancelAll(getContext());
        repo().deleteAllUserData();
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void setMeta(PluginCall call) {
        String key = call.getString("key", "");
        if (key.isEmpty() || key.startsWith("device_bind")) {
            call.resolve(error("bad_meta"));
            return;
        }
        repo().setMeta(key, call.getString("value", ""));
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void saveGraphSnapshot(PluginCall call) {
        String threadId = call.getString("threadId", "coach");
        repo().saveGraphSnapshot(
                threadId,
                call.getString("valuesJson", "{}"),
                call.getString("checkpointJson", ""),
                System.currentTimeMillis());
        call.resolve(snapshotObject());
    }

    @PluginMethod
    public void getGraphSnapshot(PluginCall call) {
        Map<String, Object> row = repo().getGraphSnapshot(call.getString("threadId", "coach"));
        JSObject result = new JSObject();
        if (row != null) {
            result.put("threadId", row.get("thread_id"));
            result.put("valuesJson", row.get("values_json"));
            result.put("checkpointJson", row.get("checkpoint_json"));
            result.put("updatedAt", row.get("updated_at"));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void saveCoachResult(PluginCall call) {
        repo().saveCoachResult(
                UUID.randomUUID().toString(),
                call.getString("threadId", "coach"),
                call.getString("status", "unknown"),
                call.getString("summaryJson", "{}"),
                call.getString("resultJson", "{}"),
                System.currentTimeMillis());
        call.resolve(snapshotObject());
    }

    private JSObject snapshotObject() {
        HealthRepository repo = repo();
        JSObject result = new JSObject();
        result.put("database", "android-sqlite");
        result.put("file", WeiguangOpenHelper.FILE_NAME);
        result.put("uninstallDeletesData", true);
        result.put("crossDeviceSync", false);
        result.put("devices", rows(repo.listDevices()));
        result.put("sync", rows(repo.listSync()));
        result.put("goals", rows(repo.listGoals()));
        result.put("tasks", rows(repo.listTasks()));
        result.put("meta", meta(repo.allMeta()));
        result.put("latest", latest(repo));
        JSArray coach = new JSArray();
        for (Map<String, Object> row : repo.listCoachResults(8)) {
            coach.put(map(row));
        }
        result.put("coachResults", coach);
        return result;
    }

    private JSObject latest(HealthRepository repo) {
        JSObject latest = new JSObject();
        String[] metrics = {"battery", "steps", "sleep", "heart_rate", "spo2", "hrv", "temperature", "mood_pressure"};
        for (String metric : metrics) {
            java.util.List<Map<String, Object>> rows = repo.listObservations("", metric, 1);
            if (!rows.isEmpty()) {
                latest.put(metric, map(rows.get(0)));
            }
        }
        return latest;
    }

    private HealthRepository repo() {
        return WeiguangStores.get(getContext());
    }

    private static String zone(PluginCall call) {
        String zone = call.getString("timezone", "");
        if (zone == null || zone.isEmpty()) {
            return java.time.ZoneId.systemDefault().getId();
        }
        return zone;
    }

    private static JSObject error(String code) {
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("error", code);
        return result;
    }

    private static JSArray rows(java.util.List<Map<String, Object>> list) {
        JSArray array = new JSArray();
        for (Map<String, Object> row : list) {
            array.put(map(row));
        }
        return array;
    }

    private static JSObject map(Map<String, Object> row) {
        JSObject object = new JSObject();
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            object.put(entry.getKey(), entry.getValue());
        }
        return object;
    }

    private static JSObject meta(Map<String, String> meta) {
        JSObject object = new JSObject();
        Iterator<Map.Entry<String, String>> it = meta.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, String> entry = it.next();
            if (entry.getKey().startsWith("device_bind")) {
                continue;
            }
            object.put(entry.getKey(), entry.getValue());
        }
        return object;
    }
}
