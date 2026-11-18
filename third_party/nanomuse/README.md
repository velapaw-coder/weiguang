# nanoMuse（上游源码，未改逻辑）

来源：<https://github.com/nano-muse/nanoMuse/commit/5020df29cf717208b84d7014856d0846f4794d0f>

版本：1.0.9。提交说明：`docs(readme): refresh the community contributors`。

本目录是该提交里的 Python 包 `nanomuse/`，以及上游 `LICENSE`、`NOTICE`。许可证是 GPL-3.0-or-later。版权和归属仍属于 nanoMuse contributors。这里没有改 agent 循环。

Android / OpenMinis 树、proot、云中继不在本目录。微光其余源码不因放入本目录而改成 GPL。

`third_party/weiguang_muse` 会导入这里的 `MuseAgent`，因此那一层适配代码也按 GPL-3.0-or-later 提供。

不要把本目录打进带有优创闭源 AAR 的 APK。那一步会把 GPL 程序和不能公开的厂商库放进同一个分发包，当前没有可以这样做的许可依据，所以安装包封装暂停。
