// AIプロバイダー抽象化レイヤー。
// AI_PROVIDER=anthropic | openai を環境変数で切り替える。
// どちらも未設定ならnullを返し、呼び出し側がルールベースの
// フォールバックレポートを生成する(デモ・開発用)。

export interface JsonCompletionRequest {
  system: string;
  prompt: string;
  /** 出力を強制するJSON Schema(additionalProperties: false 必須) */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface AIProvider {
  readonly name: string;
  completeJson(req: JsonCompletionRequest): Promise<string>;
}

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";

  async completeJson(req: JsonCompletionRequest): Promise<string> {
    // 公式SDKを使用。structured outputs (output_config.format) でJSONを強制する。
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-opus-4-8",
      // adaptive thinking分も含むためJSON本文に対して余裕を持たせる
      max_tokens: req.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      system: req.system,
      output_config: {
        format: {
          type: "json_schema",
          schema: req.schema,
        },
      },
      messages: [{ role: "user", content: req.prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("AI provider refused the request");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("AI response was truncated (max_tokens)");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("AI response contained no text block");
    }
    return text.text;
  }
}

class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  async completeJson(req: JsonCompletionRequest): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        max_tokens: req.maxTokens ?? 8192,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "tactical_report", strict: true, schema: req.schema },
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI response contained no content");
    return content;
  }
}

export function getAIProvider(): AIProvider | null {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  return null;
}
