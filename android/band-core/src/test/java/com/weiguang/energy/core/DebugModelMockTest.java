package com.weiguang.energy.core;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class DebugModelMockTest {
    @Test
    public void releaseAlwaysKeepsOfficialUrl() {
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(false, DebugModelPoster.RESPONSES_URL, "http://10.0.2.2:18787/api/v3/responses"));
    }

    @Test
    public void debugAcceptsEmulatorLoopbackMock() {
        String mock = "http://10.0.2.2:18787/api/v3/responses";
        assertEquals(mock, DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, mock));
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, "https://evil.example/api"));
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, " "));
    }

    @Test
    public void withoutExplicitMockPrefsStaysOnOfficialResponses() {
        // Real-device packaging with only a Key asset must not enter mock.
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, null));
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, ""));
        assertEquals(
                DebugModelPoster.RESPONSES_URL,
                DebugModelMock.resolveTransportUrl(true, DebugModelPoster.RESPONSES_URL, "https://ark.cn-beijing.volces.com/api/v3/responses"));
    }
}
