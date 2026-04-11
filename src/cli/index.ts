#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { detectStack } from "../core/detector/detect.js";
import { installSkills } from "../core/installer/install.js";
import { runBuild } from "../core/engine/engine.js";
import { runFix } from "../core/engine/fix.js";
import { runDevMode } from "../core/engine/dev.js";

const program = new Command();

console.log(chalk.bold.cyan("\n⚡ AutoStack AI — AI-powered dev stack\n"));

program
  .name("autostack-ai")
  .description("One command. Full AI-powered dev stack.")
  .version("1.0.0");

program
  .command("init")
  .description("Auto-detect stack and install AI skills")
  .action(async () => {
    try {
      console.log(chalk.yellow("🔍 Detecting your project stack..."));
      const stack = await detectStack();

      console.log(chalk.green("✅ Stack detected:"));
      console.log(chalk.white(JSON.stringify(stack, null, 2)));

      console.log(chalk.yellow("\n📦 Installing AI skills..."));
      await installSkills(stack);

      console.log(chalk.green.bold("\n🚀 AutoStack AI is ready!"));
      console.log(chalk.white("Run `autostack-ai build \"<feature>\"` to generate code.\n"));
    } catch (error) {
      console.error(chalk.red("❌ Init failed:"), error);
      process.exit(1);
    }
  });

program
  .command("install <skill>")
  .description("Manually install a specific skill")
  .action(async (skill: string) => {
    try {
      console.log(chalk.yellow(`📦 Installing skill: ${skill}...`));
      await installSkills({ manual: skill, framework: "unknown", language: "unknown", styling: "unknown", backend: "none", database: "none" });
      console.log(chalk.green(`✅ Skill "${skill}" installed.`));
    } catch (error) {
      console.error(chalk.red("❌ Install failed:"), error);
      process.exit(1);
    }
  });

program
  .command("build <feature>")
  .description("Generate code for a feature using AI")
  .option("-o, --output <file>", "Output file name", "generated")
  .action(async (feature: string, options: { output: string }) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red("❌ OPENAI_API_KEY not set. Add it to your .env file."));
        process.exit(1);
      }
      console.log(chalk.yellow(`🤖 Building: "${feature}"...`));
      await runBuild(feature, options.output);
      console.log(chalk.green(`✅ Code generated → ${options.output}`));
    } catch (error) {
      console.error(chalk.red("❌ Build failed:"), error);
      process.exit(1);
    }
  });

program
  .command("fix")
  .description("Scan project and AI-suggest fixes")
  .option("-a, --apply", "Auto-apply fixes", false)
  .action(async (options: { apply: boolean }) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red("❌ OPENAI_API_KEY not set. Add it to your .env file."));
        process.exit(1);
      }
      console.log(chalk.yellow("🔧 Scanning project for issues..."));
      await runFix(options.apply);
    } catch (error) {
      console.error(chalk.red("❌ Fix failed:"), error);
      process.exit(1);
    }
  });

program
  .command("dev")
  .description("Watch mode — AI suggestions as you code")
  .action(async () => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.error(chalk.red("❌ OPENAI_API_KEY not set. Add it to your .env file."));
        process.exit(1);
      }
      console.log(chalk.cyan("👁️  Entering dev watch mode. Ctrl+C to exit.\n"));
      await runDevMode();
    } catch (error) {
      console.error(chalk.red("❌ Dev mode failed:"), error);
      process.exit(1);
    }
  });

program.parse();
