package com.weiguang.energy.core;

/**
 * Deterministic reminder gate. The model cannot set this decision.
 * Default is no reminder. Daily repeat is opt-in and still one alarm per task.
 */
public final class ReminderPolicy {
    public static final long DEFAULT_COOLDOWN_MS = 4L * 60L * 60L * 1000L;
    public static final String MODE_INEXACT = "inexact_rtc";

    public static final class Decision {
        public final boolean schedule;
        public final String reason;
        public final long triggerAtMillis;
        public final String localDate;
        public final String alarmMode;

        public Decision(boolean schedule, String reason, long triggerAtMillis, String localDate) {
            this.schedule = schedule;
            this.reason = reason;
            this.triggerAtMillis = triggerAtMillis;
            this.localDate = localDate;
            this.alarmMode = MODE_INEXACT;
        }
    }

    private ReminderPolicy() {}

    public static Decision decide(
            boolean userConfirmed,
            boolean permissionGranted,
            boolean reminderEnabled,
            String taskStatus,
            boolean repeatDaily,
            String reminderLocal,
            String zoneId,
            long nowEpoch,
            Long lastFiredAt,
            String lastFiredLocalDate,
            long cooldownMs) {
        if (!userConfirmed) {
            return new Decision(false, "unconfirmed", -1, null);
        }
        if (!reminderEnabled) {
            return new Decision(false, "disabled", -1, null);
        }
        if (!"active".equals(taskStatus)) {
            return new Decision(false, "inactive", -1, null);
        }
        if (!permissionGranted) {
            return new Decision(false, "permission_denied", -1, null);
        }
        LocalWallTime.Trigger trigger = LocalWallTime.next(reminderLocal, zoneId, nowEpoch, repeatDaily);
        if (!trigger.ok()) {
            return new Decision(false, trigger.reason == null ? "bad_local_time" : trigger.reason, -1, trigger.localDate);
        }
        if (trigger.localDate != null && trigger.localDate.equals(lastFiredLocalDate)) {
            return new Decision(false, "deduped", trigger.epochMillis, trigger.localDate);
        }
        if (lastFiredAt != null && nowEpoch - lastFiredAt < cooldownMs) {
            return new Decision(false, "cooldown", trigger.epochMillis, trigger.localDate);
        }
        return new Decision(true, "scheduled", trigger.epochMillis, trigger.localDate);
    }
}
