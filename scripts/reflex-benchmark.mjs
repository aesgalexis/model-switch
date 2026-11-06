import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engineRoot, codexHome, installCodexIntegration } from "../src/reflex/codex-integration.js";
import { resolveWorkspace } from "../src/reflex/workspace.js";
import { summarizeReflexEvents } from "../src/reflex/stats.js";
import { REFLEX_RUNTIME } from "../src/reflex/runtime.js";
import { codexInvocation, isolatedEnvironment, runProcess } from "./lib/codex-process.mjs";

const hookPath = path.join(engineRoot, "src", "hooks", "reflex-hook.js");
const orientation = ["git rev-parse HEAD", "git branch --show-current", "git rev-parse --show-toplevel"];
const prompt = "Inspect this repository's orientation. Report the current branch and full HEAD commit. Use fresh provided facts if sufficient. Do not modify files or run tests.";

export function parseOptions(args) {
  const options = { live: false, pairs: 3, model: null, output: null, codex: null };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--live") options.live = true;
    else if (["--pairs", "--model", "--output", "--codex"].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag);
      options[flag.slice(2)] = flag === "--pairs" ? Number(value) : value;
    } else throw new Error("Unknown option: " + flag);
  }
  if (!Number.isInteger(options.pairs) || options.pairs < 1 || options.pairs > 30) throw new Error("--pairs must be between 1 and 30");
  if (options.live && !options.model) throw new Error("--live requires --model for reproducibility");
  return options;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}

export function compareSamples(samples, live) {
  const cohort = (mode) => samples.filter((sample) => sample.mode === mode);
  const summarize = (rows) => ({
    runs: rows.length,
    medianElapsedMs: median(rows.map((r) => r.elapsedMs)),
    medianHookProcessMs: median(rows.flatMap((r) => r.hookProcessMs)),
    toolCalls: rows.reduce((sum, r) => sum + r.toolCalls, 0),
    orientationOperations: rows.reduce((sum, r) => sum + r.orientationOperations, 0),
    confirmedReuse: rows.reduce((sum, r) => sum + r.actualReuse, 0),
    injectedFacts: rows.reduce((sum, r) => sum + r.injectedFacts, 0),
    hintBytes: rows.reduce((sum, r) => sum + r.hintBytes, 0),
    inputTokens: rows.every((r) => r.inputTokens != null) ? rows.reduce((sum, r) => sum + r.inputTokens, 0) : null,
    outputTokens: rows.every((r) => r.outputTokens != null) ? rows.reduce((sum, r) => sum + r.outputTokens, 0) : null,
  });
  const off = summarize(cohort("off")), inject = summarize(cohort("inject"));
  return { off, inject,
    observedToolCallDifference: live ? off.toolCalls - inject.toolCalls : null,
    estimatedChecksAvoided: null,
    note: live ? "Small paired fixture experiment; observed differences are not a causal savings estimate for normal sessions."
      : "Scripted hook mechanism only. Tool calls are fixed by the harness; no model, token, or outer-tool-call savings are inferred." };
}

