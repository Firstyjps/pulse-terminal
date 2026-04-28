#!/usr/bin/env node
// `pnpm ask <file>` — pipe a prompt file into `claude` (interactive).
// `pnpm ask:p <file>` — run `claude -p` (one-shot, non-interactive).
//
// Why: composing prompts in a real editor (Cursor/VS Code) is far easier
// than typing TH/EN-mixed text into a terminal. Save your draft in
// `_prompts/*.md`, then ship it with one of these.

import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const oneShot = args.includes("-p") || args.includes("--print");
const filePath = args.find((a) => !a.startsWith("-"));

if (!filePath) {
  console.error(`
Usage:
  pnpm ask <file>            interactive — Claude reads the file as the first prompt, then opens REPL
  pnpm ask:p <file>          one-shot — Claude prints the answer and exits

Examples:
  pnpm ask _prompts/cursor.md
  pnpm ask:p _prompts/scratchpad.md > answer.txt
`);
  process.exit(2);
}

const abs = resolve(filePath);
if (!existsSync(abs)) {
  console.error(`error: file not found: ${abs}`);
  process.exit(1);
}

let text;
try {
  text = await readFile(abs, "utf8");
} catch (err) {
  console.error("error: failed to read file —", err.message);
  process.exit(1);
}

// Strip a UTF-8 BOM if Notepad on Windows added one — Claude treats BOM
// as a literal character in the first token, which can derail parsing.
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

if (!text.trim()) {
  console.error("error: prompt file is empty");
  process.exit(1);
}

// Spawn claude with the prompt on stdin. `-p` for non-interactive print mode.
const claudeArgs = oneShot ? ["-p"] : [];
const child = spawn("claude", claudeArgs, {
  stdio: ["pipe", "inherit", "inherit"],
  shell: process.platform === "win32",  // `.cmd` shim on Windows needs shell
});

child.on("error", (err) => {
  console.error("error: failed to spawn `claude` —", err.message);
  console.error("hint: make sure Claude Code CLI is installed + on PATH");
  process.exit(1);
});

child.stdin.write(text);
child.stdin.end();

child.on("exit", (code) => process.exit(code ?? 0));
