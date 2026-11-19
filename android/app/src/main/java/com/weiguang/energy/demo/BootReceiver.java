package com.weiguang.energy.demo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.weiguang.energy.core.HealthRepository;

import java.util.Map;

/** Restores reminders the user already confirmed. Does not start Bluetooth polling. */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            return;
        }
        HealthRepository repo = WeiguangStores.get(context);
        for (Map<String, Object> task : repo.listTasks()) {
            long enabled = task.get("reminder_enabled") instanceof Number
                    ? ((Number) task.get("reminder_enabled")).longValue() : 0L;
            if (enabled == 1 && "active".equals(String.valueOf(task.get("status")))) {
                ReminderScheduler.schedule(context, String.valueOf(task.get("id")), true);
            }
        }
    }
}
