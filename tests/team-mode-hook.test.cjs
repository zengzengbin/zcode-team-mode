"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { run, commandFromPrompt, filesFor, ROLES, RESTRICTED } = require("../skill/scripts/team-mode-hook.cjs");
const base = fs.mkdtempSync(path.join(__dirname, "runtime-"));
const opts = { stateDir: path.join(base, "sessions"), env: {} };
const prompt = (text, id = "chat-A") => run({ hook_event_name: "UserPromptSubmit", session_id: id, prompt: text }, opts);
const agent = (role, id = "chat-A", tool = "Agent") => run({ hook_event_name: "PreToolUse", session_id: id, tool_name: tool, tool_input: role === undefined ? {} : { subagent_type: role } }, opts);
const skill = (name, id = "chat-A") => run({ hook_event_name: "PreToolUse", session_id: id, tool_name: "Skill", tool_input: { skill: name } }, opts);
const denied = x => x.output.hookSpecificOutput?.permissionDecision === "deny";
const plain = x => assert.deepEqual(x, { output: {}, exitCode: 0, stderr: "" });
const active = x => assert.match(x.output.hookSpecificOutput.additionalContext, /ZCODE_TEAM_MODE=active/);
const inactive = x => assert.match(x.output.hookSpecificOutput.additionalContext, /ZCODE_TEAM_MODE=inactive/);
const firstMarker = x => assert.match(x.output.hookSpecificOutput.additionalContext, /👾 已开启小队模式/);
const noRepeatMarker = x => assert.doesNotMatch(x.output.hookSpecificOutput.additionalContext, /👾 已开启小队模式/);

