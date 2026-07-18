// LLM provider isolation. The rest of the pipeline only sees LlmClient, so
// swapping Anthropic for another provider (or a mock in tests) is one file.
import Anthropic from '@anthropic-ai/sdk';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmJsonRequest {
  system: string;
  user: string;
  /** JSON schema enforced via structured outputs (output_config.format). */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface LlmClient {
  readonly model: string;
  completeJson(req: LlmJsonRequest): Promise<{ json: unknown; usage: LlmUsage }>;
}

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(
    public readonly model: string,
    apiKey: string
  ) {
    // Explicit apiKey: the default env lookup doesn't exist in the Deno edge
    // runtime, so hosts pass the key in (edge: Deno.env, eval/CLI: process.env).
    this.client = new Anthropic({ apiKey });
  }

  async completeJson(req: LlmJsonRequest): Promise<{ json: unknown; usage: LlmUsage }> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      output_config: {
        format: { type: 'json_schema', schema: req.schema },
      },
      messages: [{ role: 'user', content: req.user }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('LLM refused the request');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('LLM output truncated (max_tokens hit)');
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      json: JSON.parse(text),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
