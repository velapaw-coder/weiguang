package com.weiguang.energy.core;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * Serial device-command queue. The Ute SDK is not re-entered: one command
 * runs until it succeeds, fails, or the timeout elapses.
 */
public final class BandCommandQueue {
    public interface Clock {
        long millis();
    }

    public interface Starter {
        /** Return true when the command finished inside start (for example, skipped). */
        boolean start();
    }

    public static final class Event {
        public final String name;
        public final String type;
        public final String code;

        public Event(String name, String type, String code) {
            this.name = name;
            this.type = type;
            this.code = code;
        }
    }

    private static final class Item {
        final String name;
        final long timeoutMs;
        final Starter starter;
        long startedAt;

        Item(String name, long timeoutMs, Starter starter) {
            this.name = name;
            this.timeoutMs = timeoutMs;
            this.starter = starter;
        }
    }

    private final Clock clock;
    private final ArrayDeque<Item> pending = new ArrayDeque<>();
    private final List<Event> events = new ArrayList<>();
    private Item active;
    private boolean starting;

    public BandCommandQueue(Clock clock) {
        this.clock = clock;
    }

    public synchronized void submit(String name, long timeoutMs, Starter starter) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("command name required");
        }
        if (timeoutMs <= 0) {
            throw new IllegalArgumentException("timeout required");
        }
        pending.add(new Item(name, timeoutMs, starter));
        pump();
    }

    public synchronized boolean succeed(String name) {
        return finish(name, "success", null);
    }

    public synchronized boolean fail(String name, String code) {
        return finish(name, "failure", code == null ? "failed" : code);
    }

    public synchronized void failAll(String code) {
        if (active != null) {
            events.add(new Event(active.name, "failure", code));
            active = null;
        }
        while (!pending.isEmpty()) {
            Item item = pending.remove();
            events.add(new Event(item.name, "failure", code));
        }
    }

    public synchronized void tick() {
        if (active == null) {
            return;
        }
        if (clock.millis() - active.startedAt >= active.timeoutMs) {
            String name = active.name;
            active = null;
            events.add(new Event(name, "failure", "timeout"));
            pump();
        }
    }

    public synchronized String activeName() {
        return active == null ? null : active.name;
    }

    public synchronized int pendingCount() {
        return pending.size() + (active == null ? 0 : 1);
    }

    public synchronized List<Event> events() {
        return new ArrayList<>(events);
    }

    private boolean finish(String name, String type, String code) {
        if (active == null || !active.name.equals(name)) {
            return false;
        }
        active = null;
        events.add(new Event(name, type, code));
        if (!starting) {
            pump();
        }
        return true;
    }

    private void pump() {
        if (active != null || starting) {
            return;
        }
        Item next = pending.poll();
        if (next == null) {
            return;
        }
        active = next;
        next.startedAt = clock.millis();
        starting = true;
        boolean doneImmediately = false;
        try {
            doneImmediately = next.starter.start();
        } catch (RuntimeException ex) {
            starting = false;
            if (active == next) {
                active = null;
                events.add(new Event(next.name, "failure", "start_failed"));
                pump();
            }
            return;
        }
        starting = false;
        if (doneImmediately && active == next) {
            active = null;
            events.add(new Event(next.name, "success", "skipped"));
            pump();
        } else if (active == null) {
            pump();
        }
    }
}
