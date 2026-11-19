package com.weiguang.energy.demo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.weiguang.energy.core.VitalSample;
import com.yc.utesdk.bean.StepOneDayAllInfo;
import com.yc.utesdk.bean.StepOneHourInfo;
import com.yc.utesdk.ble.open.UteBleClient;
import com.yc.utesdk.listener.StepChangeListener;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Feeds the SDK the "B1" realtime step notification a band pushes on its own once it is
 * connected, through the same dispatcher the SDK's GATT callback calls.
 */
@RunWith(AndroidJUnit4.class)
public class SdkStepPacketTest {

    @Test
    public void realtimeStepPacketReachesTheStepListener() {
        Application app = (Application) InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext();
        WeiguangApp.ensureSdk(app);
        UteBleClient client = UteBleClient.getUteBleClient();
        assertNotNull(client);

        AtomicReference<StepOneDayAllInfo> seen = new AtomicReference<>();
        client.getUteBleConnection().setStepChangeListener(new StepChangeListener() {
            @Override
            public void onStepChange(StepOneDayAllInfo info) {
                seen.set(info);
            }

            @Override
            public void onStepSyncSuccess(List<StepOneDayAllInfo> list) {
            }

            @Override
            public void onStepSyncing() {
            }

            @Override
            public void onStepSyncFail() {
            }
        });

        byte[] packet = stepPacket(137);
        uterkdo.uterkbyte.uterkdo().uterkdo(hex(packet), packet);

        StepOneDayAllInfo info = seen.get();
        assertNotNull("the SDK did not report the realtime step packet", info);
        assertTrue(info.getStep() >= 137);
        // The SDK leaves the realtime day bean's date empty; the pages need the day, so it must be recoverable.
        List<String> hourDays = new ArrayList<>();
        for (StepOneHourInfo hour : info.getStepOneHourArrayInfo()) {
            hourDays.add(hour.getCalendar());
        }
        assertEquals(
                new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date()),
                VitalSample.stepDay(info.getCalendar(), hourDays));
    }

    @Test
    public void packetLayoutMatchesTheSdkDecoder() {
        byte[] packet = stepPacket(137);
        assertEquals(20, packet.length);
        assertEquals("B1", hex(packet).substring(0, 2));
    }

    private static byte[] stepPacket(int hourSteps) {
        Calendar now = Calendar.getInstance();
        int year = now.get(Calendar.YEAR);
        byte[] packet = new byte[20];
        packet[0] = (byte) 0xB1;
        packet[1] = (byte) (year >> 8);
        packet[2] = (byte) year;
        packet[3] = (byte) (now.get(Calendar.MONTH) + 1);
        packet[4] = (byte) now.get(Calendar.DAY_OF_MONTH);
        packet[5] = (byte) now.get(Calendar.HOUR_OF_DAY);
        packet[6] = (byte) (hourSteps >> 8);
        packet[7] = (byte) hourSteps;
        return packet;
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte value : bytes) {
            out.append(String.format("%02X", value));
        }
        return out.toString();
    }
}
