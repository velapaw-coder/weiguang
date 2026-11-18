# 本机架构

CloudBase 方案已停用。不创建、不修改腾讯云资源。

```
优创 BLE SDK
  -> 手机 SQLite（weiguang.db，HealthRepository）
  -> 本机对照（compareSeries）
  -> LangGraph（WebView 内的 StateGraph + MemorySaver）
  -> 可选：模型代理 -> 火山方舟
```

图状态和教练结果写回 SQLite。官方 `@langchain/langgraph-checkpoint-sqlite` 依赖 Node 的 `better-sqlite3`，不能打进 WebView。应用使用 `@langchain/langgraph` 1.7.5 的 `StateGraph` 和自带 `MemorySaver`，并把检查点字节编码进 `graph_snapshots`。

2026-11-18 在本环境的验证：

- `npm test`：Vitest 8 项通过，模型代理 2 项通过。其中一项把编码后的检查点放回新的 `MemorySaver` 并读出 checkpoint id。
- `vite build` 成功，产物约 1.3 MB。`scripts/check-bundle.mjs` 确认包内有教练文案，且没有 `better-sqlite3`、`node:fs`、`node:sqlite`。构建没有把 Node 内置模块留成外部依赖。
- 因此同一套 LangGraph 图会随 Capacitor 的 `dist` 进入安卓 WebView。这还不是在真机 WebView 里点过一次的记录。
- `:band-core:test` 6 项通过。`:app:assembleDebug` 成功，调试包约 15 MB。包内清单没有 demo 的 YCAPPKEY。没有手环，不能把这次编译说成已经连上设备。调试包含厂商库，不放进公开仓库，也不附在 PR 上。

模型代理 `server/model-proxy/server.mjs` 不写数据库。它校验代理令牌、限制请求大小和频率，并在 20 秒后超时。火山密钥、基址和模型名只来自环境变量。没有配齐就返回 `model_unconfigured`。

## 任务和提醒

教练可以提出任务，写入 SQLite 前要你确认。没有模型时仍可手写任务，来源记为 `user`，不会标成模型生成。缺少健康记录时不生成带健康依据的任务。

提醒由 `ReminderPolicy` 决定，再用 `AlarmManager.set(RTC)` 安排一次不精确闹钟。不调用 `setExact`。默认不重复、不每天群发。同一任务同一本地日期只响一次，并有 4 小时冷却。拒绝通知权限后，任务仍可勾选。模型输出里的通知或设备命令会被丢掉。

计划时间用手机时区的墙上时钟。Android 可能推迟闹钟。断连或进程被系统挂起时，界面显示待同步，不承诺 10 分钟后台采集。

## 还没做

- 没有真机，不能说已经连上 K80 或读到电量和步数。
- 久坐、闹钟、来电和短信只报告能力位，不写入手环。
- 不读取或设置自动测量间隔。
- 情绪算法激活依赖厂商服务和密钥，未接入。
- 模型代理没有部署。
- 公开 CI 没有厂商库，不能把安卓打包标成成功。
