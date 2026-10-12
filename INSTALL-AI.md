# INSTALL-AI.md — zcode-team-mode 安装指令（供 AI 执行）

> **给 AI 的说明**：你的用户收到了一个分享包，想在这台机器的 ZCode 上安装 `zcode-team-mode`（小队模式）技能。请严格按照本文档完成安装、模型初始化配置与测试验证。本包设计目标平台为 **Windows**。安装对象是 `%USERPROFILE%\.zcode\` 下的配置与角色文件，属于用户数据修改：若目标已存在同名内容，先向用户报告，不要静默覆盖。

---

## 一、包内容清单与占位符说明

```text
zcode-team-mode-share/
├── README-FIRST.md              # 给用户本人看的快速说明（无需你处理）
├── INSTALL-AI.md                # 本文档
├── staged-hooks.json            # hook 注册模板（含 <NODE_PATH> 和 <HOOK_SCRIPT_PATH> 占位符）
├── skill/                       # 技能本体 → 安装到 ~/.zcode/skills/zcode-team-mode/
│   ├── SKILL.md                 # 技能定义（表格含 4 组角色模型与思考强度占位符）
│   ├── references/runtime.md    # 运行机制与维护说明
│   └── scripts/team-mode-hook.cjs # 核心 hook 逻辑（管理会话状态与派发拦截）
├── agents/                      # 4 个角色模板 → 安装到 ~/.zcode/agents/
│   ├── team-explorer.md         # 探索角色（含 <EXPLORER_MODEL>、<EXPLORER_THOUGHT_LEVEL>）
│   ├── team-executor.md         # 执行角色（含 <EXECUTOR_MODEL>、<EXECUTOR_THOUGHT_LEVEL>）
│   ├── team-reviewer.md         # 评审角色（含 <REVIEWER_MODEL>、<REVIEWER_THOUGHT_LEVEL>）
│   └── team-expert-advisor.md   # 专家角色（含 <EXPERT_ADVISOR_MODEL>、<EXPERT_ADVISOR_THOUGHT_LEVEL>）
└── tests/
    └── team-mode-hook.test.cjs  # 完整自检测试（21 个用例，含轮次防重复与专用 agent 放行）
