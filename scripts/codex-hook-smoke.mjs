import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { engineRoot, installCodexIntegration } from "../src/reflex/codex-integration.js";
import { resolveWorkspace } from "../src/reflex/workspace.js";
import { codexInvocation, isolatedEnvironment } from "./lib/codex-process.mjs";

const executable = process.argv.slice(2).find((arg) => arg !== "--legacy");
const invocation = codexInvocation(executable);
const legacy = process.argv.includes("--legacy");
const storage = path.join(engineRoot, ".model-switch");
await mkdir(storage, { recursive: true });
const root = await mkdtemp(path.join(storage, "smoke-"));
const cwd = await mkdtemp(path.join(os.tmpdir(), "model-switch-outside-"));
const codexHome = path.join(root, "codex");
const dataHome = path.join(root, "data");
let requests = 0;
let selectedTool = null;
let sawGitVersion = false;
let server;
try {
  await mkdir(codexHome);
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    requests += 1;
    if (requests > 1) sawGitVersion ||= JSON.stringify(body.input).includes("git version");
    if (requests === 1) selectedTool = "exec_command";
    const toolInput = { cmd: "git --version", shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh", workdir: cwd };
    const item = requests === 1
      ? { type: "function_call", id: "fc_smoke", call_id: "call_smoke", name: selectedTool, arguments: JSON.stringify(toolInput), status: "completed" }
      : { type: "message", id: "msg_smoke", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK" }] };
    const result = {
      id: `resp_smoke_${requests}`, object: "response", created_at: Math.floor(Date.now() / 1000),
      status: "completed", model: body.model, output: [item],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    };
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    response.write(`event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { ...result, output: [], status: "in_progress" } })}\n\n`);
    response.write(`event: response.output_item.added\ndata: ${JSON.stringify({ type: "response.output_item.added", output_index: 0, item })}\n\n`);
    response.write(`event: response.output_item.done\ndata: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item })}\n\n`);
    response.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: result })}\n\n`);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const config = [
    'model = "gpt-6-astra"', 'model_provider = "smoke"', '', '[model_providers.smoke]',
    'name = "Local Smoke"', `base_url = "${baseUrl}"`, 'wire_api = "responses"',
    'env_key = "OPENAI_API_KEY"', 'supports_websockets = false', '',
    ...(process.platform === "win32" ? ['[windows]', 'sandbox = "elevated"', ''] : []),
  ].join("\n");
  await writeFile(path.join(codexHome, "config.toml"), config);
  await installCodexIntegration({ env: { CODEX_HOME: codexHome } });
  if (legacy) {
    const configFile = path.join(codexHome, "config.toml");
    const installed = await readFile(configFile, "utf8");
    await writeFile(configFile, installed.replaceAll("UserPromptSubmit", "user_prompt_submit")
      .replaceAll("PreToolUse", "pre_tool_use").replaceAll("PostToolUse", "post_tool_use"));
  }
  const env = isolatedEnvironment({ CODEX_HOME: codexHome, OPENAI_API_KEY: "smoke",
    MODEL_SWITCH_GLOBAL_HOME: dataHome });
  const child = spawn(invocation.executable, [...invocation.prefix, "exec", "--json", "--strict-config", "--skip-git-repo-check", "--ephemeral",
    "--sandbox", "workspace-write",
    "--dangerously-bypass-hook-trust", "-C", cwd,
    "Run git --version once, then reply OK."],
  { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  let timer;
  const exitCode = await Promise.race([
    new Promise((resolve, reject) => { child.on("close", resolve); child.on("error", reject); }),
    new Promise((_, reject) => { timer = setTimeout(() => { child.kill(); reject(new Error("Codex timed out")); }, 30000); }),
  ]).finally(() => clearTimeout(timer));
  const eventsFile = resolveWorkspace(cwd, env).events;
  const events = await readFile(eventsFile, "utf8").then((text) => text.trim().split(/\r?\n/).map(JSON.parse),
    (error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
  const names = events.map((event) => event.event);
  assert.equal(exitCode, 0, output);
  assert.equal(requests, 2, output);
  assert.ok(sawGitVersion, "Codex did not deliver a successful git --version result to the local endpoint: " + output);
  if (legacy) assert.deepEqual(names, [], `legacy names unexpectedly fired: ${names.join(", ")}`);
  else for (const name of ["UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
    assert.ok(names.includes(name), `${name} missing; events: ${names.join(", ")}; CLI: ${output}`);
  }
  if (!legacy) assert.ok(events.some((event) => event.event === "PreToolUse" && event.tool === "Bash" && event.command === "git --version"),
    `shell command input was not observed: ${JSON.stringify(events)}`);
  console.log(JSON.stringify({ codexExit: exitCode, cwd, requests, selectedTool, legacy, events: names }));
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  const relative = path.relative(storage, root);
  const outside = path.relative(os.tmpdir(), cwd);
  if (!relative.startsWith("smoke-") || relative.includes(path.sep) || !outside.startsWith("model-switch-outside-") || outside.includes(path.sep)) throw new Error("Unsafe cleanup path");
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  await rm(cwd, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
