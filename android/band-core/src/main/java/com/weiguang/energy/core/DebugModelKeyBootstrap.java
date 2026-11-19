package com.weiguang.energy.core;

/**
 * Decides whether a debug build may copy a bundled test key into private preferences.
 * Release builds return before any asset is read. An existing manual key is left as it is.
 */
public final class DebugModelKeyBootstrap {
    public static final String ASSET_NAME = "weiguang_debug_model_key";
    public static final String PREFS_NAME = "weiguang_debug_model";
    public static final String PREFS_KEY = "api_key";
    public static final int MAX_CHARS = 512;

    public interface AssetSource {
        byte[] read();
    }

    public interface Store {
        String get();

        void set(String value);
    }

    private DebugModelKeyBootstrap() {}

    public static void ensure(boolean debugBuild, AssetSource assets, Store store) {
        if (!debugBuild || assets == null || store == null) {
            return;
        }
        String existing = store.get();
        if (existing != null && !existing.trim().isEmpty()) {
            return;
        }
        byte[] raw;
        try {
            raw = assets.read();
        } catch (RuntimeException ignored) {
            return;
        }
        String chosen = choose(raw);
        if (chosen != null) {
            store.set(chosen);
        }
    }

    public static String choose(byte[] raw) {
        if (raw == null || raw.length == 0 || raw.length > 4096) {
            return null;
        }
        String text;
        try {
            text = new String(raw, "UTF-8").trim();
        } catch (Exception ignored) {
            return null;
        }
        if (text.isEmpty() || text.length() > MAX_CHARS || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
            return null;
        }
        return text;
    }
}
