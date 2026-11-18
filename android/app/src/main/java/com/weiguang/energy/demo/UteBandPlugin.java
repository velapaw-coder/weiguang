package com.weiguang.energy.demo;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.weiguang.energy.core.BandCommandQueue;
import com.weiguang.energy.core.BandLink;
import com.weiguang.energy.core.ConnectDiagnostic;
import com.weiguang.energy.core.HealthRepository;
import com.weiguang.energy.core.ObservationKey;
import com.weiguang.energy.core.VitalSample;
import com.yc.utesdk.bean.HeartRateInfo;
import com.yc.utesdk.bean.HrvInfo;
import com.yc.utesdk.bean.MoodPressureFatigueInfo;
import com.yc.utesdk.bean.OxygenInfo;
import com.yc.utesdk.bean.SleepInfo;
import com.yc.utesdk.bean.StepOneDayAllInfo;
import com.yc.utesdk.bean.StepOneHourInfo;
import com.yc.utesdk.bean.TemperatureInfo;
import com.yc.utesdk.ble.open.DeviceMode;
import com.yc.utesdk.ble.open.UteBleClient;
import com.yc.utesdk.ble.open.UteBleConnection;
import com.yc.utesdk.listener.BleConnectStateListener;
import com.yc.utesdk.listener.DeviceBatteryListener;
import com.yc.utesdk.listener.DeviceFirmwareVersionListener;
import com.yc.utesdk.listener.DeviceParamListener;
import com.yc.utesdk.listener.DeviceUiVersionListener;
import com.yc.utesdk.listener.ElHRVListener;
import com.yc.utesdk.listener.HeartRateChangeListener;
import com.yc.utesdk.listener.MoodPressureListener;
import com.yc.utesdk.listener.OxygenChangeListener;
import com.yc.utesdk.listener.SimpleCallbackListener;
import com.yc.utesdk.listener.SleepChangeListener;
import com.yc.utesdk.listener.StepChangeListener;
import com.yc.utesdk.listener.TemperatureChangeListener;
import com.yc.utesdk.scan.UteScanCallback;
import com.yc.utesdk.scan.UteScanDevice;
import com.yc.utesdk.utils.open.SPUtil;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@CapacitorPlugin(
        name = "UteBand",
        permissions = {
                @Permission(alias = "ble12", strings = {
                        Manifest.permission.BLUETOOTH_SCAN,
                        Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.ACCESS_FINE_LOCATION
                }),
                @Permission(alias = "bleLegacy", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }),
                @Permission(alias = "notify", strings = {Manifest.permission.POST_NOTIFICATIONS})
        }
)
public class UteBandPlugin extends Plugin {
    private static final Pattern MAC = Pattern.compile("([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}");
    private static final long SCAN_MS = 8000L;

    private final DeviceUiVersionListener uiVersionListener = new DeviceUiVersionListener() {
        @Override
        public void queryDeviceUiVersionSuccess(String uiVersion) {
            repo().upsertDevice(currentAddress(), null, null, uiVersion, null, null, null, System.currentTimeMillis());
            finishCommand("ui", true, null);
        }

        @Override
        public void queryDeviceUiVersionFail() {
            finishCommand("ui", false, "ui_failed");
        }
    };
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> scanned = new HashSet<>();
    private final BandCommandQueue queue = new BandCommandQueue(System::currentTimeMillis);
    private final BandLink link = new BandLink();
    private boolean autoSyncArmed;
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor();
    private final java.util.concurrent.ExecutorService commandRunner = Executors.newSingleThreadExecutor();
    private UteBleConnection connection;
    private String syncId = "";
    private String lastError = "";
    private boolean scanning;
    private int batteryPercent = -1;
    private int batteryState = -1;

