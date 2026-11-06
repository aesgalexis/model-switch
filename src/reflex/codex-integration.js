import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const START = "# >>> model-switch global hooks >>>";
const END = "# <<< model-switch global hooks <<<";
const CREATED_TABLE = "# model-switch created this hooks table";
export const engineRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
export const engineScript = path.join(engineRoot, "src", "hooks", "reflex-hook.js");

export function codexHome(env = process.env) {
  return path.resolve(env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex"));
}

export function globalConfigPath(env = process.env) {
  return path.join(codexHome(env), "config.toml");
}

function tomlLiteral(value) { return JSON.stringify(value); }

export function managedHookBlock(root = engineRoot, includeTable = false) {
  const script = path.join(root, "src", "hooks", "reflex-hook.js");
  const envFile = path.join(root, ".env");
  const command = `node "--env-file-if-exists=${envFile}" "${script}"`;
  const hook = `{ type = "command", command = ${tomlLiteral(command)}, timeout = 5 }`;
  return [START,
    ...(includeTable ? [CREATED_TABLE, "[hooks]"] : []),
    `UserPromptSubmit = [{ hooks = [${hook}] }]`,
    `PreToolUse = [{ matcher = "^(Bash|apply_patch|Edit|Write)$", hooks = [${hook}] }]`,
    `PostToolUse = [{ matcher = "^(Bash|apply_patch|Edit|Write)$", hooks = [${hook}] }]`,
    END].join("\n");
}

export function removeManagedHooks(text) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const created = new RegExp(`\\r?\\n${escape(START)}\\r?\\n${escape(CREATED_TABLE)}[\\s\\S]*?${escape(END)}\\r?\\n`, "g");
  const existing = new RegExp(`(?:\\r?\\n|^)${escape(START)}[\\s\\S]*?${escape(END)}`, "g");
  return text.replace(created, "").replace(existing, "");
}

export function installIntoConfig(text, root = engineRoot) {
  if (inspectIntegration(text, root).installed) return text;
  const clean = removeManagedHooks(text || "");
  // Never create duplicate TOML keys or overwrite somebody else's lifecycle hooks.
  if (/^\s*(?:UserPromptSubmit|PreToolUse|PostToolUse)\s*=/m.test(clean) ||
      /^\s*\[\[?hooks\.(?:UserPromptSubmit|PreToolUse|PostToolUse)(?:\.|\])/m.test(clean)) {
    throw new Error("Existing lifecycle hooks in config.toml overlap model-switch. Move those hooks to ~/.codex/hooks.json before installing; Codex merges both sources.");
  }
  const block = managedHookBlock(root);
  const hooksHeader = /^[ \t]*\[hooks\][ \t]*(?:#[^\r\n]*)?\r?$/m;
  if (hooksHeader.test(clean)) return clean.replace(hooksHeader, (match) => `${match}\n${block}`);
  const childHeader = /^[ \t]*\[\[?hooks\./m;
  const created = `\n${managedHookBlock(root, true)}\n`;
  if (childHeader.test(clean)) return clean.replace(childHeader, `${created}$&`);
  return `${clean}${created}`;
}

export function inspectIntegration(text, root = engineRoot) {
  const occurrences = text.split(START).length - 1;
  const script = path.join(root, "src", "hooks", "reflex-hook.js");
  const normalized = text.replaceAll("\r\n", "\n");
  const installed = occurrences === 1 && (normalized.includes(managedHookBlock(root)) || normalized.includes(managedHookBlock(root, true)));
  const hasEngine = text.includes(script) || text.includes(script.replaceAll("\\", "\\\\"));
  return { installed, occurrences, outdated: occurrences === 1 && !installed && hasEngine,
    conflict: occurrences > 1 || (occurrences === 1 && !hasEngine) };
}

async function exists(filename) { try { await stat(filename); return true; } catch { return false; } }

async function atomicWrite(filename, content) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.model-switch-${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, filename);
}

export async function installCodexIntegration({ env = process.env, root = engineRoot, now = new Date() } = {}) {
  const script = path.join(root, "src", "hooks", "reflex-hook.js");
  if (!await exists(script)) throw new Error(`model-switch engine missing: ${script}`);
  const config = globalConfigPath(env);
  const original = await readFile(config, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error));
  const updated = installIntoConfig(original, root);
  if (updated === original) return { changed: false, config, backup: null, engine: script };
  let backup = null;
  if (original) {
    backup = `${config}.model-switch-backup-${now.toISOString().replace(/[:.]/g, "-")}`;
    await copyFile(config, backup);
  }
  await atomicWrite(config, updated);
  return { changed: true, config, backup, engine: script };
}

export async function uninstallCodexIntegration({ env = process.env } = {}) {
  const config = globalConfigPath(env);
  const original = await readFile(config, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error));
  const updated = removeManagedHooks(original);
  if (!original || updated === original) return { changed: false, config };
  await atomicWrite(config, updated);
  return { changed: true, config };
}
