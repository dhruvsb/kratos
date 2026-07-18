// LLM provider isolation. The rest of the pipeline only sees LlmClient, so
// swapping providers (or a mock in tests) is one file. Both AnthropicLlm and
// OpenAiLlm are kept here — only the call sites (parse-utterance/index.ts,
// scripts/parse-cli.ts, eval/run.ts) decide which one is actually used.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

export class OpenAiLlm implements LlmClient {
  private client: OpenAI;

  constructor(
    public readonly model: string,
    apiKey: string
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async completeJson(req: LlmJsonRequest): Promise<{ json: unknown; usage: LlmUsage }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      // max_completion_tokens is the current param name for chat completions
      // (max_tokens is deprecated on newer models). If your chosen model
      // rejects this, check the current API reference for the right field.
      max_completion_tokens: req.maxTokens ?? 2048,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'llm_response', schema: req.schema, strict: true },
      },
    });

    const choice = response.choices[0];
    if (choice.message.refusal) {
      throw new Error(`LLM refused the request: ${choice.message.refusal}`);
    }
    if (choice.finish_reason === 'length') {
      throw new Error('LLM output truncated (max_completion_tokens hit)');
    }
    if (!choice.message.content) {
      throw new Error('LLM returned no content');
    }

    return {
      json: JSON.parse(choice.message.content),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