process.on("exit", () => {
  const parent = fs.realpathSync(__dirname);
  if (fs.existsSync(base)) {
    const resolved = fs.realpathSync(base);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("runtime-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test("ordinary chat remains unchanged and does not create state", () => {
  plain(prompt("请帮我分析这段代码"));
  for (const role of ["general-purpose", "Explore", "image-generator", undefined]) plain(agent(role));
  plain(skill("grilling"));
  assert.equal(fs.existsSync(opts.stateDir), false);
});

test("only direct standalone-line commands activate; references and negative requests do not", () => {
  for (const text of ["$zcode-team-mode", "开启 ZCode 小队模式", "使用 $zcode-team-mode\n完成任务", "\uFEFF  $zcode-team-mode\r\n任务"]) {
    assert.equal(commandFromPrompt(text), "on");
  }
  for (const text of ["$zcode-team-mode 是什么？先解释，不要启用。", "$zcode-team-mode 不要开启，只查看内容。", "使用 $zcode-team-mode 完成任务", "$zcode-team-mode，分析项目", "不要开启 ZCode 小队模式", "请解释 $zcode-team-mode", "> $zcode-team-mode", "```text\n$zcode-team-mode\n```", "$zcode-team-mode-other", "\"$zcode-team-mode\"", "查看退出 ZCode 小队模式是什么意思"]) {
    assert.equal(commandFromPrompt(text), null, text);
  }
});

test("short forms and case/space-insensitive commands are accepted, exactness kept", () => {
  for (const text of ["开启小队模式", "开启Zcode小队模式", "开启 zcode 小队模式", "开启\u3000ZCODE\u3000小队模式", "打开小队模式", "打开 ZCode 小队模式", "启动小队模式"]) {
    assert.equal(commandFromPrompt(text), "on", text);
  }
  for (const text of ["退出小队模式", "退出Zcode小队模式", "退出 zcode 小队模式", "关闭小队模式", "关闭 ZCode 小队模式"]) {
    assert.equal(commandFromPrompt(text), "off", text);
  }
  for (const text of ["查看小队状态", "查看小队模式状态", "查看zcode小队状态", "查看 ZCode 小队状态", "查看小队模式", "查看ZCode小队模式", "查询小队状态", "查询 小队模式"]) {
    assert.equal(commandFromPrompt(text), "status", text);
  }
  for (const text of ["不要开启小队模式", "开启小队模式是什么意思", "开启小队模式，但只是问问", "先别退出小队模式", "退出小队模式？", "帮我看看怎么退出小队模式", "关闭小队模式是什么意思", "查看", "查看小队", "查看小队状态和配置", "打开小队模式后要做什么"]) {
    assert.equal(commandFromPrompt(text), null, text);
  }
});

test("commands and interface-rendered skill links may sit on any standalone line", () => {
  const link = (name, target) => `[$${name}](${target})`;
  const team = link("zcode-team-mode", "C:\\Users\\23857\\.zcode\\skills\\zcode-team-mode\\SKILL.md");
  for (const text of [
    "帮我改一下技能\n开启小队模式",
    "先看看现状\n\n开启 ZCode 小队模式\n任务如下",
    "$zcode-team-mode",
    "\n$zcode-team-mode",
    "这是引用\n开启 ZCode 小队模式",
    `${team} 拆分模块`,
    `先看现状\n${team} 拆分模块`,
    "这是引用\n" + team,
  ]) {
    assert.equal(commandFromPrompt(text), "on", text);
  }
  for (const text of ["开启小队模式干活儿吧", "我要 开启小队模式 了", "退出小队模式？"]) {
    assert.equal(commandFromPrompt(text), null, text);
  }
});

test("commands on any line drive real state transitions", () => {
  active(prompt("随便一句话\n开启小队模式\n干活", "chat-G"));
  active(prompt("查看小队状态", "chat-G"));
  inactive(prompt("任务结束\n退出小队模式", "chat-G"));
  plain(agent("Explore", "chat-G"));
});

test("shorthand commands drive real state transitions", () => {
  active(prompt("开启小队模式\n帮我拆分模块", "chat-D"));
  active(prompt("查看小队状态", "chat-D"));
  inactive(prompt("退出小队模式", "chat-D"));
  inactive(prompt("查看小队状态", "chat-D"));
  plain(agent("Explore", "chat-D"));
  assert.ok(denied(agent("team-explorer", "chat-D")));
  active(prompt("开启Zcode小队模式", "chat-E"));
  inactive(prompt("退出Zcode小队模式", "chat-E"));
  plain(agent("Explore", "chat-E"));
  inactive(prompt("查看小队模式", "chat-F"));
  active(prompt("打开小队模式", "chat-F"));
  active(prompt("查看小队模式", "chat-F"));
  inactive(prompt("关闭小队模式", "chat-F"));
  inactive(prompt("查询小队状态", "chat-F"));
});

test("interface-rendered skill links leading any line activate like the plain token", () => {
  const link = (name, target) => `[$${name}](${target})`;
  const team = link("zcode-team-mode", "C:\\Users\\23857\\.zcode\\skills\\zcode-team-mode\\SKILL.md");
  const teamEscaped = link("zcode-team-mode", "C:\\\\Users\\\\23857\\\\.zcode\\\\skills\\\\zcode-team-mode\\\\SKILL.md");
  const other = link("grilling", "C:\\Users\\23857\\.zcode\\skills\\grilling\\SKILL.md");
  for (const text of [
    team,
    teamEscaped,
    `${team} 帮我拆分模块`,
    `${team} ${other} 帮我拆分模块`,
    `${other} ${team} 帮我拆分模块`,
    `\uFEFF  ${team}\r\n任务`,
    `先看现状\n${team} 拆分模块`,
    `${link("zcode-team-mode", "zcode-team-mode")} 任务`,
  ]) {
    assert.equal(commandFromPrompt(text), "on", text);
  }
  for (const text of [
    `请解释这个技能 ${team}`,
    `这个 ${team} 是干什么的？`,
    `> ${team}`,
    `\`\`\`text\n${team}\n\`\`\``,
    other,
    "[zcode-team-mode](C:\\notes\\other-skill.md)",
    "[团队模式](C:\\Users\\23857\\.zcode\\skills\\zcode-team-mode\\SKILL.md)",
  ]) {
    assert.equal(commandFromPrompt(text), null, text);
  }
});

test("automatic Skill loading cannot enable mode or restrict builtins", () => {
  assert.ok(denied(skill("zcode-team-mode")));
  assert.equal(fs.existsSync(filesFor(opts.stateDir, "chat-A").state), false);
  plain(agent("Explore"));
});

test("dedicated roles require activation while existing custom roles remain usable", () => {
  for (const role of ROLES) assert.ok(denied(agent(role)));
  assert.ok(denied(agent("TEAM-EXPLORER")));
  plain(agent("image-generator"));
});

test("marker instruction appears only on the turn that changes state", () => {
  firstMarker(prompt("开启小队模式", "marker-chat"));
  noRepeatMarker(prompt("继续任务", "marker-chat"));
  noRepeatMarker(prompt("查看小队状态", "marker-chat"));
  active(prompt("再看一次状态", "marker-chat"));
  const off = prompt("退出小队模式", "marker-chat");
  assert.match(off.output.hookSpecificOutput.additionalContext, /👾 已关闭小队模式/);
  noRepeatMarker(prompt("查看小队状态", "marker-chat"));
});

test("activation persists across prompts and independent handler processes", () => {
  active(prompt("$zcode-team-mode\n定位代码"));
  active(prompt("下一项任务继续"));
  const record = JSON.parse(fs.readFileSync(filesFor(opts.stateDir, "chat-A").state, "utf8"));
  assert.equal(record.mode, "active");
  assert.equal(record.sessionId, "chat-A");
  plain(run({ hookEventName: "Stop", sessionId: "chat-A" }, opts));
  active(prompt("查看 ZCode 小队状态"));
});

test("active mode denies only the broad builtins and omitted role through Agent/Task", () => {
  for (const tool of ["Agent", "Task"]) {
    for (const role of ["general-purpose", "Explore", undefined, "EXPLORE", "General-Purpose"]) {
      assert.ok(denied(agent(role, "chat-A", tool)), tool + ":" + role);
    }
  }
});

test("team roles and specialized dispatch agents pass in active mode, never auto-approving", () => {
  for (const role of [...ROLES, "documents:visual-judge", "pdf:visual-judge", "presentations:visual-judge", "spreadsheets:visual-judge", "image-generator"]) {
    for (const tool of ["Agent", "Task"]) plain(agent(role, "chat-A", tool));
  }
  plain(skill("zcode-team-mode"));
  plain(skill("officecli"));
  plain(run({ hook_event_name: "PreToolUse", session_id: "chat-A", tool_name: "Bash", tool_input: { command: "echo test" } }, opts));
});

test("separate chats have independent state", () => {
  plain(prompt("普通任务", "chat-B"));
  plain(agent("Explore", "chat-B"));
  assert.ok(denied(agent("team-explorer", "chat-B")));
  active(prompt("开启 ZCode 小队模式", "chat-C"));
});

test("explicit exit restores original routing only for that chat", () => {
  inactive(prompt("退出 ZCode 小队模式\n继续普通任务"));
  for (const role of ["Explore", "general-purpose", "image-generator", undefined]) plain(agent(role));
  for (const role of ROLES) assert.ok(denied(agent(role)));
  assert.ok(denied(skill("zcode-team-mode")));
  active(prompt("继续", "chat-C"));
  plain(prompt("继续", "chat-A"));
});

test("state survives a new Node process using stdin and Windows user home", () => {
  const home = path.join(base, "home");
  fs.mkdirSync(home, { recursive: true });
  const hook = path.resolve(__dirname, "../skill/scripts/team-mode-hook.cjs");
  const call = data => {
    const env = { ...process.env, USERPROFILE: home, HOME: home };
    delete env.ZCODE_SESSION_ID;
    const child = spawnSync(process.execPath, [hook], { input: JSON.stringify(data), encoding: "utf8", env });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const user = { hook_event_name: "UserPromptSubmit", session_id: "process-chat" };
  assert.match(call({ ...user, prompt: "$zcode-team-mode" }).hookSpecificOutput.additionalContext, /active/);
  assert.equal(call({ hook_event_name: "PreToolUse", session_id: "process-chat", tool_name: "Task", tool_input: {} }).hookSpecificOutput.permissionDecision, "deny");
  assert.match(call({ ...user, prompt: "退出 ZCode 小队模式" }).hookSpecificOutput.additionalContext, /inactive/);
  assert.deepEqual(call({ hook_event_name: "PreToolUse", session_id: "process-chat", tool_name: "Agent", tool_input: {} }), {});
});

test("corrupted state denies delegation, other sessions stay normal, explicit exit repairs", () => {
  const file = filesFor(opts.stateDir, "corrupt-chat").state;
  fs.writeFileSync(file, "{broken", "utf8");
  assert.ok(denied(agent("Explore", "corrupt-chat")));
  assert.equal(prompt("继续", "corrupt-chat").exitCode, 2);
  plain(agent("Explore", "chat-B"));
  inactive(prompt("退出 ZCode 小队模式", "corrupt-chat"));
  plain(agent("Explore", "corrupt-chat"));
});

test("missing, mismatched and forged session state are not silently accepted", () => {
  assert.ok(denied(run({ hookEventName: "PreToolUse", toolName: "Agent", toolInput: {} }, opts)));
  assert.ok(denied(run({ hookEventName: "PreToolUse", sessionId: "chat-A", toolName: "Agent", toolInput: {} }, { ...opts, env: { ZCODE_SESSION_ID: "other" } })));
  const file = filesFor(opts.stateDir, "forged").state;
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, sessionId: "other", mode: "inactive" }), "utf8");
  assert.ok(denied(agent("Explore", "forged")));
});

