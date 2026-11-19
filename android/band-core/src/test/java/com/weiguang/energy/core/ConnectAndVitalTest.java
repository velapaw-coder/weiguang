package com.weiguang.energy.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ConnectAndVitalTest {
    @Test
    public void starterErrorFailsOnlyThatCommand() {
        BandCommandQueue queue = new BandCommandQueue(() -> 0);
        queue.submit("connect", 1000, () -> {
            throw new NoClassDefFoundError("com.example.Missing");
        });
        queue.submit("steps", 1000, () -> false);
        assertEquals("steps", queue.activeName());
        assertEquals("start_failed", queue.events().get(0).code);
        assertEquals("failure", queue.events().get(0).type);
    }

    @Test
    public void diagnosticDropsAddressAndSecrets() {
        String text = ConnectDiagnostic.format("open", new IllegalStateException(
                "addr AA:BB:CC:DD:EE:FF api_key=super-secret-value-should-hide 0123456789abcdef0123456789abcdef"));
        assertFalse(text.contains("AA:BB"));
        assertFalse(text.contains("super-secret"));
        assertFalse(text.contains("0123456789abcdef"));
        assertTrue(text.contains("kind=java.lang.IllegalStateException"));
        assertTrue(text.contains("phase=open"));
    }

    @Test
    public void diagnosticKeepsObfuscatedSdkFrames() {
        NoClassDefFoundError error = new NoClassDefFoundError("Failed resolution of: Lcom/google/gson/Gson;");
        error.setStackTrace(new StackTraceElement[] {
                new StackTraceElement("uterkfor.uterkelse", "uterkdo", "SourceFile", 6),
                new StackTraceElement("uterkdo.uterkbyte", "uterkdo", "SourceFile", 1),
                new StackTraceElement("android.os.Binder", "execTransact", "Binder.java", 1444)});
        String text = ConnectDiagnostic.format("uncaught", error);
        assertTrue(text.contains("uterkfor.uterkelse.uterkdo"));
        assertTrue(text.contains("uterkdo.uterkbyte.uterkdo"));
        assertFalse(text.contains("android.os.Binder"));
    }

    @Test
    public void temperatureAndSleepKeepSdkUnitsAndSessionIdentity() {
        assertTrue(VitalSample.bodyCelsiusPlausible(36.5f));
        assertFalse(VitalSample.bodyCelsiusPlausible(0f));
        assertFalse(VitalSample.bodyCelsiusPlausible(365f));
        assertEquals("20261118|1320|420", VitalSample.sleepId("20261118", 1320, 420));
        assertEquals("|0|0", VitalSample.sleepId(null, 0, 0));
    }
}