    private final BroadcastReceiver bluetoothReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !BluetoothAdapter.ACTION_STATE_CHANGED.equals(intent.getAction())) {
                return;
            }
            int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
            if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                scanning = false;
                queue.failAll("bluetooth_off");
                emit("bluetooth", errorObject("bluetooth_off"));
            }
        }
    };

    @Override
    public void load() {
        super.load();
        if (getContext() != null) {
            WeiguangApp.ensureSdk((android.app.Application) getContext().getApplicationContext());
            IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(bluetoothReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(bluetoothReceiver, filter);
            }
        }
        ticker.scheduleAtFixedRate(() -> {
            queue.tick();
            main.post(this::syncWhenIdle);
        }, 300, 300, TimeUnit.MILLISECONDS);
        main.post(this::bindConnection);
    }

    @Override
    protected void handleOnPause() {
        stopScanInternal();
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        stopScanInternal();
        queue.failAll("destroyed");
        ticker.shutdownNow();
        commandRunner.shutdownNow();
        disconnectInternal();
        if (getContext() != null) {
            try {
                getContext().unregisterReceiver(bluetoothReceiver);
            } catch (RuntimeException ignored) {
                // Already unregistered.
            }
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void requestBlePermissions(PluginCall call) {
        requestPermissionForAlias(bleAlias(), call, "permissionDone");
    }

    @PluginMethod
    public void requestNotifyPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            JSObject result = new JSObject();
            result.put("granted", ReminderScheduler.notificationsAllowed(getContext()));
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notify", call, "notifyDone");
    }

    @PermissionCallback
    public void permissionDone(PluginCall call) {
        if ("startScan".equals(call.getMethodName())) {
            startScan(call);
            return;
        }
        call.resolve(state());
    }

    @PermissionCallback
    public void notifyDone(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notify") == PermissionState.GRANTED
                && ReminderScheduler.notificationsAllowed(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (!bleGranted()) {
            requestPermissionForAlias(bleAlias(), call, "permissionDone");
            return;
        }
        UteBleClient client = client();
        if (client == null) {
            call.resolve(errorObject("sdk_unavailable"));
            return;
        }
        if (!client.isBluetoothEnable()) {
            call.resolve(errorObject("bluetooth_off"));
            return;
        }
        scanned.clear();
        scanning = true;
        boolean started = client.scanDevice(new UteScanCallback() {
            @Override
            public void onScanning(UteScanDevice device) {
                publishScan(device, false);
            }

            @Override
            public void onScanComplete(List<UteScanDevice> devices) {
                scanning = false;
                if (devices != null) {
                    for (UteScanDevice device : devices) {
                        publishScan(device, false);
                    }
                }
                emit("scanComplete", state());
            }
        }, SCAN_MS);
        JSObject result = state();
        result.put("started", started);
        if (!started) {
            scanning = false;
            result.put("error", "scan_not_started");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopScanInternal();
        call.resolve(state());
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String address = normalize(call.getString("address"));
        boolean previouslyChosen = Boolean.TRUE.equals(call.getBoolean("previouslyChosen", false));
        if (!MAC.matcher(address).matches()) {
            call.resolve(errorObject("bad_address"));
            return;
        }
        if (!scanned.contains(address) && !previouslyChosen) {
            call.resolve(errorObject("address_not_selected"));
            return;
        }
        if (!bleGranted()) {
            call.resolve(errorObject("permission_denied"));
            return;
        }
        UteBleClient client = client();
        if (client == null) {
            call.resolve(errorObject("sdk_unavailable"));
            return;
        }
        if (!client.isBluetoothEnable()) {
            call.resolve(errorObject("bluetooth_off"));
            return;
        }
        stopScanInternal();
        String name = call.getString("name", "");
        try {
            repo().upsertDevice(address, name, null, null, null, null, null, System.currentTimeMillis());
        } catch (RuntimeException ex) {
            call.resolve(errorObject("store_failed"));
            return;
        }
        link.opening();
        autoSyncArmed = false;
        queue.submit("connect", 25000, () -> {
            main.postDelayed(() -> openLink(client, address), 400);
            return false;
        });
        call.resolve(state());
    }

    @PluginMethod
    public void exportConnectDiagnostic(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", readDiagnostic());
        call.resolve(result);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectInternal();
        queue.failAll("disconnected");
        emit("connection", state());
        call.resolve(state());
    }

    @PluginMethod
    public void syncNow(PluginCall call) {
        UteBleClient client = client();
        if (client == null || !client.isConnected() || !link.mayRead()) {
            call.resolve(errorObject("not_connected"));
            return;
        }
        autoSyncArmed = true;
        syncWhenIdle();
        if (autoSyncArmed && queue.pendingCount() == 0) {
            call.resolve(errorObject("device_busy"));
            return;
        }
        JSObject result = state();
        result.put("accepted", true);
        result.put("syncId", syncId);
        call.resolve(result);
    }

    private void openLink(UteBleClient client, String address) {
        try {
            bindConnection();
            if (client.isConnected(address)) {
                connection = client.getUteBleConnection();
                bindConnection(connection);
                link.onSdkStatus(BleConnectStateListener.STATE_CONNECTED);
                queue.succeed("connect");
                saveCapabilities();
                emit("connection", state());
                autoSyncArmed = true;
                syncWhenIdle();
                return;
            }
            connection = client.connect(address);
            bindConnection(connection);
        } catch (Throwable error) {
            link.failed();
            autoSyncArmed = false;
            remember("open", error);
            queue.fail("connect", "connect_failed");
            disconnectQuietly();
            emit("connection", errorObject("connect_failed"));
        }
    }

    private void beginSync() {
        if (!link.mayRead()) {
            return;
        }
        syncId = UUID.randomUUID().toString();
        boolean known = capabilitiesKnown();
        enqueue("time", 12000, () -> connection().syncDeviceTime(), false);
        enqueue("firmware", 15000, () -> connection().queryFirmwareVersion(), false);
        enqueue("battery", 15000, () -> connection().queryDeviceBattery(), false);
        enqueue("steps", 45000, () -> connection().syncStepData(), false);
        enqueue("sleep", 45000, () -> connection().syncSleepData(), false);
        enqueue("ui", 12000, () -> connection().queryDeviceUiVersion(uiVersionListener), !(known && DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_UI_OTA)));
        enqueue("sn", 12000, () -> connection().querySnCode(), !(known && DeviceMode.isHasFunction_10(DeviceMode.IS_SUPPORT_DEVICE_PARAM_QUERY_SET)));
        enqueue("heart_rate", 45000, () -> connection().syncHeartRateData(), !supported(known, DeviceMode.isHasFunction_1(DeviceMode.IS_SUPPORT_HEART_RATE_FUNCTION), "heart_rate"));
        enqueue("resting_heart_rate", 30000, () -> connection().syncRestHeartRateData(), !supported(known, DeviceMode.isHasFunction_8(DeviceMode.IS_SUPPORT_RESET_HEART_RATE), "resting_heart_rate"));
        enqueue("spo2", 45000, () -> connection().syncOxygenData(), !supported(known, DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_OXYGEN), "spo2"));
        enqueue("temperature", 45000, () -> connection().syncTemperatureData(), !supported(known, DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_TEMPERATURE_TEST), "temperature"));
        enqueue("mood_pressure", 45000, () -> connection().syncMoodPressureData(), !supported(known, DeviceMode.isHasFunction_6(DeviceMode.IS_SUPPORT_MOOD_PRESSURE_FATIGUE), "mood_pressure"));
        enqueue("hrv", 45000, () -> connection().syncElHRV(), !supported(known,
                DeviceMode.isHasFunction_8(DeviceMode.IS_SUPPORT_HRV_TEST) || DeviceMode.isHasFunction_11(DeviceMode.IS_SUPPORT_LOCATION_HRV),
                "hrv"));
    }

    private void enqueue(String name, long timeoutMs, Runnable command, boolean skip) {
        String address = currentAddress();
        long now = System.currentTimeMillis();
        if (!address.isEmpty() && !skip) {
            repo().touchSync(address, name, "running", null, null, null, now);
        }
        queue.submit(name, timeoutMs, () -> {
            if (skip) {
                return true;
            }
            commandRunner.execute(() -> {
                long waitStarted = System.currentTimeMillis();
                while (client() != null && client().isDeviceBusy() && System.currentTimeMillis() - waitStarted < 2000) {
                    try {
                        Thread.sleep(40);
                    } catch (InterruptedException ex) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
                main.post(() -> {
                    try {
                        if (client() == null || !client().isConnected()) {
                            queue.fail(name, "not_connected");
                            return;
                        }
                        if (client().isDeviceBusy()) {
                            queue.fail(name, "device_busy");
                            markSync(name, "failed", "device_busy", null);
                            return;
                        }
                        command.run();
                    } catch (Throwable error) {
                        remember("command", error);
                        queue.fail(name, "command_failed");
                        markSync(name, "failed", "command_failed", null);
                    }
                });
            });
            return false;
        });
    }

    private boolean supported(boolean known, boolean flag, String metric) {
        if (!known) {
            markSync(metric, "not_read", "capabilities_unknown", null);
            return false;
        }
        if (!flag) {
            markSync(metric, "unsupported", "device_flag_absent", null);
            return false;
        }
        return true;
    }

    private void bindConnection() {
        UteBleClient client = client();
        if (client == null) {
            return;
        }
        try {
            connection = client.getUteBleConnection();
            bindConnection(connection);
        } catch (RuntimeException ex) {
            lastError = "connection_unavailable";
        }
    }

    private void bindConnection(UteBleConnection session) {
        if (session == null) {
            return;
        }
        session.setConnectStateListener(new BleConnectStateListener() {
            @Override
            public void onConnecteStateChange(int status) {
                main.post(() -> applyLinkStatus(status));
            }

            @Override
            public void onConnectException(Exception error) {
                main.post(() -> {
                    link.failed();
                    autoSyncArmed = false;
                    remember("callback", error);
                    queue.fail("connect", "connect_failed");
                    emit("connection", errorObject("connect_failed"));
                });
            }
        });
        session.setSimpleCallbackListener((result, status) -> {
            if (status == SimpleCallbackListener.BIND_CONNECT_SEND_ACCOUNT_ID && result) {
                respondToBind();
            }
            if (status == SimpleCallbackListener.SYNC_DEVICE_TIME) {
                finishCommand("time", result, result ? null : "time_failed");
            }
        });
        session.setDeviceFirmwareVersionListener(new DeviceFirmwareVersionListener() {
            @Override
            public void queryFirmwareVersionSuccess(String firmwareVersion) {
                repo().upsertDevice(currentAddress(), safeName(), firmwareVersion, null, null, capabilityJson(), System.currentTimeMillis(), System.currentTimeMillis());
                saveCapabilities();
                finishCommand("firmware", true, null);
            }

            @Override
            public void queryFirmwareVersionFail() {
                finishCommand("firmware", false, "firmware_failed");
            }
        });
        session.setDeviceParamListener(new DeviceParamListener() {
            @Override
            public <T> void onQueryDeviceParam(boolean ok, int type, T value) {
                if (type == DeviceParamListener.QUERY_SN_CODE) {
                    if (ok && value != null) {
                        repo().upsertDevice(currentAddress(), null, null, null, String.valueOf(value), null, null, System.currentTimeMillis());
                    }
                    finishCommand("sn", ok, ok ? null : "sn_failed");
                }
            }
        });
        session.setDeviceBatteryListener(new DeviceBatteryListener() {
            @Override
            public void queryDeviceBatterySuccess(int battery) {
                storeBattery(battery, batteryState);
                finishCommand("battery", true, null);
            }

            @Override
            public void queryDeviceBatteryFail() {
                finishCommand("battery", false, "battery_failed");
            }

            @Override
            public void onBatteryChange(int battery, int state) {
                storeBattery(battery, state);
                emit("battery", state());
            }
        });
        session.setStepChangeListener(new StepChangeListener() {
            @Override
            public void onStepChange(StepOneDayAllInfo info) {
                storeSteps(info);
            }

            @Override
            public void onStepSyncSuccess(List<StepOneDayAllInfo> list) {
                String cursor = null;
                if (list != null) {
                    for (StepOneDayAllInfo info : list) {
                        storeSteps(info);
                        if (info.getCalendar() != null) {
                            cursor = info.getCalendar();
                        }
                    }
                }
                markSync("steps", "success", null, cursor);
                queue.succeed("steps");
                emit("synced", state());
            }

            @Override
            public void onStepSyncing() {
                emit("syncing", state());
            }

            @Override
            public void onStepSyncFail() {
                finishCommand("steps", false, "steps_failed");
            }
        });
        session.setSleepChangeListener(new SleepChangeListener() {
            @Override
            public void onSleepSyncSuccess(List<SleepInfo> list) {
                if (list != null) {
                    for (SleepInfo info : list) {
                        storeSleep(info);
                    }
                }
                finishCommand("sleep", true, null);
            }

            @Override
            public void onCyweeSleepSyncSuccess(List<com.yc.utesdk.bean.CyweeSleepTimeInfo> list) {
                markSync("sleep", "unsupported_format", "cywee_sleep_not_mapped", null);
                queue.succeed("sleep");
            }

            @Override
            public void onSleepSyncing() {
                emit("syncing", state());
            }

            @Override
            public void onSleepSyncFail() {
                finishCommand("sleep", false, "sleep_failed");
            }

            @Override
            public <T> void onSleepAlarmClock(boolean result, int status, T t) {
                // Read-only build: do not change the band alarm.
            }
        });
        session.setHeartRateChangeListener(new HeartRateChangeListener() {
            @Override
            public void onHeartRateStatus(boolean result, int status) {
            }

            @Override
            public void onHeartRateRealTime(HeartRateInfo info) {
                storeHeart(info);
            }

            @Override
            public void onHeartRateBestValue(com.yc.utesdk.bean.HeartRateBestValueInfo info) {
            }

            @Override
            public void onHeartRateRest(com.yc.utesdk.bean.HeartRateRestInfo info) {
            }

            @Override
            public void onHeartRateHourRestBestValue(com.yc.utesdk.bean.HeartRateHourBestValueInfo info) {
            }

            @Override
            public void onHeartRateSyncSuccess(List<HeartRateInfo> list) {
                if (list != null) {
                    for (HeartRateInfo info : list) {
                        storeHeart(info);
                    }
                }
                finishCommand("heart_rate", true, null);
            }

            @Override
            public void onHeartRateSyncing() {
            }

            @Override
            public void onHeartRateSyncFail() {
                finishCommand("heart_rate", false, "heart_failed");
            }

            @Override
            public void onHeartRateRestSyncSuccess(List<com.yc.utesdk.bean.HeartRateRestInfo> list) {
                finishCommand("resting_heart_rate", true, null);
            }

            @Override
            public void onHeartRateRestSyncing() {
            }

            @Override
            public void onHeartRateRestSyncFail() {
                finishCommand("resting_heart_rate", false, "resting_heart_failed");
            }
        });
        session.setOxygenChangeListener(new OxygenChangeListener() {
            @Override
            public void onOxygenStatus(boolean result, int status) {
            }

            @Override
            public void onOxygenRealTime(OxygenInfo info) {
                storeOxygen(info);
            }

            @Override
            public void onOxygenSyncSuccess(List<OxygenInfo> list) {
                if (list != null) {
                    for (OxygenInfo info : list) {
                        storeOxygen(info);
                    }
                }
                finishCommand("spo2", true, null);
            }

            @Override
            public void onOxygenSyncing() {
            }

            @Override
            public void onOxygenSyncFail() {
                finishCommand("spo2", false, "spo2_failed");
            }
        });
        session.setTemperatureChangeListener(new TemperatureChangeListener() {
            @Override
            public void onTemperatureStatus(boolean result, int status) {
            }

            @Override
            public void onTemperatureRealTime(TemperatureInfo info) {
                storeTemperature(info);
            }

            @Override
            public void onTemperatureSyncSuccess(List<TemperatureInfo> list) {
                if (list != null) {
                    for (TemperatureInfo info : list) {
                        storeTemperature(info);
                    }
                }
                finishCommand("temperature", true, null);
            }

            @Override
            public void onTemperatureSyncing() {
            }

            @Override
            public void onTemperatureSyncFail() {
                finishCommand("temperature", false, "temperature_failed");
            }
        });
        session.setMoodPressureListener(new MoodPressureListener() {
            @Override
            public void onMoodPressureStatus(boolean result, int status) {
            }

            @Override
            public void onMoodPressureRealTime(MoodPressureFatigueInfo info) {
                storeMood(info);
            }

            @Override
            public void onMoodPressureSyncSuccess(List<MoodPressureFatigueInfo> list) {
                if (list != null) {
                    for (MoodPressureFatigueInfo info : list) {
                        storeMood(info);
                    }
                }
                finishCommand("mood_pressure", true, null);
            }

            @Override
            public void onMoodPressureSyncing() {
            }

            @Override
            public void onMoodPressureSyncFail() {
                finishCommand("mood_pressure", false, "mood_failed");
            }

            @Override
            public void onMoodPressureSensor(com.yc.utesdk.bean.MoodSensorInterfaceInfo info) {
            }
        });
        session.setElHRVListener(new ElHRVListener() {
            @Override
            public void onElHRVStatus(boolean result, int status) {
            }

            @Override
            public void onElHRVPpgRealTime(com.yc.utesdk.bean.ElHRVMiddleDataInfo info) {
            }

            @Override
            public void onElHRVSyncSuccess(List<HrvInfo> list) {
                if (list != null) {
                    for (HrvInfo info : list) {
                        storeHrv(info);
                    }
                }
                finishCommand("hrv", true, null);
            }

            @Override
            public void onElHrvSyncing() {
            }

            @Override
            public void onElHRVSyncFail() {
                finishCommand("hrv", false, "hrv_failed");
            }

            @Override
            public <T> void onAutoHRVStatus(boolean result, int status, T value) {
            }
        });
    }

    private void applyLinkStatus(int status) {
        try {
            link.onSdkStatus(status);
            if (status == BleConnectStateListener.STATE_CONNECTED && link.mayRead()) {
                queue.succeed("connect");
                saveCapabilities();
                autoSyncArmed = true;
                emit("connection", state());
                syncWhenIdle();
            } else if (status == BleConnectStateListener.STATE_DISCONNECTED) {
                autoSyncArmed = false;
                queue.fail("connect", "disconnected");
                emit("connection", state());
            } else {
                emit("connection", state());
            }
        } catch (Throwable error) {
            link.failed();
            autoSyncArmed = false;
            remember("callback", error);
            queue.fail("connect", "connect_failed");
            emit("connection", errorObject("connect_failed"));
        }
    }

    private void syncWhenIdle() {
        if (!autoSyncArmed || !link.mayRead()) {
            return;
        }
        UteBleClient client = client();
        if (client == null || !client.isConnected()) {
            return;
        }
        try {
            if (client.isDeviceBusy() || queue.pendingCount() > 0) {
                return;
            }
        } catch (Throwable error) {
            remember("busy_check", error);
            return;
        }
        try {
            beginSync();
            autoSyncArmed = false;
            emit("syncStarted", state());
        } catch (Throwable error) {
            autoSyncArmed = false;
            remember("sync", error);
            emit("connection", errorObject("sync_failed"));
        }
    }

    private void storeBattery(int battery, int state) {
        batteryPercent = battery;
        batteryState = state;
        String address = currentAddress();
        if (address.isEmpty()) {
            return;
        }
        long received = System.currentTimeMillis();
        JSONObject value = new JSONObject();
        try {
            value.put("percent", battery);
            value.put("chargeState", state);
        } catch (org.json.JSONException ignored) {
            return;
        }
        repo().upsertObservation(
                ObservationKey.battery(address, battery, received),
                address, "battery", null, received, syncId, value.toString(), "device_time_missing", received);
        markSync("battery", "success", null, null);
        emit("battery", state());
    }

    private void storeSteps(StepOneDayAllInfo info) {
        if (info == null || info.getCalendar() == null) {
            return;
        }
        String address = currentAddress();
        long received = System.currentTimeMillis();
        JSONObject value = new JSONObject();
        try {
            value.put("step", info.getStep());
            value.put("calories", info.getCalories());
            value.put("distance", info.getDistance());
            value.put("runSteps", info.getRunSteps());
            value.put("walkSteps", info.getWalkSteps());
        } catch (org.json.JSONException ignored) {
            return;
        }
        repo().upsertObservation(
                ObservationKey.stepsDay(address, info.getCalendar()),
                address, "steps", info.getCalendar(), received, syncId, value.toString(), "recorded", received);
        if (info.getStepOneHourArrayInfo() != null) {
            for (StepOneHourInfo hour : info.getStepOneHourArrayInfo()) {
                String calendar = hour.getCalendar() == null ? info.getCalendar() : hour.getCalendar();
                JSONObject hourValue = new JSONObject();
                try {
                    hourValue.put("step", hour.getStep());
                    hourValue.put("hour", hour.getTime());
                } catch (org.json.JSONException ignored) {
                    continue;
                }
                repo().upsertObservation(
                        ObservationKey.stepsHour(address, calendar, hour.getTime()),
                        address, "steps_hour", calendar, received, syncId, hourValue.toString(), "recorded", received);
            }
        }
    }

    private void storeSleep(SleepInfo info) {
        String calendar = info.getCalendar() == null ? "" : info.getCalendar();
        String sample = VitalSample.sleepId(calendar, info.getStartSleepTime(), info.getEndSleepTime());
        JSONObject value = new JSONObject();
        try {
            value.put("totalMinutes", info.getTotalSleepTime());
            value.put("deepMinutes", info.getTotalDeepSleepTime());
            value.put("lightMinutes", info.getTotalLightSleepTime());
            value.put("awakeMinutes", info.getTotalAwakeSleepTime());
            value.put("awakeCount", info.getTotalAwakeCount());
            value.put("remMinutes", info.getTotalRemSleepTime());
            value.put("start", info.getStartSleepTime());
            value.put("end", info.getEndSleepTime());
        } catch (org.json.JSONException ignored) {
            return;
        }
        putSample("sleep", sample, calendar, value, calendar.isEmpty() ? "device_time_missing" : "recorded");
    }

    private void storeHeart(HeartRateInfo info) {
        if (info == null) {
            return;
        }
        String when = firstText(info.getCalendarTime(), info.getCalendar());
        JSONObject value = new JSONObject();
        try {
            value.put("bpm", info.getHeartRate());
            value.put("time", info.getTime());
        } catch (org.json.JSONException ignored) {
            return;
        }
        String quality = info.getHeartRate() <= 0 ? "invalid_device_value" : (when.isEmpty() ? "device_time_missing" : "recorded");
        putSample("heart_rate", when + "|" + info.getTime(), when, value, quality);
    }

    private void storeOxygen(OxygenInfo info) {
        if (info == null) {
            return;
        }
        String when = firstText(info.getCalendarTime(), info.getCalendar());
        JSONObject value = new JSONObject();
        try {
            value.put("percent", info.getOxygen());
            value.put("time", info.getTime());
        } catch (org.json.JSONException ignored) {
            return;
        }
        putSample("spo2", when + "|" + info.getTime(), when, value, when.isEmpty() ? "device_time_missing" : "recorded");
    }

    private void storeTemperature(TemperatureInfo info) {
        if (info == null) {
            return;
        }
        String when = firstText(info.getCalendarTime(), info.getCalendar());
        boolean plausible = VitalSample.bodyCelsiusPlausible(info.getBodyTemperature());
        JSONObject value = new JSONObject();
        try {
            value.put("body", info.getBodyTemperature());
            value.put("surface", info.getBodySurfaceTemperature());
            value.put("ambient", info.getAmbientTemperature());
            value.put("type", info.getType());
            value.put("unit", "celsius_sdk_float");
        } catch (org.json.JSONException ignored) {
            return;
        }
        String quality = !plausible ? "invalid_device_value" : (when.isEmpty() ? "device_time_missing" : "recorded");
        putSample("temperature", when + "|" + info.getSecondTime(), when, value, quality);
    }

    private void storeMood(MoodPressureFatigueInfo info) {
        if (info == null) {
            return;
        }
        String when = firstText(info.getStartDate(), info.getCalendar());
        JSONObject value = new JSONObject();
        try {
            if (info.getPressureValue() != MoodPressureFatigueInfo.INVALID_VALUE) {
                value.put("pressure", info.getPressureValue());
            }
            if (info.getMoodValue() != MoodPressureFatigueInfo.INVALID_VALUE) {
                value.put("mood", info.getMoodValue());
            }
            if (info.getFatigueValue() != MoodPressureFatigueInfo.INVALID_VALUE) {
                value.put("fatigue", info.getFatigueValue());
            }
            value.put("moodText", info.getMoodDes());
            value.put("pressureText", info.getPressureDes());
            value.put("fatigueText", info.getFatigueDes());
        } catch (org.json.JSONException ignored) {
            return;
        }
        boolean invalid = !value.has("pressure") && !value.has("mood") && !value.has("fatigue");
        putSample("mood_pressure", when + "|" + info.getTime(), when, value, invalid ? "invalid_device_value" : "recorded");
    }

    private void storeHrv(HrvInfo info) {
        if (info == null) {
            return;
        }
        String when = firstText(info.getCalendarTime(), info.getCalendar());
        JSONObject value = new JSONObject();
        try {
            value.put("hrv", info.getHrv());
            value.put("time", info.getTime());
        } catch (org.json.JSONException ignored) {
            return;
        }
        putSample("hrv", when + "|" + info.getTime(), when, value, when.isEmpty() ? "device_time_missing" : "recorded");
    }

    private void putSample(String metric, String sampleId, String deviceTime, JSONObject value, String quality) {
        String address = currentAddress();
        if (address.isEmpty()) {
            return;
        }
        long received = System.currentTimeMillis();
        repo().upsertObservation(
                ObservationKey.of(metric, address, sampleId),
                address, metric, deviceTime, received, syncId, value.toString(), quality, received);
    }

    private void finishCommand(String name, boolean ok, String error) {
        markSync(name, ok ? "success" : "failed", error, null);
        if (ok) {
            queue.succeed(name);
        } else {
            queue.fail(name, error == null ? "failed" : error);
        }
        emit("command", state());
    }

    private void markSync(String metric, String status, String error, String cursor) {
        String address = currentAddress();
        if (address.isEmpty()) {
            return;
        }
        Long success = "success".equals(status) ? System.currentTimeMillis() : null;
        repo().touchSync(address, metric, status, error, cursor, success, System.currentTimeMillis());
    }

    private void saveCapabilities() {
        String address = currentAddress();
        if (address.isEmpty()) {
            return;
        }
        repo().upsertDevice(address, safeName(), null, null, null, capabilityJson(), System.currentTimeMillis(), System.currentTimeMillis());
    }

    private String capabilityJson() {
        boolean known = capabilitiesKnown();
        JSONObject root = new JSONObject();
        try {
            root.put("status", known ? "ready" : "unknown");
            root.put("energy_index", flag(false, false, "no_public_sdk_method"));
            root.put("battery", flag(true, true, "queryDeviceBattery_ungated"));
            root.put("steps", flag(true, true, "syncStepData_ungated_in_demo"));
            root.put("steps_hour", flag(true, true, "StepOneHourInfo_hour_bucket_not_10_min"));
            root.put("sleep", flag(true, true, "syncSleepData_ungated_in_DeviceActivity"));
            root.put("heart_rate", flag(known, known && DeviceMode.isHasFunction_1(DeviceMode.IS_SUPPORT_HEART_RATE_FUNCTION), "isHasFunction_1(IS_SUPPORT_HEART_RATE_FUNCTION)"));
            root.put("resting_heart_rate", flag(known, known && DeviceMode.isHasFunction_8(DeviceMode.IS_SUPPORT_RESET_HEART_RATE), "isHasFunction_8(IS_SUPPORT_RESET_HEART_RATE)"));
            root.put("spo2", flag(known, known && DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_OXYGEN), "isHasFunction_5(IS_SUPPORT_OXYGEN)"));
            root.put("temperature", flag(known, known && DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_TEMPERATURE_TEST), "isHasFunction_5(IS_SUPPORT_TEMPERATURE_TEST); sdk float kept as celsius, 30 to 45 accepted"));
            root.put("mood_pressure", flag(known, known && DeviceMode.isHasFunction_6(DeviceMode.IS_SUPPORT_MOOD_PRESSURE_FATIGUE), "ble syncMoodPressureData via function_6; vendor algorithm service is not called"));
            root.put("hrv", flag(known, known && (DeviceMode.isHasFunction_8(DeviceMode.IS_SUPPORT_HRV_TEST) || DeviceMode.isHasFunction_11(DeviceMode.IS_SUPPORT_LOCATION_HRV)), "ble syncElHRV via function_8 or function_11; vendor algorithm service is not called"));
            root.put("sedentary", flag(known, known && DeviceMode.isHasFunction_1(DeviceMode.IS_SUPPORT_SEDENTARY_REMINDER), "flag_only_not_configured"));
            root.put("alarm", flag(known, known && (DeviceMode.isHasFunction_1(DeviceMode.IS_SUPPORT_THREE_ALARM_CLOCK) || DeviceMode.isHasFunction_6(DeviceMode.IS_SUPPORT_LABEL_ALARM_CLOCK)), "flag_only_not_configured"));
            root.put("message_display", flag(known, known && DeviceMode.isHasFunction_5(DeviceMode.IS_SUPPORT_PUSH_MESSAGE_DISPLAY), "flag_only_not_configured"));
            JSONObject sampling = new JSONObject();
            sampling.put("userReportedExpectationMin", 10);
            sampling.put("verifiedOnDevice", false);
            sampling.put("assumedForEveryMetric", false);
            sampling.put("writesIssued", false);
            sampling.put("sdkRangeEvidence", "oxygen and breathing custom interval comment: 1 to 1440 minutes; demo else-branch passes 10 and is not called");
            root.put("sampling", sampling);
            JSONArray lists = new JSONArray();
            if (sdkReady()) {
                SPUtil sp = SPUtil.getInstance();
                int[] raw = {
                        sp.getCharacterisicFunctionList1(), sp.getCharacterisicFunctionList2(), sp.getCharacterisicFunctionList3(),
                        sp.getCharacterisicFunctionList4(), sp.getCharacterisicFunctionList5(), sp.getCharacterisicFunctionList6(),
                        sp.getCharacterisicFunctionList7(), sp.getCharacterisicFunctionList8(), sp.getCharacterisicFunctionList9(),
                        sp.getCharacterisicFunctionList10(), sp.getCharacterisicFunctionList11(), sp.getCharacterisicFunctionList12(),
                        sp.getCharacterisicFunctionList13()
                };
                for (int value : raw) {
                    lists.put(value);
                }
            }
            root.put("functionLists", lists);
        } catch (org.json.JSONException ignored) {
            return "{}";
        }
        return root.toString();
    }

    private static JSONObject flag(boolean known, boolean supported, String evidence) throws org.json.JSONException {
        JSONObject item = new JSONObject();
        item.put("known", known);
        item.put("supported", supported);
        item.put("evidence", evidence);
        return item;
    }

    private boolean capabilitiesKnown() {
        if (!sdkReady()) {
            return false;
        }
        SPUtil sp = SPUtil.getInstance();
        int combined = sp.getCharacterisicFunctionList1() | sp.getCharacterisicFunctionList2()
                | sp.getCharacterisicFunctionList3() | sp.getCharacterisicFunctionList4()
                | sp.getCharacterisicFunctionList5() | sp.getCharacterisicFunctionList6()
                | sp.getCharacterisicFunctionList7() | sp.getCharacterisicFunctionList8()
                | sp.getCharacterisicFunctionList9() | sp.getCharacterisicFunctionList10()
                | sp.getCharacterisicFunctionList11() | sp.getCharacterisicFunctionList12()
                | sp.getCharacterisicFunctionList13();
        return combined != 0;
    }

    private void respondToBind() {
        main.post(() -> {
        try {
            HealthRepository repo = repo();
            String saved = repo.getMeta("device_bind_id");
            int id;
            if (saved == null || saved.isEmpty()) {
                id = 1000 + new SecureRandom().nextInt(800000);
                if (id == 12345) {
                    id = 12346;
                }
                repo.setMeta("device_bind_id", Integer.toString(id));
            } else {
                id = Integer.parseInt(saved);
            }
            UteBleConnection link = connection();
            if (DeviceMode.isHasFunction_8(DeviceMode.IS_SUPPORT_ACCOUNT_ID_AND_RANDOM_ID_BIND)) {
                link.sendAccountIdAndRandomCode(id, 0, true);
            } else {
                link.sendAccountId(id);
            }
        } catch (Throwable error) {
            remember("bind", error);
            lastError = "bind_failed";
        }
        });
    }

    private void publishScan(UteScanDevice device, boolean unused) {
        if (device == null || device.getDevice() == null || device.getDevice().getAddress() == null) {
            return;
        }
        String address = normalize(device.getDevice().getAddress());
        String name = "";
        try {
            if (device.getDevice().getName() != null) {
                name = device.getDevice().getName();
            }
        } catch (SecurityException ex) {
            lastError = "bluetooth_connect_denied";
        }
        scanned.add(address);
        JSObject item = new JSObject();
        item.put("address", address);
        item.put("name", name.isEmpty() ? "未命名设备" : name);
        item.put("rssi", device.getRssi());
        item.put("named", !name.isEmpty());
        emit("scanDevice", item);
    }

    private void stopScanInternal() {
        scanning = false;
        UteBleClient client = client();
        if (client == null) {
            return;
        }
        try {
            client.cancelScan();
        } catch (RuntimeException ignored) {
            lastError = "stop_scan_failed";
        }
    }

    private void disconnectInternal() {
        autoSyncArmed = false;
        try {
            UteBleClient client = client();
            if (client != null && client.isConnected()) {
                client.disconnect();
            }
        } catch (RuntimeException ex) {
            lastError = "disconnect_failed";
        } finally {
            link.onSdkStatus(BleConnectStateListener.STATE_DISCONNECTED);
        }
    }

    private void disconnectQuietly() {
        try {
            disconnectInternal();
        } catch (Throwable ignored) {
            autoSyncArmed = false;
        }
    }

    private void remember(String phase, Throwable error) {
        if (link.phase() != BandLink.Phase.READY) {
            lastError = "connect_failed";
        }
        if (getContext() == null) {
            return;
        }
        try (FileOutputStream out = getContext().openFileOutput("connect-diagnostic.txt", Context.MODE_PRIVATE)) {
            out.write(ConnectDiagnostic.format(phase, error).getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            // The connection is already marked failed.
        }
    }

    private String readDiagnostic() {
        if (getContext() == null) {
            return "";
        }
        try (FileInputStream input = getContext().openFileInput("connect-diagnostic.txt")) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[256];
            int count;
            int total = 0;
            while ((count = input.read(chunk)) >= 0 && total < 4000) {
                int take = Math.min(count, 4000 - total);
                buffer.write(chunk, 0, take);
                total += take;
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        } catch (Exception missing) {
            return "";
        }
    }

    private JSObject state() {
        JSObject result = new JSObject();
        UteBleClient client = client();
        result.put("platform", "android");
        result.put("sdk", WeiguangApp.sdkInitError() == null && client != null ? "ready" : "unavailable");
        result.put("sdkError", WeiguangApp.sdkInitError() == null ? "" : WeiguangApp.sdkInitError());
        result.put("phase", link.phase().name().toLowerCase(Locale.US));
        boolean radioOn = false;
        boolean connected = false;
        try {
            radioOn = client != null && client.isBluetoothEnable();
            connected = client != null && client.isConnected();
        } catch (Throwable ignored) {
            radioOn = false;
            connected = false;
        }
        result.put("bluetooth", radioOn ? "on" : "off");
        result.put("connection", connected ? "connected" : "disconnected");
        result.put("scanning", scanning);
        result.put("address", connected ? currentAddress() : "");
        result.put("name", connected ? safeName() : "");
        result.put("activeCommand", queue.activeName() == null ? "" : queue.activeName());
        result.put("error", lastError);
        result.put("batteryPercent", batteryPercent);
        result.put("permissions", bleGranted());
        result.put("notifications", getContext() != null && ReminderScheduler.notificationsAllowed(getContext()));
        result.put("backgroundPolling", false);
        return result;
    }

    private JSObject errorObject(String code) {
        lastError = code;
        JSObject result = state();
        result.put("ok", false);
        result.put("error", code);
        return result;
    }

    private void emit(String type, JSObject payload) {
        JSObject event = payload == null ? new JSObject() : payload;
        event.put("type", type);
        notifyListeners("band", event);
    }

    private boolean bleGranted() {
        if (Build.VERSION.SDK_INT >= 31) {
            return getPermissionState("ble12") == PermissionState.GRANTED;
        }
        return getPermissionState("bleLegacy") == PermissionState.GRANTED;
    }

    private String bleAlias() {
        return Build.VERSION.SDK_INT >= 31 ? "ble12" : "bleLegacy";
    }

    private UteBleClient client() {
        if (WeiguangApp.sdkInitError() != null) {
            return null;
        }
        try {
            return UteBleClient.getUteBleClient();
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private UteBleConnection connection() {
        if (connection != null) {
            return connection;
        }
        UteBleClient client = client();
        if (client == null) {
            throw new IllegalStateException("sdk");
        }
        connection = client.getUteBleConnection();
        return connection;
    }

    private HealthRepository repo() {
        return WeiguangStores.get(getContext());
    }

    private String currentAddress() {
        UteBleClient client = client();
        if (client == null) {
            return "";
        }
        try {
            return normalize(client.getDeviceAddress());
        } catch (RuntimeException ex) {
            return "";
        }
    }

    private String safeName() {
        UteBleClient client = client();
        if (client == null) {
            return "";
        }
        try {
            String name = client.getDeviceName();
            return name == null ? "" : name;
        } catch (SecurityException ex) {
            return "";
        }
    }

    private boolean sdkReady() {
        return client() != null;
    }

    private static String normalize(String address) {
        return address == null ? "" : address.trim().toUpperCase(Locale.US);
    }

    private static String firstText(String preferred, String fallback) {
        if (preferred != null && !preferred.isEmpty()) {
            return preferred;
        }
        return fallback == null ? "" : fallback;
    }
}
