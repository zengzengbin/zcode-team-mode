"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const SKILL = "zcode-team-mode";
const ROLES = Object.freeze([
  "team-explorer", "team-executor", "team-reviewer", "team-expert-advisor"
]);
// Active mode restricts only the broad built-ins; the team roles and specialized dispatch
// agents (document/browser visual judges, image-generator, plugin agents) stay usable.
const RESTRICTED = Object.freeze(["general-purpose", "explore"]);
// Only the turn that actually activates the mode asks for the one-time marker; persistent
// turns state explicitly that it was already shown, so it is not repeated after compaction.
const ACTIVE_RULES = "ZCODE_TEAM_MODE=active。当前聊天已启用 ZCode 小队模式，持续到用户明确退出。加载 zcode-team-mode 技能；子 Agent 派发只禁止内置 general-purpose/Explore 和省略类型，四个 team-* 专用角色与文档/浏览器类专用 agent（如各 *-visual-judge、image-generator）等照常按需派发。只有主 Agent 派发。team-* 模型和强度固定，不自动换模或降级。任务完成不会退出；其他普通技能仍可使用。";
// The persistent context names the marker without spelling it out, so a reply that echoes
// the hook context back can never be mistaken for the required one-time marker line.
const ACTIVE_FIRST = ACTIVE_RULES + " 本条回复需先输出一行「👾 已开启小队模式」再继续处理任务。";
const ACTIVE_CONTEXT = ACTIVE_RULES + " 小队模式此前已开启，本条回复不得再输出开启标记行。";
const INACTIVE_FIRST = "ZCODE_TEAM_MODE=inactive。当前聊天已退出小队模式，恢复原有派发行为；先前加载的小队技能不再限制内置 Agent。四个 team-* 专用角色只在小队启用后使用。本条回复需先输出一行「👾 已关闭小队模式」再继续处理任务。";
const INACTIVE_CONTEXT = "ZCODE_TEAM_MODE=inactive。当前聊天未启用或已退出小队模式，恢复原有派发行为；先前加载的小队技能不再限制内置 Agent。四个 team-* 专用角色只在小队启用后使用。";

// ZCode renders a skill the user picked from the `$` completion menu as a Markdown link to
// that skill's SKILL.md (Windows path backslashes escaped), and the rest of that line may
// hold further skill links and task text. Picking this skill is an explicit user command,
// so accept it like the plain token; only a run of links leading a line counts, while a
// link quoted mid-sentence after ordinary text still does not.
const LEADING_TEAM_LINK = /^(?:\s*\[[^\]]*\]\(\s*[^)]*\))*\s*\[[^\]]*zcode-team-mode[^\]]*\]\(\s*[^)]*zcode-team-mode[^)]*\)/iu;

// Commands are matched on any standalone line (code fences skipped) after dropping BOM,
// case and half/full-width spaces, so 查看小队模式 == 查看 ZCode 小队状态. Only an exact
// full-line match counts, so a line that merely asks about a command still does nothing.
function commandFromLine(line) {
  const compact = line.trim().replace(/[\s\u3000]+/gu, "").toLowerCase();
  if (/^(退出|关闭)(zcode)?小队模式$/u.test(compact)) return "off";
  if (/^(查看|查询)(zcode)?小队(模式状态|模式|状态)$/u.test(compact)) return "status";
  if (/^(开启|打开|启动)(zcode)?小队模式$/u.test(compact)) return "on";
  if (compact === "$zcode-team-mode" || compact === "使用$zcode-team-mode") return "on";
  if (LEADING_TEAM_LINK.test(line)) return "on";
  return null;
}

