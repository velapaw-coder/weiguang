package com.weiguang.energy.demo;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.weiguang.energy.core.HealthRepository;
import com.weiguang.energy.core.ReminderPolicy;

import java.util.Map;

/**
 * User-confirmed inexact reminders. Exact alarms are intentionally not used.
 * Android may defer delivery; this is not a 10-minute device poll.
 */
public final class ReminderScheduler {
    public static final String CHANNEL_ID = "weiguang_tasks";
    public static final String EXTRA_TASK_ID = "taskId";
    public static final String EXTRA_LOCAL_DATE = "localDate";

    private ReminderScheduler() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) {
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "任务提醒", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("只在你确认某个任务的提醒后使用。系统可能会推迟响铃。");
        manager.createNotificationChannel(channel);
    }

    public static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static ReminderPolicy.Decision schedule(Context context, String taskId, boolean userConfirmed) {
        ensureChannel(context);
        HealthRepository repo = WeiguangStores.get(context);
        Map<String, Object> task = repo.getTask(taskId);
        if (task == null) {
            return new ReminderPolicy.Decision(false, "missing_task", -1, null);
        }
        boolean enabled = number(task.get("reminder_enabled")) == 1;
        boolean daily = number(task.get("repeat_daily")) == 1;
        String status = string(task.get("status"));
        String local = string(task.get("reminder_local"));
        String zone = string(task.get("timezone"));
        if (zone == null || zone.isEmpty()) {
            zone = java.time.ZoneId.systemDefault().getId();
        }
        Map<String, Object> last = repo.lastReminderFire(taskId);
        Long lastAt = last == null || last.get("fired_at") == null ? null : number(last.get("fired_at"));
        String lastDate = last == null ? null : string(last.get("local_date"));
        long now = System.currentTimeMillis();
        ReminderPolicy.Decision decision = ReminderPolicy.decide(
                userConfirmed, notificationsAllowed(context), enabled, status, daily, local, zone,
                now, lastAt, lastDate, ReminderPolicy.DEFAULT_COOLDOWN_MS);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (!decision.schedule || alarms == null) {
            cancel(context, taskId);
            return decision;
        }
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.putExtra(EXTRA_TASK_ID, taskId);
        intent.putExtra(EXTRA_LOCAL_DATE, decision.localDate);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, taskId.hashCode(), intent, pendingFlags());
        alarms.set(AlarmManager.RTC, decision.triggerAtMillis, pending);
        return decision;
    }

    public static void cancel(Context context, String taskId) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }
        Intent intent = new Intent(context, ReminderReceiver.class);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, taskId.hashCode(), intent, pendingFlags());
        alarms.cancel(pending);
    }

    public static void cancelAll(Context context) {
        HealthRepository repo = WeiguangStores.get(context);
        for (Map<String, Object> task : repo.listTasks()) {
            cancel(context, string(task.get("id")));
        }
    }

    public static void show(Context context, String taskId, String title) {
        ensureChannel(context);
        if (!notificationsAllowed(context)) {
            return;
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("微光提醒")
                .setContentText(title == null || title.isEmpty() ? "你确认过的任务到时间了" : title)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                        (title == null ? "任务" : title) + "。这是日程提醒，不是健康警报。"))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(context).notify(taskId.hashCode(), builder.build());
    }

    private static int pendingFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    private static long number(Object value) {
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }

    private static String string(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
