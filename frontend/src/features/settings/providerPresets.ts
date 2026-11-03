import type { ProviderKind } from '@/domain/types'

/**
 * One-tap provider templates — label, kind, and endpoint.
 *
 * Labels lead with the model family users actually know (GPT, Grok,
 * Claude, Gemini) so the list reads like a model picker, not a company
 * directory. xAI · Grok leads the list — it pairs with the featured Uni
 * teammate. `freeTier` marks providers a key from Uni's providers list
 * can use at no cost — Uni itself is free, and several providers have
 * real free tiers.
 *
 * Endpoint freshness (N014, refreshed 2026-11-03): every URL below was
 * probed live over HTTPS this session — each base answered its
 * /models route with an auth challenge (401/403), a public catalog
 * (200), or a documented route-shaped response, proving the endpoint
 * and path exist. Providers that failed the probe (unreachable, or a
 * dead path) are not listed; two special cases are verified as
 * chat-only endpoints (no public /models route): Perplexity answers
 * 401 on /chat/completions, and Google AI Studio validates the key
 * shape on its compat route — both connect and chat, with discovery
 * honestly reporting no model list.
 */
export interface ProviderPreset {
  label: string
  kind: ProviderKind
  endpointUrl: string
  freeTier?: boolean
}

export const PRESETS: readonly ProviderPreset[] = [
  { label: 'xAI · Grok', kind: 'openai-compatible', endpointUrl: 'https://api.x.ai/v1' },
  { label: 'OpenAI · GPT', kind: 'openai', endpointUrl: 'https://api.openai.com/v1' },
  { label: 'Anthropic · Claude', kind: 'anthropic', endpointUrl: 'https://api.anthropic.com' },
  {
    label: 'Google AI Studio · Gemini',
    kind: 'google',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    freeTier: true,
  },
  { label: 'DeepSeek', kind: 'openai-compatible', endpointUrl: 'https://api.deepseek.com/v1' },
  {
    label: 'Groq',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.groq.com/openai/v1',
    freeTier: true,
  },
  {
    label: 'OpenRouter',
    kind: 'openai-compatible',
    endpointUrl: 'https://openrouter.ai/api/v1',
    freeTier: true,
  },
  {
    label: 'Together',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.together.xyz/v1',
  },
  {
    label: 'Mistral',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.mistral.ai/v1',
    freeTier: true,
  },
  { label: 'Ollama (local)', kind: 'local', endpointUrl: 'http://localhost:11434/v1', freeTier: true },
  { label: 'LM Studio (local)', kind: 'local', endpointUrl: 'http://localhost:1234/v1', freeTier: true },
  {
    label: 'Cerebras',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.cerebras.ai/v1',
    freeTier: true,
  },
  {
    label: 'Fireworks',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.fireworks.ai/inference/v1',
  },
  {
    label: 'Perplexity',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.perplexity.ai',
  },
  {
    label: 'SambaNova',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.sambanova.ai/v1',
    freeTier: true,
  },
  {
    label: 'NVIDIA NIM',
    kind: 'openai-compatible',
    endpointUrl: 'https://integrate.api.nvidia.com/v1',
    freeTier: true,
  },
  {
    label: 'Cohere',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.cohere.ai/compatibility/v1',
  },
  {
    label: 'GitHub Models',
    kind: 'openai-compatible',
    endpointUrl: 'https://models.github.ai/inference',
    freeTier: true,
  },
  {
    label: 'HuggingFace Router',
    kind: 'openai-compatible',
    endpointUrl: 'https://router.huggingface.co/v1',
    freeTier: true,
  },
  {
    label: 'Alibaba DashScope · Qwen',
    kind: 'openai-compatible',
    endpointUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    freeTier: true,
  },
  {
    label: 'Zhipu GLM',
    kind: 'openai-compatible',
    endpointUrl: 'https://open.bigmodel.cn/api/paas/v4',
    freeTier: true,
  },

  /* --- Refreshed catalog (N014) — every endpoint probe-verified
         live this session; see the module doc above. --- */

  {
    label: 'Pollinations (no key)',
    kind: 'openai-compatible',
    endpointUrl: 'https://text.pollinations.ai/openai',
    freeTier: true,
  },
  {
    label: 'Moonshot AI · Kimi',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.moonshot.ai/v1',
  },
  {
    label: 'MiniMax',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.minimaxi.com/v1',
  },
  {
    label: 'DeepInfra',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.deepinfra.com/v1/openai',
  },
  {
    label: 'AI/ML API',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.aimlapi.com/v1',
  },
  {
    label: 'Chutes',
    kind: 'openai-compatible',
    endpointUrl: 'https://llm.chutes.ai/v1',
  },
  {
    label: 'Nebius AI Studio',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.studio.nebius.ai/v1',
  },
  {
    label: 'Novita',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.novita.ai/v3/openai',
  },
  {
    label: 'Hyperbolic',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.hyperbolic.xyz/v1',
  },
  {
    label: 'Glama',
    kind: 'openai-compatible',
    endpointUrl: 'https://glama.ai/api/gateway/openai/v1',
  },
  {
    label: 'AI21',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.ai21.com/studio/v1',
  },
  {
    label: 'Reka',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.reka.ai/v1',
  },
  {
    label: 'Liquid AI',
    kind: 'openai-compatible',
    endpointUrl: 'https://inference.liquid.ai/v1',
  },
  {
    label: 'iFlytek Spark',
    kind: 'openai-compatible',
    endpointUrl: 'https://spark-api-open.xf-yun.com/v1',
  },
  {
    label: 'Tencent Hunyuan',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
  },
  {
    label: 'Volcengine · Doubao',
    kind: 'openai-compatible',
    endpointUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    label: 'Baidu Qianfan',
    kind: 'openai-compatible',
    endpointUrl: 'https://qianfan.baidubce.com/v2',
  },
]
