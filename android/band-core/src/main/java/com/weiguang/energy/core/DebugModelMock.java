package com.weiguang.energy.core;

/**
 * Debug-only helper that can redirect the transport URL to a local mock Responses
 * endpoint. Release builds always keep the official URL. The poster still validates
 * the official contract URL before the transport runs.
 */
public final class DebugModelMock {
    public static final String PREFS_KEY = "mock_responses_url";

    private DebugModelMock() {}

    public static String resolveTransportUrl(boolean debugBuild, String officialUrl, String mockUrl) {
        if (!debugBuild) {
            return officialUrl;
        }
        if (mockUrl == null) {
            return officialUrl;
        }
        String trimmed = mockUrl.trim();
        if (trimmed.isEmpty()) {
            return officialUrl;
        }
        if (!acceptableMock(trimmed)) {
            return officialUrl;
        }
        return trimmed;
    }

    static boolean acceptableMock(String url) {
        return url.startsWith("http://10.0.2.2:")
                || url.startsWith("http://127.0.0.1:")
                || url.startsWith("http://localhost:");
    }
}
