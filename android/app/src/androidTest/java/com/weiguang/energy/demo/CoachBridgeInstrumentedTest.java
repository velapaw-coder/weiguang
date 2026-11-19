package com.weiguang.energy.demo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.weiguang.energy.core.DebugModelPoster;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Device instrumentation for the real coach native path (same classes as WeiguangStorePlugin):
 * consent meta, HttpsModelTransport → local MOCK Responses, SQLite coach_results, cancel gate,
 * explicit task confirm. Does not use WebView CDP or System UI clicks.
 *
 * Mock answers are marked [MOCK] and are not the real Volcano model. Real keys never enter this VM.
 */
@RunWith(AndroidJUnit4.class)
public class CoachBridgeInstrumentedTest {
    private static final String FAKE_KEY = "mock-local-e2e-key-not-volcano";
    private Context context;
    private WeiguangCoachBridge bridge;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        WeiguangStores.resetForTests();
        bridge = new WeiguangCoachBridge(context);
        bridge.deleteAllUserData();
        bridge.setMockResponsesUrl(null);
        bridge.setDebugKey("");
    }

    @After
    public void tearDown() {
        bridge.setMockResponsesUrl(null);
        bridge.setDebugKey("");
        bridge.deleteAllUserData();
        WeiguangStores.resetForTests();
    }

    @Test
    public void withoutMockPrefsTransportStaysOnOfficialUrl() {
        bridge.setDebugKey(FAKE_KEY);
        bridge.setMockResponsesUrl(null);
        assertEquals(DebugModelPoster.RESPONSES_URL, bridge.transportTarget());
        assertFalse(bridge.mockEnabled());
    }

    @Test
    public void consentPostPersistRestoreCancelRetryAndExplicitTask() throws Exception {
        assertTrue("debug APK required for mock redirect", bridge.isDebugBuild());

        // --- consent ---
        assertNull(bridge.getConsent());
        bridge.setConsent("yes");
        assertEquals("yes", bridge.getConsent());

        // --- mock only when explicit loopback prefs ---
        bridge.setDebugKey(FAKE_KEY);
        bridge.setMockResponsesUrl(WeiguangCoachBridge.MOCK_LOOPBACK);
        assertTrue(bridge.mockEnabled());
        assertEquals(WeiguangCoachBridge.MOCK_LOOPBACK, bridge.transportTarget());

        // Control mock: fast answer tagged B
        assertTrue(controlMock("{\"delayMs\":0,\"answerTag\":\"B\",\"resetCount\":true}"));

        // --- empty records: no fabricated energy observation ---
        assertNull(bridge.latestObservation("steps"));
        assertNull(bridge.latestObservation("sleep"));
        assertNull(bridge.latestObservation("heart_rate"));
        assertTrue(bridge.listTasks().isEmpty());

        String body = WeiguangCoachBridge.minimalResponsesBody("无手环记录，不要编造精力分");
        int reqOk = bridge.beginRequest();
        DebugModelPoster.Outcome outcome = bridge.postDebugModel(body);
        assertTrue("sent via HttpsModelTransport", outcome.sent);
        assertEquals(200, outcome.httpStatus);
        assertNotNull(outcome.bodyText);
        assertTrue(outcome.bodyText.contains("[MOCK"));
        assertTrue(outcome.bodyText.contains("[MOCK-B]") || outcome.bodyText.contains("MOCK"));
        assertFalse("must not look like a silent real-model path without marker", outcome.bodyText.contains("\"output_text\":\"已对照\"") && !outcome.bodyText.contains("MOCK"));

        JSONObject parsed = new JSONObject(outcome.bodyText);
        assertEquals("completed", parsed.optString("status"));
        String mockText = parsed.optString("output_text");
        assertTrue(mockText.contains("[MOCK"));

        boolean saved = bridge.persistCoachResultIfCurrent(
                reqOk,
                "ok",
                "{\"empty\":true}",
                "{\"question\":\"自由提问\",\"modelText\":" + jsonQuote(mockText) + ",\"proposals\":[{\"title\":\"睡前放下手机十分钟\",\"detail\":\"需确认\"}]}");
        assertTrue(saved);

        List<Map<String, Object>> rows = bridge.listCoachResults(5);
        assertFalse(rows.isEmpty());
        String stored = String.valueOf(rows.get(0).get("result_json"));
        assertTrue(stored.contains("[MOCK"));
        assertTrue(stored.contains("自由提问"));

        // Proposals in result_json must NOT auto-create tasks
        assertTrue("task requires explicit confirm", bridge.listTasks().isEmpty());

        // --- kill-process style reopen ---
        bridge.reopenDatabaseLikeProcessRestart();
        bridge = new WeiguangCoachBridge(context);
        assertEquals("yes", bridge.getConsent());
        List<Map<String, Object>> restored = bridge.listCoachResults(5);
        assertFalse(restored.isEmpty());
        assertTrue(String.valueOf(restored.get(0).get("result_json")).contains("[MOCK"));

        // Re-apply mock prefs after reopen (prefs survive; ensure still set)
        bridge.setDebugKey(FAKE_KEY);
        bridge.setMockResponsesUrl(WeiguangCoachBridge.MOCK_LOOPBACK);

        // --- cancel + retry must not cross-wire ---
        assertTrue(controlMock("{\"delayMs\":8000,\"answerTag\":\"SLOW\",\"resetCount\":false}"));
        int slowId = bridge.beginRequest();
        CountDownLatch slowStarted = new CountDownLatch(1);
        CountDownLatch slowDone = new CountDownLatch(1);
        AtomicReference<DebugModelPoster.Outcome> slowOutcome = new AtomicReference<>();
        AtomicReference<Boolean> slowPersisted = new AtomicReference<>(false);
        new Thread(() -> {
            try {
                slowStarted.countDown();
                DebugModelPoster.Outcome o = bridge.postDebugModel(
                        WeiguangCoachBridge.minimalResponsesBody("慢请求应被取消"));
                slowOutcome.set(o);
                slowPersisted.set(bridge.persistCoachResultIfCurrent(
                        slowId,
                        "ok",
                        "{}",
                        "{\"question\":\"慢请求\",\"modelText\":" + jsonQuote(o.bodyText) + "}"));
            } catch (Exception e) {
                slowOutcome.set(null);
            } finally {
                slowDone.countDown();
            }
        }, "slow-mock").start();

        assertTrue(slowStarted.await(5, TimeUnit.SECONDS));
        Thread.sleep(300);
        bridge.cancelInFlight();

        assertTrue(controlMock("{\"delayMs\":0,\"answerTag\":\"FAST\"}"));
        int fastId = bridge.beginRequest();
        DebugModelPoster.Outcome fast = bridge.postDebugModel(
                WeiguangCoachBridge.minimalResponsesBody("快请求应保留"));
        assertTrue(fast.sent);
        assertTrue(fast.bodyText.contains("[MOCK-FAST]") || fast.bodyText.contains("MOCK-FAST") || fast.bodyText.contains("[MOCK"));
        boolean fastSaved = bridge.persistCoachResultIfCurrent(
                fastId,
                "ok",
                "{}",
                "{\"question\":\"快请求\",\"modelText\":" + jsonQuote(fast.bodyText) + "}");
        assertTrue(fastSaved);

        assertTrue("slow mock should finish or timeout within bound", slowDone.await(20, TimeUnit.SECONDS));
        assertFalse("cancelled slow must not persist", Boolean.TRUE.equals(slowPersisted.get()));

        List<Map<String, Object>> afterCancel = bridge.listCoachResults(8);
        boolean hasFast = false;
        boolean hasSlowQuestion = false;
        for (Map<String, Object> row : afterCancel) {
            String json = String.valueOf(row.get("result_json"));
            if (json.contains("快请求")) {
                hasFast = true;
            }
            if (json.contains("慢请求")) {
                hasSlowQuestion = true;
            }
        }
        assertTrue(hasFast);
        assertFalse("slow cancelled result must not appear in SQLite", hasSlowQuestion);

        // --- explicit task confirmation ---
        String taskId = bridge.confirmAndSaveTask("睡前放下手机十分钟", "用户确认后才写入", "langgraph");
        assertNotNull(taskId);
        assertEquals(1, bridge.listTasks().size());
        assertEquals("睡前放下手机十分钟", bridge.listTasks().get(0).get("title"));
    }

    private static boolean controlMock(String json) throws Exception {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection)
                new java.net.URL("http://10.0.2.2:18787/control").openConnection();
        c.setConnectTimeout(5000);
        c.setReadTimeout(5000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        byte[] bytes = json.getBytes("UTF-8");
        c.setFixedLengthStreamingMode(bytes.length);
        c.getOutputStream().write(bytes);
        int status = c.getResponseCode();
        c.disconnect();
        return status == 200;
    }

    private static String jsonQuote(String value) {
        if (value == null) {
            return "\"\"";
        }
        return JSONObject.quote(value);
    }
}
