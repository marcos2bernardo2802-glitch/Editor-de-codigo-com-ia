import { AIProvider } from '../types';

/**
 * Generates a clean, short display name for AI models:
 * - Strips tags after ":" (e.g. :latest)
 * - Strips parameter sizes (35b, 30b, 70b, 7b)
 * - Strips MoE markers (a3b, a14b)
 * - Strips context sizes (128k, 256k)
 * - Strips quantizations (q4_k_m, fp16, awq)
 * - Strips repo prefixes and suffixes (-instruct, -chat, -preview)
 * - Preserves family and version (e.g. Qwen3.6, Qwen3-VL, Gemini 3.1 Pro)
 * - If customDisplayName is provided, it takes highest priority.
 */
export function getShortModelName(
  modelName: string | undefined,
  provider?: AIProvider | string,
  customDisplayName?: string
): string {
  if (customDisplayName && customDisplayName.trim()) {
    return customDisplayName.trim();
  }

  const fallback = provider === 'gemini' ? 'Gemini' : 'Colab';
  if (!modelName || !modelName.trim()) {
    return fallback;
  }

  const raw = modelName.trim();

  // Gemini family normalization
  if (/^models\/gemini/i.test(raw) || /^gemini/i.test(raw)) {
    let cleaned = raw
      .replace(/^models\//i, '')
      .replace(/:.*$/, '')
      .replace(/-(preview|latest|exp|experimental).*$/i, '');

    const parts = cleaned.split('-').map((p) => {
      const lower = p.toLowerCase();
      if (lower === 'gemini') return 'Gemini';
      if (lower === 'pro') return 'Pro';
      if (lower === 'flash') return 'Flash';
      if (lower === 'ultra') return 'Ultra';
      if (lower === 'thinking') return 'Thinking';
      if (/^\d+(\.\d+)*$/.test(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    });

    const result = parts.join(' ').trim();
    return result || 'Gemini';
  }

  // 1. Remove repository prefixes (e.g. "Qwen/Qwen2.5-Coder" -> "Qwen2.5-Coder")
  let name = raw.split('/').pop() || raw;

  // 2. Remove tag after ":" (e.g. ":latest", ":32b")
  name = name.split(':')[0];

  // 3. Remove context window sizes (e.g. -128k, -256k, 128k)
  name = name.replace(/[-_]?(128k|256k|64k|32k|16k|8k|4k|1m|2m)\b/gi, '');

  // 4. Remove MoE markers (e.g. -a3b, -a14b)
  name = name.replace(/[-_]?a\d+b\b/gi, '');

  // 5. Remove parameter sizes (e.g. -35b, -30b, -70b, -7b, -8b, -14b, -32b, -1.5b)
  name = name.replace(/[-_]?\d+(\.\d+)?b\b/gi, '');

  // 6. Remove quantizations (e.g. -q4_k_m, -q8_0, -fp16, -int4, -awq, -gptq, -gguf)
  name = name.replace(/[-_]?(q\d+(_[a-z0-9]+)*|fp\d+|int\d+|awq|gptq|gguf)\b/gi, '');

  // 7. Remove instruction/chat/base suffixes
  name = name.replace(/[-_]?(instruct|chat|preview|base)\b/gi, '');

  // 8. Clean trailing/leading hyphens or underscores
  name = name.replace(/^[-_]+|[-_]+$/g, '').trim();

  if (!name) return fallback;

  // Capitalize known model families
  if (/^qwen/i.test(name)) {
    name = name.replace(/^qwen/i, 'Qwen');
    name = name.replace(/[-_]vl\b/i, '-VL');
  } else if (/^llama/i.test(name)) {
    name = name.replace(/^llama/i, 'Llama');
  } else if (/^deepseek/i.test(name)) {
    name = name.replace(/^deepseek/i, 'DeepSeek');
  } else if (/^mistral/i.test(name)) {
    name = name.replace(/^mistral/i, 'Mistral');
  } else if (/^claude/i.test(name)) {
    name = name.replace(/^claude/i, 'Claude');
  } else if (/^phi/i.test(name)) {
    name = name.replace(/^phi/i, 'Phi');
  } else if (/^gemma/i.test(name)) {
    name = name.replace(/^gemma/i, 'Gemma');
  } else {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  name = name.replace(/[-_]+/g, '-').replace(/^-|-$/g, '');

  return name || fallback;
}
