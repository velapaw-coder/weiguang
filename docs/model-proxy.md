# 模型代理

健康记录、任务和 LangGraph 检查点仍在手机 SQLite。代理不写数据库，也不把对话交给方舟保存。

官方 Responses 文档写明 `store` 默认是 `true`。`previous_response_id` 会取回上一轮已经存下的输入和回答。父侧用这个字段做过两轮通用接口测试，说明接口能承接上下文，但这条路径依赖服务商保存。健康问答不使用它。每次请求显式 `store: false`，上下文由手机把最近几轮本地教练文字再次放进 `input`。不传 `tools`，不打开联网搜索，不发送数据上报头。

默认模型是 `doubao-seed-2-1-lite-260915`，可用环境变量覆盖。默认地址是 `POST https://ark.cn-beijing.volces.com/api/v3/responses`。`stream` 为 false，`max_output_tokens` 为 256，`thinking.type` 为 `disabled`。

成功必须同时满足 HTTP 成功、JSON、顶层 `status` 为 `completed`，以及非空 `output_text` 或 `output[].content[]` 里的 `output_text`。`incomplete`、`failed`、`error`、超时和空文本都不是成功。

## 交给部署的人

Worker 入口只能有 `export default { fetch }`。workerd 会把每个具名导出当成处理函数；之前的 `export const DEFAULT_MODEL` 是字符串，模块加载时抛出 `Incorrect type for map entry 'DEFAULT_MODEL'`，线上因此对所有请求返回 1101。逻辑放在 `server/model-proxy/protocol.mjs`，入口 `server/model-proxy/volc-proxy.mjs` 只默认导出 fetch。

配置：`server/model-proxy/wrangler.jsonc`。`compatibility_date` 为 `2026-11-18`。非密钥变量是 `VOLC_ARK_MODEL` 和 `VOLC_ARK_RESPONSES_URL`。密钥只有 `MODEL_PROXY_TOKEN` 和 `VOLC_ARK_API_KEY`。不需要数据库、KV 或其他绑定。

用 Wrangler 部署时，入口仍是 `volc-proxy.mjs`，Wrangler 会把它和 `protocol.mjs` 打成只含默认导出的模块。若连接器只能上传一个文件，使用这次 `wrangler deploy --dry-run --outdir` 生成的 `server/model-proxy/build/worker.js`。

还没有部署，也没有创建 Cloudflare 资源。账号尚未选定。部署时只需要这个 Worker，不需要数据库。

线上 `weiguang-model-proxy.velapaw.workers.dev` 仍是修复前的版本，GET 和 POST 都返回 `error code: 1101`。不要把这次部署当成可用。

1. 安装 Wrangler 并登录 VelaPaw 的 Cloudflare 账号。
2. 在 `server/model-proxy` 执行 `npx wrangler deploy`。入口是 `volc-proxy.mjs`，Wrangler 会打包 `protocol.mjs`。
3. 若连接器只能提交一个模块，上传 `server/model-proxy/build/worker.js`，`main_module` 用这个文件，`compatibility_date` 用 `2026-11-18`。非密钥变量沿用 `wrangler.jsonc`。
4. `MODEL_PROXY_TOKEN` 已经写过则不用重写。火山密钥由账号所有者自己写入 `VOLC_ARK_API_KEY`，不要发回仓库或打进 APK。
5. 重新部署后，不带令牌的 GET `/` 和 POST `/v1/coach` 应是 401。带令牌但没有火山密钥时应是 200，正文 `{"status":"model_unconfigured"}`。确认后再把 `https://weiguang-model-proxy.velapaw.workers.dev/v1/coach` 用于 APK 的 `VITE_MODEL_PROXY_URL`。

`MODEL_PROXY_TOKEN` 只是内部测试的共用闸门和每分钟 10 次的进程内计数。它不能区分用户，重启或换一台隔离实例就清空，不能当作正式产品的登录。正式使用要另做用户鉴权。速率限制也不是持久配额。

应用在拿到 HTTPS 地址之前不重新打包。地址可以在打包时用 `VITE_MODEL_PROXY_URL` 写入，这个值不是密钥。令牌仍由使用者填写，不进构建参数。

本环境没有火山密钥。协议测试用的是桩响应。父侧已单独对真实接口做过两轮 HTTP 200。不能把桩测试说成手机应用已经问通过模型。
