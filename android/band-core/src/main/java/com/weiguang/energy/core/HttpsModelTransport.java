package com.weiguang.energy.core;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The HTTP transport the debug Android plugin uses. It depends only on the JDK.
 */
public final class HttpsModelTransport implements DebugModelPoster.Transport {
    public static final HttpsModelTransport INSTANCE = new HttpsModelTransport();

    public HttpsModelTransport() {}

    @Override
    public DebugModelPoster.Response post(String url, String authorization, String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(20000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("content-type", "application/json");
            connection.setRequestProperty("authorization", authorization);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.getOutputStream().write(bytes);
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new DebugModelPoster.Response(status, readText(stream));
        } finally {
            connection.disconnect();
        }
    }

    static String readText(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[4096];
        int count;
        while ((count = stream.read(chunk)) >= 0) {
            buffer.write(chunk, 0, count);
        }
        return new String(buffer.toByteArray(), "UTF-8");
    }
}
