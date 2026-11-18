package com.weiguang.energy.core;

import java.util.regex.Pattern;

/** Short local crash note. Addresses and secrets are removed before it is stored. */
public final class ConnectDiagnostic {
    private static final Pattern MAC = Pattern.compile("([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}");
    private static final Pattern SECRET = Pattern.compile("(?i)(api[_-]?key|authorization|bearer|token)\\s*[:=]\\s*\\S+");
    private static final Pattern LONG_TOKEN = Pattern.compile("\\b[A-Za-z0-9_\\-]{24,}\\b");

    private ConnectDiagnostic() {}

    public static String format(String phase, Throwable error) {
        String kind = error == null ? "unknown" : error.getClass().getName();
        String message = error == null || error.getMessage() == null ? "" : redact(error.getMessage());
        if (message.length() > 160) {
            message = message.substring(0, 160);
        }
        StringBuilder frames = new StringBuilder();
        if (error != null) {
            int kept = 0;
            for (StackTraceElement frame : error.getStackTrace()) {
                String name = frame.getClassName();
                if (name.contains("weiguang") || name.contains("utesdk") || name.contains("bluetooth")) {
                    frames.append(name).append('.').append(frame.getMethodName()).append('\n');
                    if (++kept == 6) {
                        break;
                    }
                }
            }
        }
        return "phase=" + redact(phase) + "\nkind=" + kind + "\nmessage=" + message + "\nframes=\n" + frames;
    }

    public static String redact(String text) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        String hidden = MAC.matcher(text).replaceAll("xx:xx:xx:xx:xx:xx");
        hidden = SECRET.matcher(hidden).replaceAll("$1=[redacted]");
        return LONG_TOKEN.matcher(hidden).replaceAll("[redacted]");
    }
}
