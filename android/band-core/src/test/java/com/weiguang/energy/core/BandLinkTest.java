package com.weiguang.energy.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class BandLinkTest {
    @Test
    public void readsWaitUntilTheSdkReportsConnected() {
        BandLink link = new BandLink();
        assertFalse(link.mayRead());
        link.opening();
        link.onSdkStatus(1);
        assertFalse(link.mayRead());
        link.onSdkStatus(2);
        assertEquals(BandLink.Phase.READY, link.phase());
        assertTrue(link.mayRead());
    }

    @Test
    public void connectedBeforeOpeningDoesNotStartReads() {
        BandLink link = new BandLink();
        link.onSdkStatus(2);
        assertFalse(link.mayRead());
    }

    @Test
    public void failureBlocksReadsUntilANewOpening() {
        BandLink link = new BandLink();
        link.opening();
        link.onSdkStatus(2);
        link.failed();
        assertFalse(link.mayRead());
        link.onSdkStatus(0);
        assertEquals(BandLink.Phase.FAILED, link.phase());
        link.opening();
        link.onSdkStatus(2);
        assertTrue(link.mayRead());
    }
}
