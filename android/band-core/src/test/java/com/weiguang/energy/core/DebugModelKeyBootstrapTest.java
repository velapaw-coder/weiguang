package com.weiguang.energy.core;

import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class DebugModelKeyBootstrapTest {
    @Test
    public void releaseNeverReadsTheAsset() {
        int[] reads = {0};
        MemoryStore store = new MemoryStore("");
        DebugModelKeyBootstrap.ensure(false, () -> {
            reads[0]++;
            return "sentinel".getBytes(StandardCharsets.UTF_8);
        }, store);
        assertEquals(0, reads[0]);
        assertEquals("", store.value);
    }

    @Test
    public void existingManualKeyWins() {
        int[] reads = {0};
        MemoryStore store = new MemoryStore("manual-key");
        DebugModelKeyBootstrap.ensure(true, () -> {
            reads[0]++;
            return "sentinel".getBytes(StandardCharsets.UTF_8);
        }, store);
        assertEquals(0, reads[0]);
        assertEquals("manual-key", store.value);
    }

    @Test
    public void emptyDebugInstallCopiesATrimmedAssetOnce() {
        MemoryStore store = new MemoryStore("  ");
        byte[] asset = "  sentinel-debug-key\n".getBytes(StandardCharsets.UTF_8);
        DebugModelKeyBootstrap.ensure(true, () -> asset, store);
        assertEquals("sentinel-debug-key", store.value);
        store.value = "manual-key";
        DebugModelKeyBootstrap.ensure(true, () -> "other".getBytes(StandardCharsets.UTF_8), store);
        assertEquals("manual-key", store.value);
    }

    @Test
    public void missingOrOversizedAssetDoesNotWrite() {
        MemoryStore missing = new MemoryStore("");
        DebugModelKeyBootstrap.ensure(true, () -> null, missing);
        assertEquals("", missing.value);
        assertNull(DebugModelKeyBootstrap.choose(new byte[4097]));
        assertNull(DebugModelKeyBootstrap.choose("two\nlines".getBytes(StandardCharsets.UTF_8)));
    }

    private static final class MemoryStore implements DebugModelKeyBootstrap.Store {
        private String value;

        private MemoryStore(String value) {
            this.value = value;
        }

        @Override
        public String get() {
            return value;
        }

        @Override
        public void set(String next) {
            value = next;
        }
    }
}
