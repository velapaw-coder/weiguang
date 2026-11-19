package com.weiguang.energy.demo;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;

import com.weiguang.energy.core.DebugModelKeyBootstrap;
import com.weiguang.energy.core.DebugModelMock;
import com.weiguang.energy.core.DebugModelPoster;
import com.weiguang.energy.core.HealthRepository;
import com.weiguang.energy.core.HttpsModelTransport;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The same native path {@link WeiguangStorePlugin} uses for consent, debug model POST,
 * SQLite coach_results, and explicit task save. Instrumentation tests call this directly
 * so they exercise the real store + {@link HttpsModelTransport} without WebView CDP.
 */
public final class WeiguangCoachBridge {
    public static final String CONSENT_KEY = "ai_consent";
    public static final String MOCK_LOOPBACK = "http://10.0.2.2:18787/api/v3/responses";

    private final Context app;
    private final AtomicInteger requestSeq = new AtomicInteger(0);

    public WeiguangCoachBridge(Context context) {
        this.app = context.getApplicationContext();
    }

    public HealthRepository repo() {
        return WeiguangStores.get(app);
    }

    public boolean isDebugBuild() {
        return (app.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    public SharedPreferences debugPrefs() {
        return app.getSharedPreferences(DebugModelKeyBootstrap.PREFS_NAME, Context.MODE_PRIVATE);
    }

    public void setConsent(String value) {
        repo().setMeta(CONSENT_KEY, value);
    }

    public String getConsent() {
        return repo().getMeta(CONSENT_KEY);
    }

    /** Fake local key only. Never a real Volcano secret. */
    public void setDebugKey(String fakeKey) {
        if (!isDebugBuild()) {
            return;
        }
        debugPrefs().edit().putString(DebugModelKeyBootstrap.PREFS_KEY, fakeKey == null ? "" : fakeKey.trim()).apply();
    }

    public void setMockResponsesUrl(String url) {
        if (!isDebugBuild()) {
            return;
        }
        if (url == null || url.trim().isEmpty()) {
            debugPrefs().edit().remove(DebugModelMock.PREFS_KEY).apply();
            return;
        }
        debugPrefs().edit().putString(DebugModelMock.PREFS_KEY, url.trim()).apply();
    }

    public String transportTarget() {
        String mock = debugPrefs().getString(DebugModelMock.PREFS_KEY, "");
        return DebugModelMock.resolveTransportUrl(isDebugBuild(), DebugModelPoster.RESPONSES_URL, mock);
    }

    public boolean mockEnabled() {
        return !DebugModelPoster.RESPONSES_URL.equals(transportTarget());
    }

    /**
     * Same gate + transport as {@link WeiguangStorePlugin#postDebugModel}: poster validates the
     * official URL contract, then {@link #postHttps} may rewrite to a loopback mock in debug only.
     */
    public DebugModelPoster.Outcome postDebugModel(String body) throws Exception {
        String key = isDebugBuild() ? debugPrefs().getString(DebugModelKeyBootstrap.PREFS_KEY, "") : "";
        return DebugModelPoster.send(
                isDebugBuild(),
                key,
                DebugModelPoster.RESPONSES_URL,
                body,
                this::postHttps);
    }

    DebugModelPoster.Response postHttps(String url, String authorization, String body) throws Exception {
        String mock = debugPrefs().getString(DebugModelMock.PREFS_KEY, "");
        String target = DebugModelMock.resolveTransportUrl(isDebugBuild(), url, mock);
        return HttpsModelTransport.INSTANCE.post(target, authorization, body);
    }

    public int beginRequest() {
        return requestSeq.incrementAndGet();
    }

    /** Matches App.jsx cancel: bump the sequence so in-flight ids no longer match. */
    public void cancelInFlight() {
        requestSeq.incrementAndGet();
    }

    public int currentRequest() {
        return requestSeq.get();
    }

    public boolean persistCoachResultIfCurrent(int requestId, String status, String summaryJson, String resultJson) {
        if (requestId != requestSeq.get()) {
            return false;
        }
        repo().saveCoachResult(
                UUID.randomUUID().toString(),
                "coach",
                status,
                summaryJson == null ? "{}" : summaryJson,
                resultJson == null ? "{}" : resultJson,
                System.currentTimeMillis());
        return true;
    }

    public List<Map<String, Object>> listCoachResults(int limit) {
        return repo().listCoachResults(limit);
    }

    public Map<String, Object> latestObservation(String metric) {
        return repo().latestObservation(metric);
    }

    /**
     * Task proposals from the model are not tasks until the user confirms.
     * This is the only write path that creates a plan row from a proposal.
     */
    public String confirmAndSaveTask(String title, String detail, String source) {
        long now = System.currentTimeMillis();
        HashMap<String, Object> task = new HashMap<>();
        task.put("id", UUID.randomUUID().toString());
        task.put("title", title);
        task.put("detail", detail == null ? "" : detail);
        task.put("source", source);
        task.put("status", "active");
        task.put("due_local", null);
        task.put("timezone", java.time.ZoneId.systemDefault().getId());
        task.put("reminder_enabled", 0);
        task.put("reminder_local", null);
        task.put("repeat_daily", 0);
        task.put("rationale_json", "");
        task.put("created_at", now);
        task.put("updated_at", now);
        repo().insertTask(task);
        return String.valueOf(task.get("id"));
    }

    public List<Map<String, Object>> listTasks() {
        return repo().listTasks();
    }

    public void deleteAllUserData() {
        repo().deleteAllUserData();
    }

    /** Drop the in-process SQLite handle so the next {@link WeiguangStores#get} reopens the on-disk file. */
    public void reopenDatabaseLikeProcessRestart() {
        WeiguangStores.resetForTests();
    }

    public static String minimalResponsesBody(String summaryText) {
        return "{\"model\":\"doubao-seed-2-1-lite-260915\",\"store\":false,\"thinking\":{\"type\":\"disabled\"},"
                + "\"max_output_tokens\":256,\"input\":[{\"text\":"
                + jsonString(summaryText)
                + "}]}";
    }

    private static String jsonString(String value) {
        String escaped = value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n");
        return "\"" + escaped + "\"";
    }
}
