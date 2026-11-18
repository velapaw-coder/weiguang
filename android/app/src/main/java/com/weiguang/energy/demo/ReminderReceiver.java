package com.weiguang.energy.demo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.weiguang.energy.core.HealthRepository;

import java.util.Map;

public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        String taskId = intent.getStringExtra(ReminderScheduler.EXTRA_TASK_ID);
        String localDate = intent.getStringExtra(ReminderScheduler.EXTRA_LOCAL_DATE);
        if (taskId == null || localDate == null) {
            return;
        }
        HealthRepository repo = WeiguangStores.get(context);
        Map<String, Object> task = repo.getTask(taskId);
        if (task == null) {
            return;
        }
        long enabled = task.get("reminder_enabled") instanceof Number
                ? ((Number) task.get("reminder_enabled")).longValue() : 0L;
        if (enabled != 1 || !"active".equals(String.valueOf(task.get("status")))) {
            return;
        }
        long now = System.currentTimeMillis();
        if (!repo.recordReminderFire(taskId, localDate, now)) {
            return;
        }
        if (!ReminderScheduler.notificationsAllowed(context)) {
            repo.addEvent(taskId, "reminder_permission_denied", localDate, now);
            return;
        }
        Object title = task.get("title");
        ReminderScheduler.show(context, taskId, title == null ? "" : String.valueOf(title));
        long daily = task.get("repeat_daily") instanceof Number
                ? ((Number) task.get("repeat_daily")).longValue() : 0L;
        if (daily == 1) {
            ReminderScheduler.schedule(context, taskId, true);
        }
    }
}
