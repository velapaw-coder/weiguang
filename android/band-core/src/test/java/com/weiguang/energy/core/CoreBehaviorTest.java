package com.weiguang.energy.core;

import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class CoreBehaviorTest {
    @Test
    public void commandsRunOneAtATimeAndTimeOut() {
        long[] now = {0};
        BandCommandQueue queue = new BandCommandQueue(() -> now[0]);
        int[] started = {0};
        queue.submit("battery", 100, () -> {
            started[0]++;
            return false;
        });
        queue.submit("steps", 100, () -> {
            started[0]++;
            return false;
        });
        assertEquals("battery", queue.activeName());
        assertEquals(1, started[0]);
        now[0] = 100;
        queue.tick();
        assertEquals("steps", queue.activeName());
        assertEquals(2, started[0]);
        assertTrue(queue.succeed("steps"));
        assertNull(queue.activeName());
        assertEquals("timeout", queue.events().get(0).code);
        assertEquals("success", queue.events().get(1).type);
    }

    @Test
    public void skippedCommandDoesNotBlockTheNext() {
        BandCommandQueue queue = new BandCommandQueue(() -> 0);
        queue.submit("heart", 50, () -> true);
        queue.submit("steps", 50, () -> false);
        assertEquals("steps", queue.activeName());
        assertEquals("skipped", queue.events().get(0).code);
    }

    @Test
    public void sqliteSurvivesRestartDedupesAndSeparatesDevices() throws Exception {
        Path file = Files.createTempFile("weiguang", ".db");
        Files.delete(file);
        String path = file.toAbsolutePath().toString();
        String firstKey;
        try (JdbcSession session = new JdbcSession(path)) {
            HealthRepository repo = new HealthRepository(session);
            repo.migrate(1_000);
            assertEquals(2, repo.currentVersion());
            firstKey = ObservationKey.stepsDay("aa:bb:cc:dd:ee:01", "20261118");
            assertTrue(repo.upsertObservation(firstKey, "AA:BB:CC:DD:EE:01", "steps", "20261118", 2_000, "sync-1", "{\"step\":10}", "recorded", 2_000));
            assertFalse(repo.upsertObservation(firstKey, "AA:BB:CC:DD:EE:01", "steps", "20261118", 3_000, "sync-2", "{\"step\":12}", "recorded", 3_000));
            repo.upsertObservation(ObservationKey.stepsDay("aa:bb:cc:dd:ee:02", "20261118"), "AA:BB:CC:DD:EE:02", "steps", "20261118", 3_000, "sync-2", "{\"step\":4}", "recorded", 3_000);
            repo.upsertDevice("AA:BB:CC:DD:EE:01", "K-unknown", null, null, null, "{}", 2_000L, 2_000);
            repo.touchSync("AA:BB:CC:DD:EE:01", "steps", "success", null, "20261118", 3_000L, 3_000);
            repo.touchSync("AA:BB:CC:DD:EE:01", "steps", "running", null, null, null, 4_000);
        }
        try (JdbcSession reopened = new JdbcSession(path)) {
            HealthRepository repo = new HealthRepository(reopened);
            repo.migrate(5_000);
            assertEquals(1, repo.countObservations("AA:BB:CC:DD:EE:01"));
            assertEquals(1, repo.countObservations("AA:BB:CC:DD:EE:02"));
            Map<String, Object> row = repo.listObservations("AA:BB:CC:DD:EE:01", "steps", 5).get(0);
            assertEquals("{\"step\":12}", row.get("value_json"));
            assertEquals(2000L, ((Number) row.get("created_at")).longValue());
            Map<String, Object> sync = repo.listSync().get(0);
            assertEquals("running", sync.get("last_status"));
            assertEquals(3000L, ((Number) sync.get("last_success_at")).longValue());
            assertEquals("20261118", sync.get("cursor_value"));
            assertEquals(1, repo.listDevices().size());
            Map<String, Object> task = new HashMap<>();
            task.put("id", "t1");
            task.put("title", "散步");
            task.put("detail", "用户确认");
            task.put("source", "user");
            task.put("status", "active");
            task.put("due_local", null);
            task.put("timezone", "Asia/Shanghai");
            task.put("reminder_enabled", 0);
            task.put("reminder_local", null);
            task.put("repeat_daily", 0);
            task.put("rationale_json", null);
            task.put("created_at", 6_000L);
            task.put("updated_at", 6_000L);
            repo.insertTask(task);
            repo.updateTaskStatus("t1", "done", 7_000);
            assertEquals(2, repo.listEvents("t1").size());
            repo.saveGraphSnapshot("coach", "{\"ok\":true}", "{\"checkpoint\":1}", 8_000);
            repo.deleteAllUserData();
            assertEquals(0, repo.countObservations("AA:BB:CC:DD:EE:01"));
            assertTrue(repo.listTasks().isEmpty());
            assertNull(repo.getGraphSnapshot("coach"));
            assertEquals(2, repo.currentVersion());
            List<Map<String, Object>> columns = reopened.query("PRAGMA table_info(observations)");
            boolean hasNote = false;
            for (Map<String, Object> column : columns) {
                if ("user_note".equals(column.get("name"))) {
                    hasNote = true;
                }
            }
            assertTrue(hasNote);
        }
    }

    @Test
    public void latestReadingFollowsTheBandClockNotTheReceiveOrder() throws Exception {
        Path file = Files.createTempFile("weiguang-latest", ".db");
        Files.delete(file);
        try (JdbcSession session = new JdbcSession(file.toAbsolutePath().toString())) {
            HealthRepository repo = new HealthRepository(session);
            repo.migrate(1_000);
            String address = "AA:BB:CC:DD:EE:01";
            repo.upsertObservation(ObservationKey.stepsDay(address, "20261119"), address, "steps", "20261119", 2_000, "s", "{\"step\":900}", "recorded", 2_000);
            repo.upsertObservation(ObservationKey.stepsDay(address, "20261117"), address, "steps", "20261117", 3_000, "s", "{\"step\":7000}", "recorded", 3_000);
            assertEquals("20261119", repo.listObservations("", "steps", 1).get(0).get("device_sampled_at"));
            assertEquals("20261119", repo.latestObservation("steps").get("device_sampled_at"));
            repo.upsertObservation(ObservationKey.battery(address, 80, 4_000), address, "battery", null, 4_000, "s", "{\"percent\":80}", "device_time_missing", 4_000);
            repo.upsertObservation(ObservationKey.battery(address, 79, 5_000), address, "battery", null, 5_000, "s", "{\"percent\":79}", "device_time_missing", 5_000);
            assertEquals("{\"percent\":79}", repo.latestObservation("battery").get("value_json"));
            assertEquals(null, repo.latestObservation("sleep"));
        }
    }

    @Test
    public void removingAGoalArchivesEveryDuplicateOfItsText() throws Exception {
        Path file = Files.createTempFile("weiguang-goal", ".db");
        Files.delete(file);
        try (JdbcSession session = new JdbcSession(file.toAbsolutePath().toString())) {
            HealthRepository repo = new HealthRepository(session);
            repo.migrate(1_000);
            repo.saveGoal("random-1", "就寝时间 23:30 前", 1_000);
            repo.saveGoal("random-2", "就寝时间 23:30 前", 2_000);
            repo.saveGoal("random-3", "减少下午疲惫感", 3_000);
            repo.archiveGoalsByText("就寝时间 23:30 前");
            assertEquals(1, repo.listGoals().size());
            assertEquals("减少下午疲惫感", repo.listGoals().get(0).get("text"));
        }
    }

    @Test
    public void migrationFromVersionOneKeepsRows() throws Exception {
        Path file = Files.createTempFile("weiguang-mig", ".db");
        Files.delete(file);
        try (JdbcSession session = new JdbcSession(file.toAbsolutePath().toString())) {
            WeiguangSql.execScript(session, WeiguangSql.migration(1));
            session.exec("INSERT INTO schema_migrations(version, applied_at) VALUES(1, 1)");
            session.exec(
                    "INSERT INTO observations(idempotency_key, device_address, metric, device_sampled_at, phone_received_at, sync_id, value_json, quality, created_at) VALUES('k','AA','steps','20261118',1,'s','{}','recorded',1)");
            HealthRepository repo = new HealthRepository(session);
            repo.migrate(2);
            assertEquals(2, repo.currentVersion());
            assertEquals(1, repo.countObservations("AA"));
            assertNotNull(repo.listObservations("AA", "steps", 1).get(0));
        }
    }

    @Test
    public void remindersNeedConfirmationAndDoNotRepeatByDefault() {
        long now = 1_700_000_000_000L;
        ReminderPolicy.Decision denied = ReminderPolicy.decide(
                true, false, true, "active", false, "2026-11-19T08:00", "Asia/Shanghai",
                now, null, null, ReminderPolicy.DEFAULT_COOLDOWN_MS);
        assertFalse(denied.schedule);
        assertEquals("permission_denied", denied.reason);

        ReminderPolicy.Decision unconfirmed = ReminderPolicy.decide(
                false, true, true, "active", false, "2026-11-19T08:00", "Asia/Shanghai",
                now, null, null, ReminderPolicy.DEFAULT_COOLDOWN_MS);
        assertEquals("unconfirmed", unconfirmed.reason);

        ReminderPolicy.Decision once = ReminderPolicy.decide(
                true, true, true, "active", false, "2026-11-19T08:00", "Asia/Shanghai",
                now, null, null, ReminderPolicy.DEFAULT_COOLDOWN_MS);
        assertTrue(once.schedule);
        assertEquals(ReminderPolicy.MODE_INEXACT, once.alarmMode);
        assertEquals("2026-11-19", once.localDate);

        ReminderPolicy.Decision again = ReminderPolicy.decide(
                true, true, true, "active", false, "2026-11-19T08:00", "Asia/Shanghai",
                now, once.triggerAtMillis, "2026-11-19", ReminderPolicy.DEFAULT_COOLDOWN_MS);
        assertEquals("deduped", again.reason);

        LocalWallTime.Trigger past = LocalWallTime.next("2020-01-01T08:00", "Asia/Shanghai", now, false);
        assertEquals("past", past.reason);
        LocalWallTime.Trigger daily = LocalWallTime.next("08:00", "Asia/Shanghai", now, true);
        assertTrue(daily.ok());
        assertTrue(daily.epochMillis > now);
    }

    @Test
    public void observationKeysDoNotCollapseDifferentDevices() {
        String a = ObservationKey.stepsDay("aa:bb:cc:dd:ee:01", "20261118");
        String b = ObservationKey.stepsDay("aa:bb:cc:dd:ee:02", "20261118");
        assertFalse(a.equals(b));
        assertEquals(a, ObservationKey.stepsDay("AA:BB:CC:DD:EE:01", "20261118"));
    }
}
