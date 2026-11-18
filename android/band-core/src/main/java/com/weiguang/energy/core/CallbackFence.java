package com.weiguang.energy.core;

/**
 * An exception that leaves a BLE callback thread is delivered to the thread's
 * uncaught handler. On Android that ends the process. This fence keeps the
 * exception on the caller and reports it so the session can stop.
 */
public final class CallbackFence {
    public interface Failure {
        void accept(Throwable error);
    }

    private CallbackFence() {}

    public static boolean run(Runnable work, Failure failure) {
        try {
            work.run();
            return true;
        } catch (Throwable error) {
            if (failure != null) {
                failure.accept(error);
            }
            return false;
        }
    }
}
