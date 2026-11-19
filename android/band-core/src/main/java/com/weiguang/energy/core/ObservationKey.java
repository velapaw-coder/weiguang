package com.weiguang.energy.core;

/**
 * Natural keys for one physical sample. A repeated sync of the same sample
 * updates that row instead of inserting another.
 */
public final class ObservationKey {
    private ObservationKey() {}

    public static String of(String metric, String address, String sampleId) {
        if (metric == null || metric.isEmpty() || address == null || address.isEmpty()) {
            throw new IllegalArgumentException("metric and device address are required");
        }
        String sample = sampleId == null || sampleId.isEmpty() ? "unknown" : sampleId;
        return metric + "|" + address.toUpperCase() + "|" + sample;
    }

    public static String battery(String address, int percent, long phoneReceivedAt) {
        long minute = Math.max(0, phoneReceivedAt) / 60000L;
        return of("battery", address, percent + "|" + minute);
    }

    public static String stepsDay(String address, String calendar) {
        return of("steps", address, "day|" + calendar);
    }

    public static String stepsHour(String address, String calendar, int hour) {
        return of("steps_hour", address, "hour|" + calendar + "|" + hour);
    }
}
