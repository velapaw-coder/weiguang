package com.weiguang.energy.core;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/** Phone-timezone wall clock. Does not invent a device time. */
public final class LocalWallTime {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    private LocalWallTime() {}

    public static final class Trigger {
        public final long epochMillis;
        public final String localDate;
        public final String reason;

        public Trigger(long epochMillis, String localDate, String reason) {
            this.epochMillis = epochMillis;
            this.localDate = localDate;
            this.reason = reason;
        }

        public boolean ok() {
            return epochMillis > 0 && reason == null;
        }
    }

    /**
     * @param localDateTime {@code yyyy-MM-ddTHH:mm} for one shot, or {@code HH:mm} when daily
     */
    public static Trigger next(String localDateTime, String zoneId, long nowEpoch, boolean daily) {
        ZoneId zone;
        try {
            zone = ZoneId.of(zoneId);
        } catch (RuntimeException ex) {
            return new Trigger(-1, null, "bad_timezone");
        }
        ZonedDateTime now = Instant.ofEpochMilli(nowEpoch).atZone(zone);
        try {
            if (daily) {
                LocalTime time = LocalTime.parse(localDateTime);
                ZonedDateTime candidate = now.toLocalDate().atTime(time).atZone(zone);
                if (!candidate.toInstant().isAfter(now.toInstant())) {
                    candidate = candidate.plusDays(1);
                }
                return new Trigger(candidate.toInstant().toEpochMilli(), candidate.toLocalDate().format(DATE), null);
            }
            LocalDateTime wall = LocalDateTime.parse(localDateTime);
            ZonedDateTime candidate = wall.atZone(zone);
            if (!candidate.toInstant().isAfter(now.toInstant())) {
                return new Trigger(-1, candidate.toLocalDate().format(DATE), "past");
            }
            return new Trigger(candidate.toInstant().toEpochMilli(), candidate.toLocalDate().format(DATE), null);
        } catch (RuntimeException ex) {
            return new Trigger(-1, null, "bad_local_time");
        }
    }

    public static String localDate(long epochMillis, String zoneId) {
        return Instant.ofEpochMilli(epochMillis).atZone(ZoneId.of(zoneId)).toLocalDate().format(DATE);
    }

    public static LocalDate parseDate(String text) {
        return LocalDate.parse(text);
    }
}
