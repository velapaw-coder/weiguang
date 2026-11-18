# 微光

安卓手环应用。蓝牙使用优创 Ute Android SDK（RK）V5.4.2，健康记录保存在手机 SQLite。LangGraph 在 WebView 里编排数据质量和教练建议。火山方舟只通过未部署的模型代理调用，密钥不进 APK。

没有云端健康库。卸载应用会删除本机 `weiguang.db`。记录不会同步到另一部手机。

## 本地运行

```bash
npm install
npm test
npm run build
```

模型代理只在你提供环境变量后启动，不会自己申请云资源：

```bash
MODEL_PROXY_TOKEN=... VOLC_ARK_API_KEY=... VOLC_ARK_BASE_URL=... VOLC_ARK_MODEL=... node server/model-proxy/server.mjs
```

任一火山变量缺失时，代理返回 `model_unconfigured`，不会请求上游。

安卓调试包需要私有 SDK，见 `docs/private-sdk.md`。没有该 aar 时，`:app:assembleDebug` 会失败，不会改用模拟 SDK。

## 数据

设备采样时间、手机收到时间、上次成功同步时间分开保存。你告知的大约 10 分钟采集间隔只作说明，不是设备读数，也不套到每个指标。应用不写入手环采样设置，不按 10 分钟调用模型或发通知，也不承诺后台准时轮询。

## 文档

- `docs/sdk-capabilities.md`：SDK 与 demo 的能力对照
- `docs/private-sdk.md`：私有 SDK 安装
- `docs/local-architecture.md`：本机架构、提醒和未做的边界
