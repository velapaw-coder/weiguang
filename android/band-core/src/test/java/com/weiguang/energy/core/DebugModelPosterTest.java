package com.weiguang.energy.core;

import com.sun.net.httpserver.HttpServer;
import org.junit.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

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

    @Test
    public void apkTransportPostsToALocalServerWithoutNeedingAndroid() throws Exception {
        AtomicReference<String> seenBody = new AtomicReference<>("");
        AtomicReference<String> seenType = new AtomicReference<>("");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/responses", exchange -> {
            seenType.set(exchange.getRequestHeaders().getFirst("content-type"));
            seenBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{\"status\":\"completed\",\"output_text\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(response);
            }
        });
        server.start();
        try {
            String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/responses";
            DebugModelPoster.Response response = new HttpsModelTransport().post(url, "Bearer harness-key", DebugModelProbe.requestBody());
            assertEquals(200, response.status);
            assertEquals(true, DebugModelProbe.completed(response.body));
            assertEquals(true, DebugModelProbe.answer(response.body));
            assertEquals(true, seenBody.get().contains("\"store\":false"));
            assertEquals("application/json", seenType.get());
            assertEquals(false, seenBody.get().contains("harness-key"));
            assertEquals("bad_url", DebugModelPoster.send(true, "harness-key", url, seenBody.get(), (target, authorization, body) -> {
                throw new AssertionError("poster must keep the official url");
            }).reason);
        } finally {
            server.stop(0);
        }
    }
}
