package com.weiguang.energy.core;

import org.junit.Test;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class CallbackEscapeTest {
    @Test
    public void anExceptionLeavingACallbackThreadIsUncaught() throws Exception {
        AtomicReference<Throwable> escaped = new AtomicReference<>();
        Thread thread = new Thread(() -> {
            throw new IllegalStateException("sdk-callback");
        });
        thread.setUncaughtExceptionHandler((current, error) -> escaped.set(error));
        thread.start();
        thread.join();
        assertNotNull(escaped.get());
        assertEquals("sdk-callback", escaped.get().getMessage());
    }

    @Test
    public void fencingStopsTheQueueInsteadOfMarkingSuccess() {
        BandCommandQueue queue = new BandCommandQueue(() -> 0);
        queue.submit("steps", 1000, () -> false);
        boolean completed = CallbackFence.run(() -> {
            throw new IllegalStateException("sqlite");
        }, error -> queue.failAll("callback_failed"));
        assertFalse(completed);
        assertNull(queue.activeName());
        assertEquals("callback_failed", queue.events().get(0).code);
        assertTrue(queue.events().stream().noneMatch(event -> "success".equals(event.type)));
    }
}
