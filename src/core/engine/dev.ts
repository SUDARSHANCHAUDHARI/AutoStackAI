import fs from "fs";
import path from "path";
import chalk from "chalk";
import { analyzeCode } from "../ai/openai.js";

const WATCH_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".vue", ".svelte"];
const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".ai"];
const DEBOUNCE_MS = 1500;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function runDevMode(): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.cyan("👁️  Watching for file changes...\n"));
  console.log(chalk.gray("Extensions: " + WATCH_EXTENSIONS.join(", ")));
  console.log(chalk.gray("─".repeat(50) + "\n"));

  const watcher = fs.watch(cwd, { recursive: true }, (event, filename) => {
    if (!filename) return;

    const ext = path.extname(filename);
    if (!WATCH_EXTENSIONS.includes(ext)) return;

    // Skip ignored directories
    const parts = filename.split(path.sep);
    if (parts.some((p) => IGNORE_DIRS.includes(p))) return;

    const fullPath = path.join(cwd, filename);

    // Debounce — avoid firing multiple times for same save
    const existing = timers.get(filename);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      timers.delete(filename);
      onFileChanged(fullPath, filename);
    }, DEBOUNCE_MS);

    timers.set(filename, timer);
  });

  // Keep process alive
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\n👋 Dev mode stopped."));
    watcher.close();
    process.exit(0);
  });

  await new Promise(() => {}); // run forever until Ctrl+C
}

async function onFileChanged(fullPath: string, relativePath: string): Promise<void> {
  if (!fs.existsSync(fullPath)) return;

  let code: string;
  try {
    code = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return;
  }

  if (code.trim().length === 0) return;

  console.log(chalk.yellow(`\n📝 Changed: ${relativePath}`));
  console.log(chalk.gray("   Analyzing with AI..."));

  try {
    const resultJson = await analyzeCode(code, `File: ${relativePath}`);
    const issues = JSON.parse(resultJson);

    if (!Array.isArray(issues) || issues.length === 0) {
      console.log(chalk.green("   ✓ Looks good!"));
      return;
    }

    // Show top 3 issues max to avoid noise
    const top = issues.slice(0, 3);
    for (const issue of top) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "💡";
      const color = issue.severity === "error" ? chalk.red : issue.severity === "warning" ? chalk.yellow : chalk.cyan;
      console.log(`   ${icon} ${color(issue.message)}`);
      if (issue.fix) {
        console.log(chalk.gray(`      → ${issue.fix}`));
      }
    }

    if (issues.length > 3) {
      console.log(chalk.gray(`   ... and ${issues.length - 3} more. Run \`autostack-ai fix\` for full report.`));
    }
  } catch {
    console.log(chalk.gray("   Analysis unavailable."));
  }
}