function commandFromPrompt(prompt) {
  if (typeof prompt !== "string") return null;
  let fenced = false;
  for (const line of prompt.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    if (/^\s*(?:```|~~~)/u.test(line)) fenced = !fenced;
    if (fenced) continue;
    const command = commandFromLine(line);
    if (command) return command;
  }
  return null;
}

// Diagnostic summary of prompts that look team-related but matched no command: structured
// shape only, never prompt text, so the recognizer can be checked against what the runner
// actually submits. Unrelated chat never touches the disk.
const DIAG_LIMIT = 1 << 20;
function recordUnrecognized(file, prompt) {
  if (!/zcode-team-mode|小队/u.test(prompt)) return;
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > DIAG_LIMIT) return;
    const lines = prompt.split(/\r?\n/u);
    const first = (lines[0] ?? "").trim();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({
      time: new Date().toISOString(), event: "unrecognized-prompt",
      promptLength: prompt.length, lineCount: lines.length,
      firstLineSha8: crypto.createHash("sha256").update(first).digest("hex").slice(0, 8),
      firstStartsWithLink: LEADING_TEAM_LINK.test(first),
      firstIsPlainCommand: commandFromLine(first) !== null,
      mentionsTeamSkill: /zcode-team-mode/u.test(prompt),
      mentionsTeamWords: /小队/u.test(prompt),
    }) + "\n", "utf8");
  } catch { /* diagnostics must never break command handling */ }
}

function context(text) {
  return { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } };
}
function deny(message) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: message } };
}
function sessionId(input, env) {
  const a = input.session_id ?? input.sessionId;
  const b = env.ZCODE_SESSION_ID;
  if (typeof a === "string" && a && b && a !== b) throw new Error("SESSION_ID_MISMATCH");
  const id = a ?? b;
  if (typeof id !== "string" || !id) throw new Error("SESSION_ID_MISSING");
  return id;
}
function filesFor(root, id) {
  const stem = crypto.createHash("sha256").update(id).digest("hex");
  return { state: path.join(root, stem + ".json"), audit: path.join(root, stem + ".events.jsonl"), diag: path.join(root, stem + ".diagnostics.jsonl") };
}
function readMode(file, id) {
  let data;
  try { data = fs.readFileSync(file, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return "inactive"; throw new Error("STATE_READ_FAILED"); }
  let record;
  try { record = JSON.parse(data); } catch { throw new Error("STATE_INVALID"); }
  if (record.schemaVersion !== 1 || record.sessionId !== id || !["active", "inactive"].includes(record.mode)) {
    throw new Error("STATE_INVALID");
  }
  return record.mode;
}
function setMode(file, id, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, sessionId: id, mode, updatedAt: new Date().toISOString() }) + "\n", { encoding: "utf8", flag: "wx" });
    fs.renameSync(tmp, file);
  } finally {
    // This is only the uniquely named temporary file created by this invocation.
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
function audit(file, event, role) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), event, ...(role ? { role } : {}) }) + "\n", "utf8");
}
function isTeamSkill(tool, args) {
  return tool === "Skill" && (args.skill ?? args.name) === SKILL;
}

function run(input, options = {}) {
  const root = options.stateDir ?? path.join(os.homedir(), ".zcode", "cli", "team-mode", "sessions");
  const env = options.env ?? process.env;
  const event = input.hook_event_name ?? input.hookEventName;
  const tool = input.tool_name ?? input.toolName;
  const args = input.tool_input ?? input.toolInput ?? {};
  const isAgent = tool === "Agent" || tool === "Task";
  const guardedSkill = isTeamSkill(tool, args);
  const result = output => ({ output, exitCode: 0, stderr: "" });
  if (event !== "UserPromptSubmit" && event !== "PreToolUse") return result({});
  if (event === "PreToolUse" && !isAgent && !guardedSkill) return result({});
  const command = event === "UserPromptSubmit" ? commandFromPrompt(input.prompt) : null;
  try {
    const id = sessionId(input, env);
    const files = filesFor(root, id);
    if (command === "on" || command === "off") {
      const mode = command === "on" ? "active" : "inactive";
      setMode(files.state, id, mode);
      audit(files.audit, command === "on" ? "activated" : "deactivated");
      return result(context(command === "on" ? ACTIVE_FIRST : INACTIVE_FIRST));
    }
    const mode = readMode(files.state, id);
    if (event === "UserPromptSubmit") {
      if (command === null) recordUnrecognized(files.diag, input.prompt);
      return result(mode === "active" ? context(ACTIVE_CONTEXT) : command === "status" ? context(INACTIVE_CONTEXT) : {});
    }
    if (guardedSkill) {
      return result(mode === "active" ? {} : deny("小队尚未由用户显式启用。不要自动加载本技能；请用户在消息中单独一行输入 $zcode-team-mode 或 开启小队模式（不必是第一行，单独放链接 $zcode-team-mode 也算）。其他技能和原有内置 Agent 不受此限制。"));
    }
    const role = typeof args.subagent_type === "string" && args.subagent_type ? args.subagent_type : "general-purpose";
    const norm = role.toLowerCase();
    const allowed = mode === "active" ? !RESTRICTED.includes(norm) : !ROLES.some(r => r.toLowerCase() === norm);
    if (mode === "active" || !allowed) audit(files.audit, allowed ? "agent-permitted" : "agent-denied", role);
    if (allowed) return result({}); // Never auto-approve/bypass the host's existing tool permissions.
    return result(deny(mode === "active"
      ? "当前聊天小队模式只禁止内置 general-purpose、Explore 和省略类型的派发；请显式填写具体 subagent_type（team-* 角色、文档/浏览器类 *-visual-judge、image-generator 等专用 agent 均可），不要绕过限制。"
      : "此 team-* 角色仅供用户显式启用小队模式后使用。当前聊天未启用；原有内置角色可照常使用。"));
  } catch (e) {
    const code = /^[A-Z_]+$/u.test(e.message ?? "") ? e.message : "STATE_IO_FAILED";
    const message = "ZCode 小队 hook 未能确认会话状态（" + code + "）。本次相关派发未获许可；报告故障，不换用内置角色或其他入口绕过。用户可用首行 退出小队模式 重置本聊天状态。";
    return event === "PreToolUse" ? result(deny(message)) : { output: {}, exitCode: 2, stderr: message };
  }
}

if (require.main === module) {
  let response;
  try { response = run(JSON.parse(fs.readFileSync(0, "utf8"))); }
  catch { response = { output: {}, exitCode: 2, stderr: "ZCode 小队 hook 输入无效；未执行状态切换。" }; }
  process.stdout.write(JSON.stringify(response.output) + "\n");
  if (response.stderr) process.stderr.write(response.stderr + "\n");
  process.exitCode = response.exitCode;
}
module.exports = { run, commandFromPrompt, filesFor, ROLES, RESTRICTED, SKILL };
