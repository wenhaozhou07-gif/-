import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 5173);

function loadLocalEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

function normalizeGlossary(glossary) {
  if (!Array.isArray(glossary)) return [];
  return glossary
    .filter((item) => item && typeof item.en === 'string' && typeof item.zh === 'string')
    .slice(0, 30)
    .map((item) => ({
      en: item.en.slice(0, 120),
      zh: item.zh.slice(0, 120),
      locked: Boolean(item.locked),
    }));
}

function normalizeContext(context) {
  if (!Array.isArray(context)) return [];
  return context
    .filter((item) => item && (item.source || item.translation))
    .slice(-8)
    .map((item) => ({
      source: String(item.source || '').slice(0, 600),
      translation: String(item.translation || '').slice(0, 600),
      status: String(item.status || 'stable').slice(0, 40),
    }));
}

function normalizeTargetLanguage(value) {
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

function getLanguageLabel(targetLanguage) {
  return targetLanguage === 'en-US' ? 'English' : '简体中文';
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockedHost(hostname) {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return true;
  if (/^127\./.test(lower) || lower === '0.0.0.0') return true;
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  return false;
}

function normalizePublicUrl(rawUrl) {
  const url = new URL(String(rawUrl || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('只支持 http/https 网页。');
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error('出于安全限制，网页翻译不抓取本地或内网地址。');
  }
  return url;
}

function extractReadableSegments(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ');
  const title = stripHtml(cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const itemPattern = /<(h1|h2|h3|p|li|blockquote|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
  const seen = new Set();
  const segments = [];
  let match;

  while ((match = itemPattern.exec(cleaned)) && segments.length < 28) {
    const tag = match[1].toLowerCase();
    const text = stripHtml(match[2]);
    const key = text.toLowerCase();
    if (text.length < 24 || seen.has(key)) continue;
    if (/^(cookie|privacy|terms|subscribe|sign up|advertisement)$/i.test(text)) continue;
    seen.add(key);
    segments.push({
      id: `web-${segments.length + 1}`,
      tag,
      text: text.slice(0, 900),
    });
  }

  if (segments.length < 4) {
    const bodyText = stripHtml(cleaned);
    const chunks = bodyText
      .split(/(?<=[.!?。！？])\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 40)
      .slice(0, 18);
    for (const text of chunks) {
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({
        id: `web-${segments.length + 1}`,
        tag: 'text',
        text: text.slice(0, 900),
      });
    }
  }

  return {
    title: title || 'Untitled page',
    segments,
  };
}

function writeNdjson(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
}

function fallbackTranslate(text, glossary, targetLanguage = 'zh-CN') {
  const lower = text.toLowerCase();
  const hits = glossary.filter((item) => lower.includes(item.en.toLowerCase()));
  const toEnglish = targetLanguage === 'en-US';

  if (lower.includes('cache policy')) {
    return {
      translation: toEnglish
        ? 'This refers to the cache policy, which is related to content distribution across edge nodes.'
        : '这里提到的是缓存策略，和边缘节点的内容分发有关。',
      confidence: 86,
      status: 'corrected',
      revisionReason: toEnglish
        ? 'Local fallback matched the term cache policy.'
        : '本地降级模式命中术语 cache policy / 缓存策略。',
      terms: ['cache policy'],
    };
  }

  if (lower.includes('latency')) {
    return {
      translation: toEnglish
        ? 'This is about latency. Pay attention to the end-to-end response time.'
        : '这里在讨论延迟相关内容，建议关注端到端响应时间。',
      confidence: 82,
      status: 'stable',
      revisionReason: toEnglish ? 'Local fallback detected a latency topic.' : '本地降级模式识别到 latency 主题。',
      terms: hits.map((item) => item.en),
    };
  }

  if (lower.includes('model')) {
    return {
      translation: toEnglish
        ? 'This is discussing model capabilities. The translation may need further context.'
        : '这里在讨论模型能力，译文需要结合上下文继续修正。',
      confidence: 80,
      status: 'draft',
      revisionReason: toEnglish ? 'Local fallback detected a model-related topic.' : '本地降级模式识别到 model 主题。',
      terms: hits.map((item) => item.en),
    };
  }

  if (hits.length) {
    return {
      translation: toEnglish
        ? `Matched terms: ${hits.map((item) => `${item.zh} / ${item.en}`).join(', ')}.`
        : `已命中术语：${hits.map((item) => `${item.en} / ${item.zh}`).join('，')}。`,
      confidence: 78,
      status: 'stable',
      revisionReason: toEnglish
        ? 'Local fallback generated the output from the glossary.'
        : '本地降级模式根据术语表生成译文。',
      terms: hits.map((item) => item.en),
    };
  }

  return {
    translation: toEnglish
      ? 'Input received. Configure an API key to generate a live English translation.'
      : '已收到输入。配置 API key 后，这里会输出真实模型翻译。',
    confidence: 62,
    status: 'draft',
    revisionReason: toEnglish ? 'Local fallback mode is active.' : '当前未连接云端模型，使用本地降级文案。',
    terms: [],
  };
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
      if (typeof content.output_text === 'string') chunks.push(content.output_text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonObject(value) {
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model response did not contain JSON.');
    return JSON.parse(match[0]);
  }
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 82;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function hasConfiguredSecret(name) {
  const value = String(process.env[name] || '').trim();
  return Boolean(value && !/your-|placeholder|replace-me/i.test(value));
}

function resolveProvider() {
  const requested = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (requested === 'deepseek' || requested === 'openai') return requested;
  if (hasConfiguredSecret('DEEPSEEK_API_KEY')) return 'deepseek';
  if (hasConfiguredSecret('OPENAI_API_KEY')) return 'openai';
  return 'local';
}

function normalizeModelResult(result, fallback, elapsedMs) {
  const translation = String(result.translation || fallback.translation || '').trim();
  return {
    translation: translation || fallback.translation,
    confidence: clampConfidence(result.confidence ?? fallback.confidence),
    status: ['draft', 'stable', 'corrected'].includes(result.status) ? result.status : fallback.status,
    revisionReason: String(result.revisionReason || result.reason || fallback.revisionReason || '').slice(0, 240),
    terms: Array.isArray(result.terms) ? result.terms.map(String).slice(0, 12) : fallback.terms,
    latency: elapsedMs,
  };
}

async function callDeepSeekTranslate({ text, context, glossary, targetLanguage = 'zh-CN' }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');

  if (!hasConfiguredSecret('DEEPSEEK_API_KEY')) {
    return {
      mode: 'fallback',
      provider: 'local',
      model,
      ...fallbackTranslate(text, glossary, targetLanguage),
      latency: 0,
    };
  }

  const startedAt = Date.now();
  const fallback = fallbackTranslate(text, glossary, targetLanguage);
  const targetLabel = getLanguageLabel(targetLanguage);
  const body = {
    model,
    messages: [
      {
        role: 'system',
        content:
          `你是实时翻译产品中的翻译与回改模块。把输入内容翻译成${targetLabel}。输入可能是英文、中文，或中英夹杂；输出必须统一为${targetLabel}，保留必要的产品名、代码名和通用技术缩写。要求短句、自然、适合字幕或网页段落。优先遵守术语表。根据上下文判断是否需要把当前片段标为 corrected。只返回 JSON，不要 Markdown。`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceText: text,
          targetLanguage,
          glossary,
          recentContext: context,
          outputSchema: {
            translation: `目标语言为 ${targetLabel} 的译文`,
            confidence: '0-100 的整数',
            status: 'draft | stable | corrected',
            revisionReason: '一句话，解释术语命中、混合语种处理或回改原因',
            terms: ['命中的英文术语'],
          },
        }),
      },
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0.2,
    stream: false,
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `DeepSeek request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const outputText = payload?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonObject(outputText);

  return {
    mode: 'live',
    provider: 'deepseek',
    model,
    ...{
      ...normalizeModelResult(parsed, fallback, Date.now() - startedAt),
      revisionReason: parsed.revisionReason || parsed.reason || 'DeepSeek 已完成实时翻译。',
    },
  };
}

async function callOpenAITranslate({ text, context, glossary, targetLanguage = 'zh-CN' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5-mini';

  if (!hasConfiguredSecret('OPENAI_API_KEY')) {
    return {
      mode: 'fallback',
      provider: 'local',
      model,
      ...fallbackTranslate(text, glossary, targetLanguage),
      latency: 0,
    };
  }

  const startedAt = Date.now();
  const fallback = fallbackTranslate(text, glossary, targetLanguage);
  const targetLabel = getLanguageLabel(targetLanguage);
  const body = {
    model,
    input: [
      {
        role: 'developer',
        content:
          `你是实时翻译产品中的翻译与回改模块。把输入内容翻译成${targetLabel}。输入可能是英文、中文，或中英夹杂；输出必须统一为${targetLabel}，保留必要的产品名、代码名和通用技术缩写。要求短句、自然、适合字幕或网页段落。优先遵守术语表。根据上下文判断是否需要把当前片段标为 corrected。只返回 JSON，不要 Markdown。`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          sourceText: text,
          targetLanguage,
          glossary,
          recentContext: context,
          outputSchema: {
            translation: `目标语言为 ${targetLabel} 的译文`,
            confidence: '0-100 的整数',
            status: 'draft | stable | corrected',
            revisionReason: '一句话，解释术语命中、混合语种处理或回改原因',
            terms: ['命中的英文术语'],
          },
        }),
      },
    ],
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const outputText = extractOutputText(payload);
  const parsed = parseJsonObject(outputText);

  return {
    mode: 'live',
    provider: 'openai',
    model,
    ...{
      ...normalizeModelResult(parsed, fallback, Date.now() - startedAt),
      revisionReason: parsed.revisionReason || parsed.reason || '云端模型已完成实时翻译。',
    },
  };
}

async function callLiveTranslate(args) {
  const provider = resolveProvider();
  if (provider === 'deepseek') return callDeepSeekTranslate(args);
  if (provider === 'openai') return callOpenAITranslate(args);

  return {
    mode: 'fallback',
    provider: 'local',
    model: process.env.DEEPSEEK_MODEL || process.env.OPENAI_TRANSLATION_MODEL || 'deepseek-v4-flash',
    ...fallbackTranslate(args.text, args.glossary, args.targetLanguage),
    latency: 0,
  };
}

loadLocalEnv();

const app = express();
app.use(express.json({ limit: '128kb' }));

app.get('/api/health', (_req, res) => {
  const provider = resolveProvider();
  const model =
    provider === 'deepseek'
      ? process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
      : provider === 'openai'
        ? process.env.OPENAI_TRANSLATION_MODEL || 'gpt-5-mini'
        : process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  res.json({
    ok: true,
    provider,
    model,
    configured:
      provider === 'deepseek'
        ? hasConfiguredSecret('DEEPSEEK_API_KEY')
        : provider === 'openai'
          ? hasConfiguredSecret('OPENAI_API_KEY')
          : false,
  });
});

app.post('/api/translate', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  if (text.length > 6000) {
    res.status(413).json({ error: 'text is too long' });
    return;
  }

  const glossary = normalizeGlossary(req.body?.glossary);
  const context = normalizeContext(req.body?.context);
  const targetLanguage = normalizeTargetLanguage(req.body?.targetLanguage);

  try {
    const result = await callLiveTranslate({ text, context, glossary, targetLanguage });
    res.json(result);
  } catch (error) {
    const fallback = fallbackTranslate(text, glossary, targetLanguage);
    res.json({
      mode: 'fallback',
      provider: 'local',
      model: process.env.DEEPSEEK_MODEL || process.env.OPENAI_TRANSLATION_MODEL || 'deepseek-v4-flash',
      ...fallback,
      latency: 0,
      error: error.message,
    });
  }
});

app.post('/api/webpage/translate-stream', async (req, res) => {
  const glossary = normalizeGlossary(req.body?.glossary);
  const targetLanguage = normalizeTargetLanguage(req.body?.targetLanguage);
  let pageUrl;

  try {
    pageUrl = normalizePublicUrl(req.body?.url);
  } catch (error) {
    res.status(400).json({ error: error.message || 'URL 无效' });
    return;
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SynapseInterpreter/1.0 (+https://localhost)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      writeNdjson(res, { type: 'error', error: `网页请求失败：HTTP ${response.status}` });
      res.end();
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      writeNdjson(res, { type: 'error', error: '这个地址返回的不是 HTML 网页。' });
      res.end();
      return;
    }

    const html = await response.text();
    const page = extractReadableSegments(html);
    const targets = page.segments.slice(0, Number(req.body?.limit || 14));

    writeNdjson(res, {
      type: 'meta',
      url: pageUrl.toString(),
      title: page.title,
      total: targets.length,
      provider: resolveProvider(),
    });

    const context = [];
    for (const item of targets) {
      writeNdjson(res, {
        type: 'draft',
        id: item.id,
        tag: item.tag,
        source: item.text,
      });

      try {
        const translated = await callLiveTranslate({
          text: item.text,
          context,
          glossary,
          targetLanguage,
        });
        const segment = {
          type: 'segment',
          id: item.id,
          tag: item.tag,
          source: item.text,
          translation: translated.translation,
          confidence: translated.confidence,
          status: translated.status,
          reason: translated.revisionReason,
          latency: translated.latency,
          terms: translated.terms,
          provider: translated.provider,
          model: translated.model,
        };
        context.push({
          source: item.text,
          translation: translated.translation,
          status: translated.status,
        });
        writeNdjson(res, segment);
      } catch (error) {
        const fallback = fallbackTranslate(item.text, glossary, targetLanguage);
        writeNdjson(res, {
          type: 'segment',
          id: item.id,
          tag: item.tag,
          source: item.text,
          translation: fallback.translation,
          confidence: fallback.confidence,
          status: fallback.status,
          reason: error.message || fallback.revisionReason,
          latency: 0,
          terms: fallback.terms,
          provider: 'local',
          model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        });
      }
    }

    writeNdjson(res, { type: 'done' });
    res.end();
  } catch (error) {
    writeNdjson(res, { type: 'error', error: error.name === 'AbortError' ? '网页请求超时。' : error.message });
    res.end();
  }
});

if (isProduction) {
  const distPath = path.join(root, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    root,
    appType: 'spa',
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Synapse dev server running at http://localhost:${port}`);
});
