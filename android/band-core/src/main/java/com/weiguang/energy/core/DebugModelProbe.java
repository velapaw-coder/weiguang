package com.weiguang.energy.core;

/**
 * One short Responses call through the same poster and transport as the debug APK.
 * The key is read from VOLC_ARK_API_KEY and is not printed, stored, or taken from arguments.
 * This process passes debugBuild=true so a parent key can be sent. The APK still uses its own debuggable flag.
 */
public final class DebugModelProbe {
    static final String MODEL = "doubao-seed-2-1-lite-260915";

    public static void main(String[] args) {
        long started = System.nanoTime();
        String key = System.getenv("VOLC_ARK_API_KEY");
        if (key == null) {
            key = "";
        }
        int http = 0;
        boolean completed = false;
        boolean answer = false;
        try {
            DebugModelPoster.Outcome outcome = DebugModelPoster.send(
                    true,
                    key.trim(),
                    DebugModelPoster.RESPONSES_URL,
                    requestBody(),
                    HttpsModelTransport.INSTANCE);
            http = outcome.httpStatus;
            if (outcome.sent) {
                completed = completed(outcome.bodyText);
                answer = answer(outcome.bodyText);
            }
        } catch (Exception ignored) {
            http = 0;
            completed = false;
            answer = false;
        }
        long ms = (System.nanoTime() - started) / 1_000_000L;
        System.out.println("http=" + http + " completed=" + completed + " answer=" + answer + " ms=" + ms);
    }

    static String requestBody() {
        return "{\"model\":\"" + MODEL + "\","
                + "\"instructions\":\"你是作息教练。这次没有任何手环数据。不要编造指标，不要假装做了健康分析。用一句简短中文回应问候。\","
                + "\"input\":[{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"你好\"}]}],"
                + "\"stream\":false,\"store\":false,\"max_output_tokens\":256,\"thinking\":{\"type\":\"disabled\"}}";
    }

    static boolean completed(String body) {
        if (body == null) {
            return false;
        }
        return body.contains("\"status\":\"completed\"") || body.contains("\"status\": \"completed\"");
    }

    static boolean answer(String body) {
        if (body == null) {
            return false;
        }
        return textAfter(body, "\"output_text\"") || textAfter(body, "\"text\"");
    }

    private static boolean textAfter(String body, String key) {
        int at = body.indexOf(key);
        if (at < 0) {
            return false;
        }
        int colon = body.indexOf(':', at + key.length());
        if (colon < 0) {
            return false;
        }
        int quote = body.indexOf('"', colon + 1);
        if (quote < 0) {
            return false;
        }
        for (int i = quote + 1; i < body.length(); i++) {
            char c = body.charAt(i);
            if (c == '\\') {
                i++;
                continue;
            }
            if (c == '"') {
                return i > quote + 1;
            }
            if (!Character.isWhitespace(c)) {
                return true;
            }
        }
        return false;
    }

    private DebugModelProbe() {}
}
