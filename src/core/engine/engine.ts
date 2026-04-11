import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { generateWithStream } from "../ai/openai.js";
import { detectStack } from "../detector/detect.js";

interface AgentConfig {
  version: string;
  stack: {
    framework: string;
    language: string;
    styling: string;
    backend: string;
    database: string;
  };
  agents: {
    codegen: {
      skill: string;
      model: string;
      temperature: number;
    };
  };
}

export async function runBuild(feature: string, outputName: string): Promise<void> {
  const cwd = process.cwd();
  const aiDir = path.join(cwd, ".ai");
  const configPath = path.join(aiDir, "config.json");

  // Load installed config or detect fresh
  let stack: AgentConfig["stack"];
  let skillName = "api-agent";

  if (await fs.pathExists(configPath)) {
    const config: AgentConfig = await fs.readJson(configPath);
    stack = config.stack;
    skillName = config.agents?.codegen?.skill ?? "api-agent";
  } else {
    console.log(chalk.yellow("⚠️  No .ai config found. Running `init` first is recommended."));
    stack = await detectStack();
  }

  // Load skill prompt
  const skillPromptPath = path.join(aiDir, "skills", skillName, "prompt.md");
  let basePrompt = "";

  if (await fs.pathExists(skillPromptPath)) {
    basePrompt = await fs.readFile(skillPromptPath, "utf-8");
  }

  // Build final prompt
  const fullPrompt = buildCodegenPrompt(feature, stack, basePrompt);

  console.log(chalk.cyan(`\n🤖 Generating: "${feature}"\n`));
  console.log(chalk.gray("─".repeat(50)));

  let generated = "";

  generated = await generateWithStream(
    fullPrompt,
    (chunk) => {
      process.stdout.write(chalk.white(chunk));
    },
    {
      model: "gpt-4o",
      temperature: 0.3,
    }
  );

  console.log("\n" + chalk.gray("─".repeat(50)));

  // Determine output extension
  const ext = getFileExtension(stack.framework, stack.language);
  const outputFile = outputName.includes(".") ? outputName : `${outputName}${ext}`;
  const outputPath = path.join(cwd, outputFile);

  await fs.writeFile(outputPath, generated, "utf-8");

  console.log(chalk.green(`\n✅ Saved to: ${outputFile}`));

  // Append to build log
  await appendBuildLog(cwd, feature, outputFile);
}

function buildCodegenPrompt(
  feature: string,
  stack: AgentConfig["stack"],
  basePrompt: string
): string {
  return `${basePrompt ? basePrompt + "\n\n---\n\n" : ""}You are building a feature for a ${stack.framework} project.

Stack:
- Framework: ${stack.framework}
- Language: ${stack.language}
- Styling: ${stack.styling}
- Backend: ${stack.backend}
- Database: ${stack.database}

Feature to implement:
${feature}

Requirements:
- Write production-ready, complete code
- Follow best practices for ${stack.framework}
- Use ${stack.language} syntax
- Include error handling
- No placeholders or TODOs
- No markdown code fences in output`;
}

function getFileExtension(framework: string, language: string): string {
  if (framework === "flutter" || framework === "android") return ".dart";
  if (language === "typescript") {
    if (["react", "nextjs", "gatsby", "remix"].includes(framework)) return ".tsx";
    if (["vue", "nuxt"].includes(framework)) return ".vue";
    if (["svelte", "sveltekit"].includes(framework)) return ".svelte";
    return ".ts";
  }
  if (language === "python") return ".py";
  if (language === "php") return ".php";
  if (["react", "nextjs"].includes(framework)) return ".jsx";
  return ".js";
}

async function appendBuildLog(cwd: string, feature: string, outputFile: string): Promise<void> {
  const logPath = path.join(cwd, ".ai", "build-log.json");
  let log: Array<{ feature: string; output: string; timestamp: string }> = [];

  if (await fs.pathExists(logPath)) {
    log = await fs.readJson(logPath);
  }

  log.push({ feature, output: outputFile, timestamp: new Date().toISOString() });

  await fs.writeJson(logPath, log, { spaces: 2 });
}
