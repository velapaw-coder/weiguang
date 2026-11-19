package com.weiguang.energy.core;

/**
 * Device values stay in the units the UTE beans already expose.
 * Body temperature is the SDK float. Values outside 30–45 °C are kept only as invalid, not rescaled.
 * Sleep identity uses the SDK calendar plus its start and end, including a session that crosses midnight.
 */
public final class VitalSample {
    private VitalSample() {}

    public static boolean bodyCelsiusPlausible(float celsius) {
        return !Float.isNaN(celsius) && !Float.isInfinite(celsius) && celsius >= 30f && celsius <= 45f;
    }

    /**
     * Day a step total belongs to. A realtime step packet leaves the day bean's date empty while its
     * hour buckets still carry it; the day is then the newest of those. Empty when neither has one.
     */
    public static String stepDay(String dayCalendar, Iterable<String> hourCalendars) {
        if (dayCalendar != null && !dayCalendar.trim().isEmpty()) {
            return dayCalendar.trim();
        }
        String newest = "";
        if (hourCalendars != null) {
            for (String calendar : hourCalendars) {
                if (calendar != null && calendar.trim().compareTo(newest) > 0) {
                    newest = calendar.trim();
                }
            }
        }
        return newest;
    }

    public static String sleepId(String calendar, int start, int end) {
        String day = calendar == null ? "" : calendar.trim();
        return day + "|" + start + "|" + end;
    }
}
