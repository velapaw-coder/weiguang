# 私有优创 SDK

公开仓库不包含 SDK 压缩包、aar、jar、so、开发文档、demo 源码或其中的密钥。不要把这些文件提交到 git，也不要上传到公共传输服务。

1. 在本机解压 `UteAndroidSDK(RK)_V5.4.2`，路径留在仓库外。
2. 在已 gitignore 的 `android/local.properties` 写入：

```
sdk.dir=/path/to/android-sdk
uteSdkDir=/path/to/UteSdkDemohx
```

`uteSdkDir` 指向含 `app/libs/uteAndroidSdk_v5.4.2.aar` 的 demo 工程目录。也可以设置环境变量 `UTE_SDK_DIR`。

3. 构建：

```bash
npm run build
npx cap sync android
cd android && ./gradlew :band-core:test :app:assembleDebug
```

调试 APK 会嵌入厂商库。授权范围未在仓库中说明，因此不要公开分发 APK 或厂商库。

不要使用 demo 里的 `YCAPPKEY`、OTA 密钥或写死的同步时间 `202203251100`。本应用不读取这些值。
