import fs from "fs";
import path from "path";

export interface StackInfo {
  framework: string;
  language: string;
  styling: string;
  backend: string;
  database: string;
  manual?: string;
}

export async function detectStack(): Promise<StackInfo> {
  const cwd = process.cwd();

  const pkgPath = path.join(cwd, "package.json");
  const requirementsTxt = path.join(cwd, "requirements.txt");
  const pubspecYaml = path.join(cwd, "pubspec.yaml");
  const composerJson = path.join(cwd, "composer.json");

  let framework = "unknown";
  let language = "unknown";
  let styling = "none";
  let backend = "none";
  let database = "none";

  // Python project
  if (fs.existsSync(requirementsTxt)) {
    language = "python";
    const reqs = fs.readFileSync(requirementsTxt, "utf-8");
    if (reqs.includes("django")) framework = "django";
    else if (reqs.includes("flask")) framework = "flask";
    else if (reqs.includes("fastapi")) framework = "fastapi";
    else framework = "python-generic";
    return { framework, language, styling, backend, database };
  }

  // Flutter / Dart project
  if (fs.existsSync(pubspecYaml)) {
    language = "dart";
    framework = "flutter";
    return { framework, language, styling, backend, database };
  }

  // PHP project
  if (fs.existsSync(composerJson)) {
    language = "php";
    const composer = JSON.parse(fs.readFileSync(composerJson, "utf-8"));
    const deps = { ...composer.require, ...composer["require-dev"] };
    if (deps["laravel/framework"]) framework = "laravel";
    return { framework, language, styling, backend, database };
  }

  // Node.js / JavaScript / TypeScript project
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const deps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Language detection
    language = deps["typescript"] || deps["@types/node"] ? "typescript" : "javascript";

    // Framework detection (order matters — most specific first)
    if (deps["next"]) framework = "nextjs";
    else if (deps["gatsby"]) framework = "gatsby";
    else if (deps["remix"]) framework = "remix";
    else if (deps["nuxt"] || deps["nuxt3"]) framework = "nuxt";
    else if (deps["@sveltejs/kit"]) framework = "sveltekit";
    else if (deps["svelte"]) framework = "svelte";
    else if (deps["vue"]) framework = "vue";
    else if (deps["react"]) framework = "react";
    else if (deps["express"]) framework = "express";
    else if (deps["fastify"]) framework = "fastify";
    else if (deps["hono"]) framework = "hono";
    else framework = "node";

    // Styling detection
    if (deps["tailwindcss"]) styling = "tailwind";
    else if (deps["@mui/material"]) styling = "mui";
    else if (deps["antd"]) styling = "antd";
    else if (deps["styled-components"]) styling = "styled-components";
    else styling = "css";

    // Backend detection
    if (deps["@supabase/supabase-js"]) backend = "supabase";
    else if (deps["firebase"]) backend = "firebase";
    else if (deps["@prisma/client"]) backend = "prisma";
    else if (deps["mongoose"]) backend = "mongoose";

    // Database detection
    if (deps["pg"] || deps["postgres"]) database = "postgresql";
    else if (deps["mysql2"]) database = "mysql";
    else if (deps["mongoose"]) database = "mongodb";
    else if (deps["better-sqlite3"]) database = "sqlite";
    else if (deps["@prisma/client"]) database = "prisma";

    return { framework, language, styling, backend, database };
  }

  // Kotlin/Android project
  const buildGradle = path.join(cwd, "build.gradle.kts");
  const buildGradleGroovy = path.join(cwd, "build.gradle");
  if (fs.existsSync(buildGradle) || fs.existsSync(buildGradleGroovy)) {
    return { framework: "android", language: "kotlin", styling: "compose", backend, database };
  }

  return { framework, language, styling, backend, database };
}