test("camelCase input and Skill name compatibility work", () => {
  const r = run({ hookEventName: "PreToolUse", sessionId: "chat-C", toolName: "Agent", toolInput: { subagent_type: "Explore" } }, opts);
  assert.ok(denied(r));
  plain(run({ hookEventName: "PreToolUse", sessionId: "chat-C", toolName: "Skill", toolInput: { name: "zcode-team-mode" } }, opts));
});

test("audit never includes user prompt or delegated task text", () => {
  active(prompt("$zcode-team-mode\nSENSITIVE_PROMPT_ABC", "privacy-chat"));
  run({ hook_event_name: "PreToolUse", session_id: "privacy-chat", tool_name: "Agent", tool_input: { subagent_type: "Explore", prompt: "SENSITIVE_TASK_XYZ" } }, opts);
  const log = fs.readFileSync(filesFor(opts.stateDir, "privacy-chat").audit, "utf8");
  assert.doesNotMatch(log, /SENSITIVE_/);
  for (const line of log.trim().split("\n")) assert.ok(JSON.parse(line).event);
});

test("unrecognized prompts leave structured diagnostics without prompt text", () => {
  const diagFile = filesFor(opts.stateDir, "diag-chat").diag;
  prompt("关于小队模式的说明 SENSITIVE_UNRECOG_XYZ", "diag-chat");
  assert.ok(fs.existsSync(diagFile));
  const diag = fs.readFileSync(diagFile, "utf8");
  const record = JSON.parse(diag.trim().split("\n").pop());
  assert.equal(record.event, "unrecognized-prompt");
  assert.equal(record.mentionsTeamWords, true);
  assert.doesNotMatch(diag, /SENSITIVE_UNRECOG_XYZ/);
  fs.rmSync(diagFile);
  active(prompt("开启小队模式", "diag-chat"));
  assert.equal(fs.existsSync(diagFile), false);
});
