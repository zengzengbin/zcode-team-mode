<div align="center">

# 👾 ZCode 小队模式 (ZCode Team Mode)

**一条口令，让你的 ZCode 拥有四人专业协同团队**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-ZCode-5B5BD6.svg)](https://zcode-ai.com)
[![Self-Check](https://img.shields.io/badge/tests-21%2F21%20PASS-16A34A.svg)](tests/team-mode-hook.test.cjs)
[![Version](https://img.shields.io/badge/version-1.0.0-D97706.svg)](skill/SKILL.md)

*主理人拆解任务 · 探索定位 · 执行实现 · 独立评审 · 专家顾问攻坚*

<br />

<img src="assets/banner.png" alt="ZCode Team Mode Banner" width="100%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);" />

</div>

---

## 📖 这是什么

**ZCode 小队模式**是专为 [ZCode](https://zcode-ai.com) 打造的专业级多智能体协同扩展。装好后，只要在任意聊天中单独发送一行口令，你的 ZCode 就会即刻升级为一支**分工明确、各司其职、严谨交付的四人专业工程团队**——

当前会话的主 Agent 担任团队主理人（负责总体任务拆解、跨任务决策、成果整合与最终验收），并将子任务按需派发给四个固定专职角色：

| 角色 | subagent_type | 核心职责 | 适用场景 |
|---|---|---|---|
| 🔍 **探索者** | `team-explorer` | 只读定位代码库文件、符号、入口与调用链 | 面对陌生复杂工程，先摸清结构，不修改文件 |
| ⚡ **执行者** | `team-executor` | 在明确的文件与模块范围内完成实现、修改与验证 | 需求明确，编写代码、修复缺陷、跑测试 |
| ✅ **评审者** | `team-reviewer` | 依据规范对稳定产物进行独立只读代码审查 | 阶段改动完成，严苛查验实质缺陷，拒绝放水 |
| 🎓 **专家顾问** | `team-expert-advisor` | 复杂架构决策、深层疑难诊断、受权复杂攻坚 | 核心架构选型、复杂算法建模、疑难故障攻坚 |

一条口令开启，持续生效直到明确退出；任务完成不自动退出；随时发 `退出小队模式` 恢复原生派发规则。

---

## 🌟 核心设计与技术亮点

1. **🛡️ 专职约束 + 专用 Agent 放行**：
   小队激活时，仅拦截宽泛且易模糊权责的内置原生角色（`general-purpose`、`Explore` 及未指定类型），而对文档/PPT/Excel 校验器（`*-visual-judge`）、生图智能体（`image-generator`）及官方插件角色**全面放行**，保持强大扩展性。
2. **🎯 普适化角色模型初始化（一次性交互选型）**：
   不再强制硬编码特定的专有模型。安装时 AI 会自动嗅探本地可用的模型配置，并引导用户为 4 个角色绑定最趁手的模型与思考强度。一次配置长期生效，且支持随时在 ZCode 设置面板或配置文件中修改。
3. **🔄 轮次差异化上下文注入（彻底杜绝重复标记）**：
   Hook 能够精确识别口令切换轮次。仅在开启/退出发生的该轮要求输出标记行（`👾 已开启小队模式` / `👾 已关闭小队模式`），后续轮次显式注入禁令，防止模型因长对话或上下文压缩而反复刷屏输出标记。
4. **📦 规范化三档上下文派发模板**：
   子 Agent 拥有独立任务上下文，不继承父会话历史。团队模式规范了**轻量**、**中等**（带已定决策摘要）、**完整**（附带工作区证据文件路径）三档派发标准，避免信息丢失或大段倾倒历史。
5. **💾 会话级独立落盘与精准隔离**：
   状态基于 ZCode 提供的 `session_id` 独立哈希持久化保存，不同聊天会话之间严格隔离，重启或刷新后仍可保持状态。

---

## 🚀 三步极速上手

```text
① 解压或克隆本仓库到本地目录
        ↓
② 打开 ZCode，发送一段话给 AI：
   「请按照 <仓库绝对路径>/INSTALL-AI.md 的指引，在这台机器上安装并验证 zcode-team-mode 技能。」
        ↓
③ 跟着 AI 的引导，确认 4 个角色的模型与思考强度绑定
        ↓
🎉 重启 ZCode（或新建聊天），单独一行输入「$zcode-team-mode」或「开启小队模式」即可！
```

> 💡 复制发送给 ZCode 的完整引导指令详见 [INSTALL-AI.md](INSTALL-AI.md)；用户速览详见 [README-FIRST.md](README-FIRST.md)。

---

## 🤖 角色分工与推荐配置选型

在安装初始化时，AI 会询问你选择或确认 4 个角色绑定的模型。建议按角色职责分配不同的模型梯队：

| 角色 | 推荐选型策略 | 推荐思考强度 | 常见搭配示例 (Provider/Model) |
|---|---|---|---|
| `team-explorer` | 轻量、高吞吐、极低延迟 | `high` | 各类 Flash / Mini / Haiku 系列 |
| `team-executor` | 主力编程、工程逻辑强、工具调用稳 | `max` 或 `high` | DeepSeek-V3/V4、Claude 3.5 Sonnet、GPT-4o |
| `team-reviewer` | 大上下文窗口、分析严谨、强逻辑推理 | `max` 或 `high` | Kimi-K2.8、Claude 3.5 Sonnet、GPT-4o |
| `team-expert-advisor` | 旗舰级智能、长程思考推理、复杂决策 | `xhigh` 或 `max` | Kimi-K3、OpenAI o1、DeepSeek-R1 |

> 📌 **后续修改**：这只是一次性初始化。后续如需更换任何角色的模型，可以随时：
> - **方式一**：在 ZCode 桌面端「设置」→「子智能体 (Agents)」中可视化点击修改；
> - **方式二**：直接打开编辑目标文件 `%USERPROFILE%/.zcode/agents/team-*.md`（修改 `model:` 和 `thoughtLevel:`）以及 `~/.zcode/skills/zcode-team-mode/SKILL.md`。

---

## 📋 常用口令

所有口令**必须在消息中单独占一行**（不必是第一行，但不能夹杂在句子中间）：

| 口令（单行发送） | 作用 | 备注 |
|---|---|---|
| `$zcode-team-mode` 或 `开启小队模式` | 启用小队模式 | 首行单次输出 `👾 已开启小队模式`，后续不重复 |
| `退出小队模式` 或 `关闭小队模式` | 关闭小队模式 | 输出 `👾 已关闭小队模式`，恢复原生默认规则 |
| `查看小队状态` 或 `查询小队模式` | 查询当前状态 | 查询当前会话是否处于小队活跃状态 |

---

## 🎯 进阶技巧：上下文分档派发规范

子 Agent 只能获得任务说明赋予的信息，拿不到父会话对话历史。主 Agent 在交办子任务时按信息密度规范了三档写法：

```markdown
### 1. 轻量档（常规编码与定位）
适用于目标清晰、验收标准明确的单点任务：
- 必含：交付目标、操作范围（文件/模块路径）、验收依据、写权限。

### 2. 中等档（涉及近期决策与架构约定）
适用于结论散落在近期对话中的任务：
- 包含：轻量全部 + 「已定决策」摘要（如：缓存统一走 SQLite、接口保持 v2 签名），逐条写明结论与生效范围，防止成员做出相反假设。

### 3. 完整档（复杂背景长链条攻坚）
适用于背景跨度大、涉及多轮排查记录的场景：
- 包含：中等全部 + 关键证据文件路径（将排查日志或关键材料整理成文件写入工作区，引导成员自行读取，严禁大段复制原文导致上下文稀释）。
```

---

## 📂 项目结构

```text
zcode-team-mode/
├── README.md                    # 本文档
├── README-FIRST.md              # 用户快速上手指南
├── INSTALL-AI.md                # 供 AI 自动化执行的安装指令手册
├── LICENSE                      # MIT 开源协议
├── staged-hooks.json            # ZCode hook 挂载配置模板
├── assets/                      # 视觉资源
│   └── banner.png               # 高清宽幅 Hero Banner
├── skill/                       # 技能本体
│   ├── SKILL.md                 # 协作规则定义与三档派发规范
│   ├── references/runtime.md    # 平台机制、故障边界与维护指引
│   └── scripts/team-mode-hook.cjs # 核心状态管理与工具派发拦截器
├── agents/                      # 4 个小队专职角色模板
│   ├── team-explorer.md         # 探索者角色定义
│   ├── team-executor.md         # 执行者角色定义
│   ├── team-reviewer.md         # 评审者角色定义
│   └── team-expert-advisor.md   # 专家顾问角色定义
└── tests/
    └── team-mode-hook.test.cjs  # 自动化测试套件（21/21 PASS）
```

---

## 🧪 自动化测试验证

本项目包含完整的状态流转、并发安全、非法输入阻断及权限守卫测试：

```bash
node --test tests/team-mode-hook.test.cjs
```

覆盖 21 种关键业务场景，包括：
- ✔️ 普通对话状态不扩散与零副作用
- ✔️ 独占行口令与非独占行容错匹配
- ✔️ 轮次级标记差异化输出校验（首轮出现、后续轮次彻底禁绝）
- ✔️ 激活状态下拦截内置原生 broad agent，放行专用视觉/生图 Agent
- ✔️ 状态跨多进程与 Windows 用户目录持久化
- ✔️ 损坏状态与伪造 session 阻断恢复
- ✔️ 审计日志敏感信息脱敏校验

---

## ❓ 常见问题 (FAQ)

**Q：安装后发送口令没有反应？**  
A：修改 `config.json` 后**必须重启 ZCode 客户端（或新开会话）**让 Hook 生效；同时请检查输入口令是否独占整行。

**Q：小队模式派发时报错模型不存在？**  
A：说明初始化时填写的 `model` 在当前的 ZCode Provider 中未配置。打开 ZCode 设置复核 Model ID，或在 `~/.zcode/agents/team-*.md` 中将 `model:` 替换为当前可用的模型名。

**Q：如何彻底卸载？**  
A：直接按照 [INSTALL-AI.md](INSTALL-AI.md) 第六节的指引执行干净卸载，也可通过安装时自动备份的 `config.json.bak-team-mode` 一键无损还原。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 许可协议。欢迎 Star、Fork 与提 Issue！

<div align="center">

<sub>Crafted with ❤️ for the ZCode Community · If this helps you, please star ⭐</sub>

</div>
