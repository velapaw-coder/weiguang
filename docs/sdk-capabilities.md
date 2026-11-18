# Ute SDK V5.4.2 能力对照

证据来自本机解压后的 `uteAndroidSdk_v5.4.2.aar` 公开类签名，以及 demo `ScanActivity`、`DeviceActivity`、`ELMPBPActivity`。这些文件不进入 git。

| 能力 | 结论 | 证据 | 本应用 |
|---|---|---|---|
| 初始化 | `UteBleClient.initialize(Context)` | `MyApplication.onCreate` | 应用启动时调用 |
| 扫描 | `scanDevice(UteScanCallback, long)`，demo 为 8 秒 | `ScanActivity` | 手动扫描，展示名称、地址、RSSI。不预设型号或地址 |
| 连接 / 断开 | `connect(String)`、`disconnect()`、`BleConnectStateListener` | `DeviceActivity.connectDevice2` | 只能连接本次扫描到的地址，或用户曾经手动选过并写入 SQLite 的地址 |
| 电量 | `queryDeviceBattery()`，无功能位判断 | `DeviceActivity` `bt_device_battery` | 连接后串行读取 |
| 步数 | `syncStepData()` / `syncStepData(yyyyMMddHHmm)`。格式不对会同步全部 | `DeviceActivity` 注释 | 调用无参 `syncStepData()`，不用 demo 写死的 `202203251100` |
| 步数小时桶 | `StepOneHourInfo` | aar | 按小时保存，不称为 10 分钟样本 |
| 睡眠 | `syncSleepData()`，demo 未做功能位判断 | `DeviceActivity.bt_sync_sleep` | 尝试同步。失败记失败，不填假数据 |
| 心率 | `isHasFunction_1(IS_SUPPORT_HEART_RATE_FUNCTION)` 后 `syncHeartRateData()` | `DeviceActivity` | 能力位未读到则跳过；读到且不支持则显示不支持 |
| 静息心率 | `isHasFunction_8(IS_SUPPORT_RESET_HEART_RATE)` | `DeviceActivity.bt_sync_rest_rate` | 同上 |
| 血氧 | `isHasFunction_5(IS_SUPPORT_OXYGEN)` 后 `syncOxygenData()` | `DeviceActivity` | 只同步历史，不开启测量 |
| 体温 | `isHasFunction_5(IS_SUPPORT_TEMPERATURE_TEST)` 后 `syncTemperatureData()` | `DeviceActivity` | 只同步历史 |
| 情绪压力 | `isHasFunction_6(IS_SUPPORT_MOOD_PRESSURE_FATIGUE)` 后 `syncMoodPressureData()` | `ELMPBPActivity` | 只同步历史。不调用 `activeMoodAlgorithm()`，不用 demo 的 openId 或 appKey |
| HRV | 测试状态看 `isHasFunction_8(IS_SUPPORT_HRV_TEST)`；自动状态查询看 `isHasFunction_11(IS_SUPPORT_LOCATION_HRV)`。demo 的历史同步把功能位判断注释掉了 | `ELMPBPActivity.syncElHRV` | 两个功能位都不成立则不同步 |
| 久坐、闹钟、消息显示 | 有功能位：`IS_SUPPORT_SEDENTARY_REMINDER`、`IS_SUPPORT_THREE_ALARM_CLOCK` / `IS_SUPPORT_LABEL_ALARM_CLOCK`、`IS_SUPPORT_PUSH_MESSAGE_DISPLAY` | `DeviceMode` 与 demo 判断 | 只报告能力，不写设备 |
| 精力指数 | aar 公开类中没有对应读取方法 | 全库类名检索 | 不计算、不展示分数 |
| 采样间隔设置 | `oxygenAutomaticTest(boolean, int)`。demo 注释：自定义间隔为 1 到 1440 分钟，否则传入 10。体温、呼吸、情绪、HRV 也有带间隔的设置方法 | `DeviceActivity` 约 549–555 行，以及 `temperatureAutomaticTest(true, 10)` | 不调用任何设置方法 |
| 绑定口令 | demo 在 `BIND_CONNECT_SEND_ACCOUNT_ID` 时发送写死的 `12345` | `DeviceActivity` | 改用本机随机整数，不使用 12345，也不打印该数 |

功能位保存在 SDK 的 `SPUtil.getCharacterisicFunctionList1` 到 `13`。全为 0 时记为尚未读到，不把所有项目判成不支持。`DeviceMode.isHasFunction_N` 读取的就是这些整数。

10 分钟是用户告知的预期，不是上述读数。电量没有设备时间；步数按日和小时；睡眠按一段睡眠。不能把 10 分钟套到每一项。
