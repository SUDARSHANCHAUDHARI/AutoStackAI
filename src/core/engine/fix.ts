import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { analyzeCode, suggestFix } from "../ai/openai.js";

const SCANNABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte", ".py"];

const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".next", ".nuxt", "__pycache__", ".ai"];

interface Issue {
  line: number | null;
  severity: "error" | "warning" | "suggestion";
  message: string;
  fix: string;
}

interface FileIssues {
  file: string;
  issues: Issue[];
}

export async function runFix(autoApply: boolean): Promise<void> {
  const cwd = process.cwd();
  const files = await getProjectFiles(cwd);

  if (files.length === 0) {
    console.log(chalk.yellow("⚠️  No scannable files found."));
    return;
  }

  console.log(chalk.cyan(`📂 Scanning ${files.length} files...\n`));

  const allIssues: FileIssues[] = [];

  // Analyze each file (limit to first 10 for cost control)
  const filesToScan = files.slice(0, 10);

  for (const filePath of filesToScan) {
    const relativePath = path.relative(cwd, filePath);
    process.stdout.write(chalk.gray(`  Analyzing ${relativePath}... `));

    try {
      const code = await fs.readFile(filePath, "utf-8");

      if (code.trim().length === 0) {
        console.log(chalk.gray("empty, skipping"));
        continue;
      }

      const resultJson = await analyzeCode(code, `File: ${relativePath}`);
      const issues: Issue[] = JSON.parse(resultJson);

      if (issues.length > 0) {
        allIssues.push({ file: relativePath, issues });
        console.log(chalk.red(`${issues.length} issue(s)`));
      } else {
        console.log(chalk.green("✓ clean"));
      }
    } catch (error) {
      console.log(chalk.yellow("failed to analyze"));
    }
  }

  if (allIssues.length === 0) {
    console.log(chalk.green("\n✅ No issues found! Your code looks clean."));
    return;
  }

  // Report issues
  console.log(chalk.yellow(`\n🔍 Found issues in ${allIssues.length} file(s):\n`));

  for (const { file, issues } of allIssues) {
    console.log(chalk.bold.white(`📄 ${file}`));

    for (const issue of issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "💡";
      const color = issue.severity === "error" ? chalk.red : issue.severity === "warning" ? chalk.yellow : chalk.cyan;
      const lineStr = issue.line ? `:${issue.line}` : "";
      console.log(`  ${icon} ${color(issue.message)} ${chalk.gray(lineStr)}`);
      if (issue.fix) {
        console.log(chalk.gray(`     Fix: ${issue.fix}`));
      }
    }
    console.log();
  }

  // Auto-apply if requested
  if (autoApply) {
    await applyFixes(allIssues, cwd);
  } else {
    console.log(chalk.gray("Run with --apply to auto-fix issues.\n"));
  }

  // Save fix report
  const reportPath = path.join(cwd, ".ai", "fix-report.json");
  await fs.ensureDir(path.join(cwd, ".ai"));
  await fs.writeJson(reportPath, {
    timestamp: new Date().toISOString(),
    totalFiles: filesToScan.length,
    filesWithIssues: allIssues.length,
    issues: allIssues,
  }, { spaces: 2 });

  console.log(chalk.gray(`Report saved → .ai/fix-report.json`));
}

async function applyFixes(allIssues: FileIssues[], cwd: string): Promise<void> {
  console.log(chalk.yellow("\n🔧 Applying fixes...\n"));

  for (const { file, issues } of allIssues) {
    const filePath = path.join(cwd, file);
    let code = await fs.readFile(filePath, "utf-8");

    for (const issue of issues) {
      if (issue.severity === "error" || issue.severity === "warning") {
        try {
          const fixed = await suggestFix(code, issue.message);
          if (fixed && fixed.trim().length > 0) {
            code = fixed;
            console.log(chalk.green(`  ✓ Fixed: ${issue.message.slice(0, 60)}`));
          }
        } catch {
          console.log(chalk.yellow(`  ⚠️  Skipped: ${issue.message.slice(0, 60)}`));
        }
      }
    }

    // Backup original
    await fs.writeFile(`${filePath}.backup`, await fs.readFile(filePath), "utf-8");
    await fs.writeFile(filePath, code, "utf-8");
  }

  console.log(chalk.green("\n✅ Fixes applied. Originals backed up as .backup files."));
}

async function getProjectFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SCANNABLE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(cwd);
  return files;
}
