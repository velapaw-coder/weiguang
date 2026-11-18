package com.weiguang.energy.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class DebugModelPosterTest {
    private static final String BODY = "{\"model\":\"doubao-seed-2-1-lite-260915\",\"store\":false,\"thinking\":{\"type\":\"disabled\"},\"max_output_tokens\":256,\"input\":[{\"text\":\"步数 1\"}]}";

    @Test
    public void releaseDoesNotCallTheNetwork() throws Exception {
        int[] calls = {0};
        DebugModelPoster.Outcome outcome = DebugModelPoster.send(false, "secret-key", DebugModelPoster.RESPONSES_URL, BODY, (url, authorization, body) -> {
            calls[0]++;
            return new DebugModelPoster.Response(200, "no");
        });
        assertEquals(0, calls[0]);
        assertEquals("release_direct_disabled", outcome.reason);
        assertFalse(outcome.sent);
        assertFalse(String.valueOf(outcome.bodyText).contains("secret-key"));
    }

    @Test
    public void debugPostsTheSummaryAndDoesNotReturnTheKey() throws Exception {
        String[] seen = new String[3];
        DebugModelPoster.Outcome outcome = DebugModelPoster.send(true, "secret-key", DebugModelPoster.RESPONSES_URL, BODY, (url, authorization, body) -> {
            seen[0] = url;
            seen[1] = authorization;
            seen[2] = body;
            return new DebugModelPoster.Response(200, "{\"status\":\"completed\",\"output_text\":\"已对照\"}");
        });
        assertTrue(outcome.sent);
        assertEquals(200, outcome.httpStatus);
        assertEquals(DebugModelPoster.RESPONSES_URL, seen[0]);
        assertEquals("Bearer secret-key", seen[1]);
        assertTrue(seen[2].contains("\"store\":false"));
        assertFalse(outcome.bodyText.contains("secret-key"));
        assertFalse(outcome.reason.contains("secret-key"));
    }

    @Test
    public void missingKeyWrongHostOrKeyInsideTheBodyAreBlocked() throws Exception {
        int[] calls = {0};
        DebugModelPoster.Transport transport = (url, authorization, body) -> {
            calls[0]++;
            return new DebugModelPoster.Response(200, "");
        };
        assertEquals("key_not_configured", DebugModelPoster.send(true, "  ", DebugModelPoster.RESPONSES_URL, BODY, transport).reason);
        assertEquals("bad_url", DebugModelPoster.send(true, "secret-key", "https://example.com", BODY, transport).reason);
        assertEquals("bad_contract", DebugModelPoster.send(true, "secret-key", DebugModelPoster.RESPONSES_URL, BODY.replace("false", "true"), transport).reason);
        assertEquals("bad_contract", DebugModelPoster.send(true, "secret-key", DebugModelPoster.RESPONSES_URL, BODY + "secret-key", transport).reason);
        assertEquals(0, calls[0]);
    }
}