```

---

## 二、前置检查（只读，先全部执行再动手）

1. **确认 node 可用**：运行 `node -v`。hook 脚本依赖 Node.js。若不可用，停止并告知用户先安装 Node.js。
2. **记录 node 绝对路径**：运行 PowerShell `(Get-Command node).Source`，记为 `<NODE_PATH>`（例如 `C:\Program Files\nodejs\node.exe`）。
3. **确认 ZCode 目录存在**：`%USERPROFILE%\.zcode\` 应存在。
4. **检查是否已安装（残留检测）**：
   - `%USERPROFILE%\.zcode\skills\zcode-team-mode\` 是否存在；
   - `%USERPROFILE%\.zcode\cli\config.json` 的 `hooks` 中是否已引用 `team-mode-hook.cjs`。
   - 任一命中即视为**已安装或残留**：向用户展示现状，确认是覆盖更新还是保留，不要静默删除。
5. **读取当前 config.json**（`%USERPROFILE%\.zcode\cli\config.json`）：解析为 JSON，记录其中**已有的全部顶层键**（如 `plugins`、`mcp` 等）和是否已有 `hooks` 字段。若文件不存在属全新安装，后续直接创建。
6. **嗅探可用模型配置**：检查 `%USERPROFILE%\.zcode\v2\provider_config.json` 是否存在。若存在，解析其中的 `providerRules` / `personalModelIds`，记录当前机器已启用的 provider ID 和可用模型列表，供步骤 1 初始化时向用户推荐。

---

## 三、安装步骤

### 步骤 1：角色模型初始化询问与确认（普适化关键交互）

小队模式包含 4 个专职分工角色。为了适应不同用户的模型渠道（官方 API、代理中转、Workbuddy、私有部署等），**必须在部署文件前向用户确认各角色的模型与思考强度绑定**。

向用户展示 4 个角色的定位和推荐选型：

| 角色 | 职责定位 | 推荐选型方向 | 推荐思考强度 |
|---|---|---|---|
| `team-explorer` | 只读探索、代码定位、符号与调用关系搜索 | 轻量快速模型（如各类 Flash / Mini / Haiku） | `high` |
| `team-executor` | 代码实现、Bug 修复、本地测试验证 | 主力编程模型（如 DeepSeek-V3/V4、Sonnet、GPT-4o 等） | `max` 或 `high` |
| `team-reviewer` | 独立只读代码评审，严苛查验实质缺陷 | 强推理分析、长上下文模型（如 Kimi-K2.8、Opus、Sonnet 等） | `max` 或 `high` |
| `team-expert-advisor` | 架构决策、疑难诊断、受权复杂任务 | 旗舰推理模型（如 Kimi-K3、o1、R1 等） | `xhigh` 或 `max` |

向用户提供选择建议：
- **若嗅探到 `new-provider`（Workbuddy 代理）**，可推荐默认预设：
  - Explorer: `new-provider/glm-5.3-flash` (high)
  - Executor: `new-provider/deepseek-v4.1-flash` (max)
  - Reviewer: `new-provider/kimi-k2.8-preview` (max)
  - ExpertAdvisor: `new-provider/kimi-k3-1` (xhigh)
- **若为其他渠道**，向用户列出嗅探到的可用模型，请用户指定或确认各角色绑定（格式：`providerId/modelId`，例如 `anthropic/claude-3-5-sonnet`）。
- 若用户确认直接采用某套配置或给出了自定义配置，记录这 4 组值：
  - `<EXPLORER_MODEL>` / `<EXPLORER_THOUGHT_LEVEL>`
  - `<EXECUTOR_MODEL>` / `<EXECUTOR_THOUGHT_LEVEL>`
  - `<REVIEWER_MODEL>` / `<REVIEWER_THOUGHT_LEVEL>`
  - `<EXPERT_ADVISOR_MODEL>` / `<EXPERT_ADVISOR_THOUGHT_LEVEL>`
  *(注：若所选模型不支持思考强度，thoughtLevel 保持为 high 或设为空即可。)*

### 步骤 2：部署技能与角色文件（替换占位符）

1. **部署 4 个角色到 `%USERPROFILE%\.zcode\agents\`**：
   - 目标文件为 `team-explorer.md`、`team-executor.md`、`team-reviewer.md`、`team-expert-advisor.md`。
   - 读取包内 `agents/` 下对应的 `.md` 模板，将其中的 `<..._MODEL>` 和 `<..._THOUGHT_LEVEL>` 替换为步骤 1 确认的值，写入目标目录。
2. **部署技能文件到 `%USERPROFILE%\.zcode\skills\zcode-team-mode\`**：
   - 目标包括 `SKILL.md`、`references/runtime.md`、`scripts/team-mode-hook.cjs`。
   - 其中 `SKILL.md` 中的表格占位符及第 50 行的 ExpertAdvisor 描述占位符同步替换为步骤 1 确认的值；其余两文件直接复制。

### 步骤 3：准备 hook 注册片段

读取包内 `staged-hooks.json`，取其 `hooks` 字段，替换 2 个占位符：
- `<NODE_PATH>` → 前置检查第 2 条得到的 node 绝对路径；
- `<HOOK_SCRIPT_PATH>` → `%USERPROFILE%\.zcode\skills\zcode-team-mode\scripts\team-mode-hook.cjs` 的**绝对路径**。

> **注意 JSON 转义**：Windows 路径中的 `\` 在 JSON 字符串中必须写成 `\\`。

### 步骤 4：合并写入 config.json（安全合并，严禁全盘替换）

目标文件：`%USERPROFILE%\.zcode\cli\config.json`。

1. **先备份**：复制一份 `config.json` → `config.json.bak-team-mode`（若已存在则加时间戳）。
2. **合并规则**：
   - 原 JSON 的所有其他顶层键（`plugins`、`mcp` 等）**原样保留**；
   - 原文件没有 `hooks` 字段 → 直接写入步骤 3 准备好的 `hooks` 对象；
   - 原文件已有 `hooks` 字段 → 保留现有 `enabled`/`timeoutMs`/`maxOutputBytes`；将本包中的 hook 条目追加到 `events.UserPromptSubmit` 和 `events.PreToolUse` 数组末尾（若已有引用 `team-mode-hook.cjs` 的条目则跳过追加）；
3. **写回并校验**：以 UTF-8 编码写回，并用 `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('ok')"` 验证为合法 JSON。

### 步骤 5：冒烟测试 hook 脚本

