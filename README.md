# AI Energy Companion 交互原型

无屏手环睡眠与精力管理 App 的前端原型。依据用户提供的 12 画面拼贴，直接用 React 组件实现手机端页面和完整操作路径。本项目没有使用 Lovart 生图，Lovart 积分消耗为 0。

## 运行

```bash
npm install
npm run dev -- --port 4173
```

浏览器打开 `http://localhost:4173/`。`npm run build` 会生成 `dist/`。

## 已实现的页面与流程

1. 欢迎 → 模拟连接手环 → 4 项问答 → 目标确认 → 30 天计划预览 → 完成引导。
2. 今日：首页展示演示精力指数、睡眠、静息心率、血氧、步数和 AI 建议。
3. 教练：输入问题、快捷问题和演示回复。手机键盘出现时，使用 `visualViewport` 高度并隐藏底部导航，保持输入框可见。
4. 计划：当前计划、任务清单、历史空状态，任务可勾选。
5. 洞察：趋势类别切换、演示图表和指标说明。
6. 会员：方案选择与权益预览，无支付行为。
7. 我的：目标、记忆、设备、提醒、隐私入口和重新体验引导。

页面状态保存在本机浏览器的 `localStorage` 中，仅用于演示。聊天回复、任务结果、手环连接和所有健康数值均为模拟数据。

## 设计分析与修正

- 原拼贴的主线可用：建立认知 → 连接设备 → 了解需求 → 确认目标 → 形成计划 → 每日跟进。
- 原拼贴从“刚开始使用”直接跳到计划第 8 天与 30 天趋势，时间线不连贯。原型把计划改为第 1 天；趋势明确标为演示样本。
- 问答必须完成 4 题才能继续，否则无法声称计划基于用户情况。
- 配对完成并不等于已有睡眠历史。真实版要在数据不足时显示“等待首夜记录”和“尚无个人基线”。
- 血糖、血压是否可显示，必须以实际硬件和合规能力为准。此原型在连接页明确写明它们不由手环模拟采集。
- 精力指数需要后端提供定义、输入数据、更新时间、缺失数据处理及可信度；当前 82 分仅为演示值。
- AI 建议要标注数据来源及边界，避免把相关性说成医疗结论。
- 会员页保留视觉参考中的价格，正式定价、权益和支付流程尚未确定。

## 后端接入建议

以下为前后端对接的最小资源，不代表现有服务已经实现：

| 资源 | 建议接口 | 核心字段 |
|---|---|---|
| 当前用户与偏好 | `GET/PATCH /me` | `id`, `timezone`, `sleep_goal`, `bedtime_goal` |
| 设备状态 | `GET /devices`, `POST /devices/pair` | `device_id`, `model`, `capabilities`, `connection_state`, `last_synced_at`, `battery` |
| 每日汇总 | `GET /daily-summary?date=` | `sleep_minutes`, `resting_hr`, `spo2`, `steps`, `energy_score`, `sample_coverage`, `updated_at` |
| 趋势 | `GET /trends?metric=&range=` | `points`, `baseline`, `baseline_period`, `data_quality` |
| 入门问答 | `POST /onboarding/responses` | 4 项答案、提交时间 |
| 目标与计划 | `GET/PATCH /goals`, `GET /plans/current` | `goal_id`, `start_date`, `phase`, `tasks`, `status` |
| 任务 | `PATCH /tasks/:id` | `status`, `completed_at`, `reminder_at` |
| AI 对话 | `POST /coach/messages` | `message`, `context_sources`, `response`, `suggested_actions` |
| 观察记录 | `POST /observations` | `text`, `observed_at`, `tags`, `source='user'` |
| 通知 | `GET /notifications` | `type`, `title`, `created_at`, `read_at`, `related_resource` |

每个数值都应带 `source`、`observed_at` 或 `updated_at`、`quality`。缺失、过期、断连、同步中、权限拒绝、设备不支持必须是独立状态，不能默认为“正常”。AI 记忆中用户确认的事实与系统推断分开存储。真实蓝牙配对、云端用户隔离、后台任务与推送都需后续开发。

## 验证

- `npm run build` 通过。
- 浏览器走通 6 步引导、首页、聊天发送、任务勾选、洞察与会员入口。
- 390×844 手机视口检查完成；390×520 高度模拟键盘占位，输入框保持可见。
- 视觉与操作检查见 `design-qa.md`。
