// OpenRouter integration — optional cloud enhancement, offline heuristic is default
// Respects local-first: only used when user explicitly configures a key and is online.

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
}

const STORAGE_KEY = 'apiro.openrouter';

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const AVAILABLE_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-haiku',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-8b-instruct',
  'openai/gpt-3.5-turbo',
] as const;

export function getOpenRouterConfig(): OpenRouterConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.apiKey !== 'string' || !parsed.apiKey.trim()) return null;
    return {
      apiKey: parsed.apiKey.trim(),
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MODEL,
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

export function saveOpenRouterConfig(cfg: OpenRouterConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {}
}

export function clearOpenRouterConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function buildPrompt(channel: 'error' | 'tests' | 'explain', request: { method: string; url: string; headers?: unknown; body?: string }, response: { statusCode: number; statusText: string; headers: unknown; body: string }) {
  const base = `You are an API debugging assistant for APIro, a local-first API client. Be concise, actionable, and specific.`;
  if (channel === 'error') {
    return `${base}\n\nTask: Analyze why this HTTP request failed.\nRequest: ${request.method} ${request.url}\nBody: ${(request.body || '').slice(0, 2000)}\nResponse: ${response.statusCode} ${response.statusText}\nHeaders: ${JSON.stringify(response.headers).slice(0, 1200)}\nBody: ${response.body.slice(0, 4000)}\n\nGive 3-5 bullet points: root cause, immediate fix, and prevention. Keep under 180 words.`;
  }
  if (channel === 'tests') {
    return `${base}\n\nTask: Generate Postman-style pm.test() assertions for this response.\nStatus: ${response.statusCode}\nContent-Type: ${JSON.stringify(response.headers).slice(0, 500)}\nBody: ${response.body.slice(0, 4000)}\n\nOutput only valid JavaScript with pm.test blocks. Include status, JSON shape, and response time tests.`;
  }
  return `${base}\n\nTask: Explain this HTTP response in plain English for a developer.\nStatus: ${response.statusCode} ${response.statusText}\nHeaders: ${JSON.stringify(response.headers).slice(0, 1000)}\nBody: ${response.body.slice(0, 4000)}\n\nExplain what the status means, what the body contains, and what to do next. Under 150 words.`;
}

export async function callOpenRouter(
  channel: 'error' | 'tests' | 'explain',
  request: { method: string; url: string; headers?: unknown; body?: string },
  response: { statusCode: number; statusText: string; headers: unknown; body: string },
  cfg: OpenRouterConfig
): Promise<string> {
  const prompt = buildPrompt(channel, request, response);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
      'HTTP-Referer': 'https://apiro.dev',
      'X-Title': 'APIro',
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: channel === 'tests' ? 0.3 : 0.6,
      max_tokens: 700,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (json.error?.message) throw new Error(json.error.message);
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response from OpenRouter');
  return content;
}

// Helper to try OpenRouter first, fallback to local
export async function tryOpenRouterOrFallback(
  channel: 'error' | 'tests' | 'explain',
  request: { method: string; url: string; headers?: unknown; body?: string },
  response: { statusCode: number; statusText: string; headers: unknown; body: string },
  fallback: () => Promise<string>
): Promise<{ text: string; via: 'openrouter' | 'local' }> {
  const cfg = getOpenRouterConfig();
  if (!cfg || !cfg.enabled) {
    const t = await fallback();
    return { text: t, via: 'local' };
  }
  // if offline, skip attempt
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const t = await fallback();
    return { text: t + '\n\n— Offline, used local heuristic.', via: 'local' };
  }
  try {
    const t = await callOpenRouter(channel, request, response, cfg);
    return { text: t, via: 'openrouter' };
  } catch (e) {
    // fallback silently, but annotate
    const fallbackText = await fallback();
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      text: fallbackText + `\n\n— OpenRouter failed (${errMsg.slice(0, 120)}), fell back to local heuristic.`,
      via: 'local',
    };
  }
}