export async function benchmark(options) {
  const storage = path.join(engineRoot, ".model-switch");
  await mkdir(storage, { recursive: true });
  const root = await mkdtemp(path.join(storage, "benchmark-"));
  const cwd = path.join(root, "fixture");
  const samples = [];
  let cliVersion = null;
  try {
    if (options.live) {
      const cli = codexInvocation(options.codex);
      const result = await runProcess(cli.executable, [...cli.prefix, "--version"]);
      if (result.code !== 0) throw new Error("Codex CLI version check failed");
      cliVersion = result.stdout.trim();
    }
    await mkdir(cwd);
    const git = async (args) => {
      const result = await runProcess("git", args, { cwd });
      if (result.code !== 0) throw new Error("Fixture git failed: " + result.stderr);
      return result.stdout;
    };
    await git(["init", "-b", "benchmark"]);
    await writeFile(path.join(cwd, "README.md"), "# Benchmark fixture\n");
    await git(["add", "README.md"]);
    await git(["-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.invalid", "commit", "-m", "Fixture"]);
    const values = await Promise.all(orientation.map((command) => git(command.split(" ").slice(1))));
    for (let pair = 0; pair < options.pairs; pair++) {
      // Alternate order to reduce systematic warmup/order bias.
      for (const mode of pair % 2 ? ["inject", "off"] : ["off", "inject"]) {
        const home = path.join(root, pair + "-" + mode);
        const data = path.join(home, "data");
        await mkdir(home);
        const env = isolatedEnvironment({ CODEX_HOME: home, MODEL_SWITCH_GLOBAL_HOME: data, MODEL_SWITCH_PROMPT_HINT_MODE: mode });
        const hookProcessMs = [];
        const invoke = async (input, measure = true) => {
          const result = await runProcess(process.execPath, [hookPath], { cwd, env, input: JSON.stringify(input) });
          if (result.code !== 0) throw new Error("Hook failed");
          if (measure) hookProcessMs.push(result.elapsedMs);
          return result.stdout ? JSON.parse(result.stdout) : null;
        };
        const session = "mechanism-" + pair;
        const toolEvent = (event, command, id, output) => ({ hook_event_name: event, tool_name: "Bash",
          tool_input: { command }, tool_response: { exit_code: 0, output }, session_id: session,
          turn_id: "measurement", tool_use_id: id, cwd });
        for (let i = 0; i < orientation.length; i++) {
          await invoke(toolEvent("PostToolUse", orientation[i], "seed-" + i, values[i]), false);
        }
        const workspace = resolveWorkspace(cwd, env);
        // Preserve warm evidence while excluding setup events from measured telemetry.
        await writeFile(workspace.events, "");
        let inputTokens = null, outputTokens = null, elapsedMs;
        if (options.live) {
          const auth = path.join(codexHome(), "auth.json");
          try { await copyFile(auth, path.join(home, "auth.json")); }
          catch { throw new Error("Live benchmark needs Codex signed in with a local auth.json"); }
          await writeFile(path.join(home, "config.toml"), process.platform === "win32" ? '[windows]\nsandbox = "elevated"\n' : "");
          await installCodexIntegration({ env });
          const cli = codexInvocation(options.codex);
          const result = await runProcess(cli.executable, [...cli.prefix, "exec", "--json", "--strict-config", "--ephemeral",
            "--sandbox", "workspace-write", "--dangerously-bypass-hook-trust", "-m", options.model, "-C", cwd, prompt], { cwd, env, timeoutMs: 120000 });
          if (result.code !== 0) throw new Error("Codex benchmark failed: " + result.stderr.slice(-1500));
          const events = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return {}; } });
          const completed = events.findLast((event) => event.type === "turn.completed");
          if (!completed) throw new Error("Codex did not complete the benchmark turn");
          inputTokens = completed.usage?.input_tokens ?? null;
          outputTokens = completed.usage?.output_tokens ?? null;
          const answers = events.filter((e) => e.type === "item.completed" && e.item?.type === "agent_message").map((e) => e.item.text).join("\n");
          if (!answers.includes(values[0].trim()) || !answers.includes("benchmark")) throw new Error("Benchmark answer omitted or misstated branch/HEAD: " + answers.slice(0,1000));
          if ((await git(["status", "--porcelain"])).trim()) throw new Error("Benchmark turn modified the fixture");
          elapsedMs = result.elapsedMs;
        } else {
          const start = performance.now();
          const hint = await invoke({ hook_event_name: "UserPromptSubmit", cwd, session_id: session, turn_id: "measurement", prompt });
          if ((mode === "inject") !== Boolean(hint?.hookSpecificOutput?.additionalContext)) throw new Error("Unexpected hint delivery");
          for (let i = 0; i < orientation.length; i++) {
            const rewrite = await invoke(toolEvent("PreToolUse", orientation[i], "repeat-" + i));
            const command = rewrite?.hookSpecificOutput?.updatedInput?.command ?? orientation[i];
            const shell = process.platform === "win32" ? "powershell.exe" : "sh";
            const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command];
            const result = await runProcess(shell, args, { cwd, env });
            if (result.code !== 0 || result.stdout.trim() !== values[i].trim()) throw new Error("Cached orientation output mismatch");
            await invoke(toolEvent("PostToolUse", command, "repeat-" + i, result.stdout));
          }
          elapsedMs = Math.round(performance.now() - start);
        }
        const events = (await readFile(workspace.events, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
        const stats = summarizeReflexEvents(events);
        if (stats.promptHints.userPromptsObserved !== 1) throw new Error("Expected one observed prompt; hooks may not be trusted");
        samples.push({ pair: pair + 1, mode, elapsedMs, hookProcessMs, inputTokens, outputTokens,
          toolCalls: stats.totalToolCalls,
          orientationOperations: events.filter((e) => e.event === "PreToolUse").flatMap((e) => e.operations ?? [])
            .filter((o) => ["git.head", "git.branch.current", "git.root"].includes(o.key)).length,
          actualReuse: stats.actualReuse, injectedFacts: stats.promptHints.factsInjected,
          hintBytes: events.reduce((sum, e) => sum + (e.hintBytes ?? 0), 0), answerVerified: true });
        process.stderr.write("Completed pair " + (pair + 1) + "/" + options.pairs + " " + mode + "\n");
      }
    }
    return { schema: 1, kind: options.live ? "live-cli-paired-fixture" : "hook-mechanism", createdAt: new Date().toISOString(),
      runtime: { engine: REFLEX_RUNTIME, codex: cliVersion, node: process.version, platform: process.platform, model: options.model },
      prompt, pairs: options.pairs, summary: compareSamples(samples, options.live), samples };
  } finally {
    const relative = path.relative(storage, root);
    if (!relative.startsWith("benchmark-") || relative.includes(path.sep)) throw new Error("Unsafe cleanup path");
    await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2));
    const report = await benchmark(options);
    const json = JSON.stringify(report, null, 2) + "\n";
    if (options.output) { await mkdir(path.dirname(path.resolve(options.output)), { recursive: true }); await writeFile(options.output, json); }
    process.stdout.write(json);
  } catch (error) { process.stderr.write("reflex:benchmark: " + error.message + "\n"); process.exitCode = 1; }
}
