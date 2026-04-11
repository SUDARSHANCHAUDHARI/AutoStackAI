import OpenAI from "openai";
import chalk from "chalk";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export interface GenerateOptions {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  maxTokens?: number;
}

export async function generateCode(
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const client = getClient();

  const {
    model = "gpt-4o",
    temperature = 0.3,
    systemPrompt = "You are an expert software engineer. Return only clean, production-ready code. No markdown fences. No explanation.",
    maxTokens = 4096,
  } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateWithStream(
  userPrompt: string,
  onChunk: (chunk: string) => void,
  options: GenerateOptions = {}
): Promise<string> {
  const client = getClient();

  const {
    model = "gpt-4o",
    temperature = 0.3,
    systemPrompt = "You are an expert software engineer. Return only clean, production-ready code. No markdown fences. No explanation.",
  } = options;

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    stream: true,
  });

  let fullContent = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      onChunk(delta);
      fullContent += delta;
    }
  }

  return fullContent;
}

export async function analyzeCode(
  code: string,
  context: string = ""
): Promise<string> {
  const systemPrompt = `You are a senior code reviewer. Analyze the provided code and return a JSON array of issues found.
Each issue should have: { "line": number | null, "severity": "error"|"warning"|"suggestion", "message": string, "fix": string }
Return ONLY valid JSON. No explanation.`;

  const userPrompt = `${context ? `Context: ${context}\n\n` : ""}Code to analyze:\n\n${code}`;

  const result = await generateCode(userPrompt, { systemPrompt, model: "gpt-4o-mini", temperature: 0.1 });

  try {
    JSON.parse(result);
    return result;
  } catch {
    // Wrap in array if raw text returned
    return JSON.stringify([{ line: null, severity: "suggestion", message: result, fix: "" }]);
  }
}

export async function suggestFix(
  code: string,
  issue: string
): Promise<string> {
  const prompt = `Fix the following issue in this code.
Issue: ${issue}

Code:
${code}

Return the fixed code only. No explanation.`;

  return generateCode(prompt, { model: "gpt-4o-mini", temperature: 0.1 });
}
