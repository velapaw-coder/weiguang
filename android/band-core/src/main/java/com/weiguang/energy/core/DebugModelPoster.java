package com.weiguang.energy.core;

/**
 * Debug-only gate for a direct Volcano request. Release builds never call the transport.
 * The API key is an input to the request and is not copied into the outcome.
 */
public final class DebugModelPoster {
    public static final String RESPONSES_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";

    public interface Transport {
        Response post(String url, String authorization, String body) throws Exception;
    }

    public static final class Response {
        public final int status;
        public final String body;

        public Response(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    public static final class Outcome {
        public final boolean sent;
        public final String reason;
        public final int httpStatus;
        public final String bodyText;

        private Outcome(boolean sent, String reason, int httpStatus, String bodyText) {
            this.sent = sent;
            this.reason = reason;
            this.httpStatus = httpStatus;
            this.bodyText = bodyText;
        }

        static Outcome blocked(String reason) {
            return new Outcome(false, reason, 0, "");
        }

        static Outcome sent(int status, String body) {
            return new Outcome(true, "", status, body == null ? "" : body);
        }
    }

    private DebugModelPoster() {}

    public static Outcome send(boolean debugBuild, String apiKey, String url, String body, Transport transport) throws Exception {
        if (!debugBuild) {
            return Outcome.blocked("release_direct_disabled");
        }
        if (apiKey == null || apiKey.trim().isEmpty()) {
            return Outcome.blocked("key_not_configured");
        }
        if (!RESPONSES_URL.equals(url)) {
            return Outcome.blocked("bad_url");
        }
        if (!acceptableBody(body, apiKey)) {
            return Outcome.blocked("bad_contract");
        }
        Response response = transport.post(url, "Bearer " + apiKey.trim(), body);
        return Outcome.sent(response.status, response.body);
    }

    static boolean acceptableBody(String body, String apiKey) {
        if (body == null || body.isEmpty()) {
            return false;
        }
        if (body.contains(apiKey.trim())) {
            return false;
        }
        return body.contains("\"store\":false")
                && body.contains("\"type\":\"disabled\"")
                && body.contains("\"max_output_tokens\":256");
    }
}
