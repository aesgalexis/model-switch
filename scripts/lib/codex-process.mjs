import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function codexInvocation(executable) {
  if (executable) return { executable, prefix: [] };
  if (process.platform === "win32") {
    for (const directory of (process.env.PATH || "").split(path.delimiter)) {
      const script = path.join(directory, "node_modules", "@openai", "codex", "bin", "codex.js");
      if (existsSync(script)) return { executable: process.execPath, prefix: [script] };
    }
  }
  return { executable: "codex", prefix: [] };
}

export function runProcess(executable, args, { timeoutMs = 60000, input, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(executable, args, { ...options, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`Process timed out after ${timeoutMs}ms`));
      resolve({ code, stdout, stderr, elapsedMs: Math.round(performance.now() - start) });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export function isolatedEnvironment(extra = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:CODEX_|MODEL_SWITCH_|TYPESAFE_|OPENAI_)/i.test(name)));
  return { ...inherited, MODEL_SWITCH_REFLEX_JEV_SHADOW: "off", ...extra };
}
