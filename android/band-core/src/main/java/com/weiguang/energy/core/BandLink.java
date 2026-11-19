package com.weiguang.energy.core;

/**
 * When the app may send a read. The UTE SDK reports "connected" only after its
 * own service discovery and pairing branch. Reads before that re-enter a live GATT session.
 */
public final class BandLink {
    public enum Phase {
        IDLE, OPENING, READY, FAILED
    }

    private Phase phase = Phase.IDLE;

    public Phase phase() {
        return phase;
    }

    public void opening() {
        phase = Phase.OPENING;
    }

    public void onSdkStatus(int status) {
        if (status == 2) {
            if (phase == Phase.OPENING || phase == Phase.READY) {
                phase = Phase.READY;
            }
            return;
        }
        if (status == 1) {
            if (phase == Phase.IDLE) {
                phase = Phase.OPENING;
            }
            return;
        }
        if (status == 0 && phase != Phase.FAILED) {
            phase = Phase.IDLE;
        }
    }

    public void failed() {
        phase = Phase.FAILED;
    }

    public boolean mayRead() {
        return phase == Phase.READY;
    }
}
