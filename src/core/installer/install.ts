import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import type { StackInfo } from "../detector/detect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve skills directory relative to package root (works after build)
const SKILLS_DIR = path.resolve(__dirname, "../../../skills");
const WORKFLOWS_DIR = path.resolve(__dirname, "../../../workflows");

const FRAMEWORK_SKILL_MAP: Record<string, string[]> = {
  nextjs: ["react-codegen", "api-agent", "nextjs-agent"],
  react: ["react-codegen", "api-agent"],
  vue: ["vue-codegen", "api-agent"],
  nuxt: ["vue-codegen", "api-agent"],
  sveltekit: ["api-agent"],
  svelte: ["api-agent"],
  express: ["api-agent", "node-agent"],
  fastify: ["api-agent", "node-agent"],
  hono: ["api-agent", "node-agent"],
  node: ["api-agent", "node-agent"],
  django: ["api-agent"],
  flask: ["api-agent"],
  fastapi: ["api-agent"],
  flutter: ["mobile-agent"],
  android: ["mobile-agent"],
  laravel: ["api-agent"],
  unknown: ["api-agent"],
};

export async function installSkills(stack: StackInfo): Promise<void> {
  const cwd = process.cwd();
  const aiDir = path.join(cwd, ".ai");

  // Create .ai directory structure
  await fs.ensureDir(path.join(aiDir, "agents"));
  await fs.ensureDir(path.join(aiDir, "prompts"));
  await fs.ensureDir(path.join(aiDir, "skills"));
  await fs.ensureDir(path.join(aiDir, "workflows"));

  // Write stack info
  await fs.writeJson(path.join(aiDir, "stack.json"), stack, { spaces: 2 });

  if (stack.manual) {
    await installSkill(stack.manual, aiDir);
    return;
  }

  const skillsToInstall = FRAMEWORK_SKILL_MAP[stack.framework] ?? ["api-agent"];

  for (const skillName of skillsToInstall) {
    await installSkill(skillName, aiDir);
  }

  // Install default workflow
  await installWorkflow("default", aiDir);

  // Write stack-specific agent config
  await writeAgentConfig(stack, aiDir);

  console.log(chalk.green(`\n✅ Installed ${skillsToInstall.length} skill(s) for ${stack.framework}`));
  console.log(chalk.gray(`   Location: ${aiDir}\n`));
}

async function installSkill(skillName: string, aiDir: string): Promise<void> {
  const skillSrc = path.join(SKILLS_DIR, skillName);
  const skillDest = path.join(aiDir, "skills", skillName);

  if (!await fs.pathExists(skillSrc)) {
    console.log(chalk.yellow(`⚠️  Skill "${skillName}" not found, skipping.`));
    return;
  }

  await fs.copy(skillSrc, skillDest, { overwrite: true });
  console.log(chalk.green(`   ✓ ${skillName}`));
}

async function installWorkflow(workflowName: string, aiDir: string): Promise<void> {
  const workflowSrc = path.join(WORKFLOWS_DIR, `${workflowName}.json`);
  const workflowDest = path.join(aiDir, "workflows", `${workflowName}.json`);

  if (!await fs.pathExists(workflowSrc)) return;

  await fs.copy(workflowSrc, workflowDest, { overwrite: true });
}

async function writeAgentConfig(stack: StackInfo, aiDir: string): Promise<void> {
  const config = {
    version: "1.0.0",
    stack,
    agents: {
      codegen: {
        skill: `${stack.framework === "unknown" ? "api-agent" : FRAMEWORK_SKILL_MAP[stack.framework]?.[0] ?? "api-agent"}`,
        model: "gpt-4o",
        temperature: 0.3,
      },
      fix: {
        model: "gpt-4o-mini",
        temperature: 0.1,
      },
    },
    createdAt: new Date().toISOString(),
  };

  await fs.writeJson(path.join(aiDir, "config.json"), config, { spaces: 2 });
}