依次运行以下 PowerShell 命令（将 node 和脚本路径换成实际绝对路径）：

```powershell
# ① 开启口令 → 预期输出 JSON，含 ZCODE_TEAM_MODE=active
'{"hook_event_name":"UserPromptSubmit","session_id":"install-smoke","prompt":"开启小队模式"}' | & "<NODE_PATH>" "<HOOK_SCRIPT_PATH>"

# ② 启用状态下派发内置角色 → 预期输出 JSON，permissionDecision=deny
'{"hook_event_name":"PreToolUse","session_id":"install-smoke","tool_name":"Agent","tool_input":{"subagent_type":"general-purpose"}}' | & "<NODE_PATH>" "<HOOK_SCRIPT_PATH>"

# ③ 退出口令 → 预期输出 JSON，含 ZCODE_TEAM_MODE=inactive
'{"hook_event_name":"UserPromptSubmit","session_id":"install-smoke","prompt":"退出小队模式"}' | & "<NODE_PATH>" "<HOOK_SCRIPT_PATH>"
```

符合预期后，清理冒烟测试留下的缓存文件（`%USERPROFILE%\.zcode\cli\team-mode\sessions\` 下包含 `install-smoke` 哈希的文件）。

### 步骤 6：运行完整自检测试

在分享包目录下运行：

```powershell
node --test tests\team-mode-hook.test.cjs
```

预期 21 个测试用例全部通过（`pass 21`）。包含轮次级标记防重复测试与专用 agent 放行测试。

---

## 四、完成后告知用户

安装完成且自检通过后，向用户汇报以下核心事项：

1. **安装清单与已绑定模型**：展示 4 个小队角色的绑定模型与思考强度；
2. **重启生效**：提醒用户**重启 ZCode（或新建一个聊天）**，以让 hook 和子智能体配置加载；
3. **使用口令**：单独一行输入 `$zcode-team-mode`（或"开启小队模式"）启用；`退出小队模式` 退出；`查看小队状态` 查询；
4. **派发规则与上下文分档**：小队启用后，仅禁止内置 broad agent（`general-purpose`/`Explore`），专职角色与专用 agent（如各类 visual-judge、image-generator）均可正常协同；派发支持三档上下文写法（轻量、中等、完整），避免信息孤岛或机械复制；
5. **标记防重复机制**：hook 按轮次注入差异化指令，仅在切换状态首轮要求输出标记，后续轮次显式禁止重复输出，防止上下文压缩后出现重复标记；
6. **后续如何修改模型**：
   - 方式一：直接在 ZCode 设置界面中修改对应智能体的模型与强度；
   - 方式二：直接编辑文件 `%USERPROFILE%\.zcode\agents\team-*.md`（修改 `model:` 和 `thoughtLevel:`）以及 `SKILL.md`。

---

## 五、故障排查

| 现象 | 处理建议 |
|---|---|
| 冒烟测试无输出或报错 | 确认 node 绝对路径和脚本路径无误；确认 PowerShell 传参用单引号包裹 JSON，避免路径中的反斜杠被转义 |
| 步骤 6 自检测试未通过 | 测试通过相对路径引用 `skill/scripts/team-mode-hook.cjs`，确保在包根目录运行；检查报错断言 |
| 对话中输入口令没反应 | 确认已重启 ZCode；核对 `config.json` 中 hook 的 `command` 与 `args` 路径有效；确认 `hooks.enabled` 为 true |
| 派发时报错模型不存在 | 说明 ZCode 的 provider 配置中未找到绑定的 modelId；指导用户打开 ZCode 检查 provider 设置，或在 `team-*.md` 中更换为已有可用模型 |
| config.json 格式损坏 | 用备份文件 `config.json.bak-team-mode` 一键还原 |

---

## 六、卸载指引（仅在用户明确要求时执行）

1. 删除 `%USERPROFILE%\.zcode\skills\zcode-team-mode\` 目录；
2. 删除 `%USERPROFILE%\.zcode\agents\` 下 4 个 `team-*.md` 文件；
3. 从 `config.json` 的 `hooks.events` 数组中移除引用 `team-mode-hook.cjs` 的条目（若数组为空可移除对应键）；
4. 删除会话状态缓存目录 `%USERPROFILE%\.zcode\cli\team-mode\`；
5. 或直接用 `config.json.bak-team-mode` 还原。
