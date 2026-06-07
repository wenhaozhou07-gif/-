import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Globe2,
  Languages,
  Link,
  Loader2,
  Mic,
  MonitorPlay,
  Pause,
  Play,
  Radio,
  RefreshCcw,
  RotateCcw,
  Send,
  Sparkles,
  Subtitles,
  Volume2,
  VolumeX,
  Wand2,
  Zap,
} from 'lucide-react';
import './styles.css';

const demoSegments = [
  {
    id: 's1',
    speaker: 'Keynote',
    sourceDraft: 'Today I will show how we built a live transcription assistant for global teams.',
    sourceFinal: 'Today I will show how we built a live interpretation assistant for global teams.',
    zhDraft: '今天我将展示我们如何为全球团队构建实时转录助手。',
    zhFinal: '今天我将展示我们如何为全球团队构建实时同声传译助手。',
    reason: '后文多次出现 live audio 与 bilingual caption，系统将 transcription 回改为 interpretation。',
    confidence: 91,
    latency: 760,
    terms: ['live interpretation', 'global teams'],
  },
  {
    id: 's2',
    speaker: 'Keynote',
    sourceDraft: 'The first challenge is the cash policy across edge nodes.',
    sourceFinal: 'The first challenge is the cache policy across edge nodes.',
    zhDraft: '第一个挑战是边缘节点之间的现金策略。',
    zhFinal: '第一个挑战是边缘节点之间的缓存策略。',
    reason: '结合 edge nodes 和 CDN 语境，ASR 将 cash policy 修正为 cache policy。',
    confidence: 88,
    latency: 680,
    terms: ['cache policy', 'edge nodes'],
  },
  {
    id: 's3',
    speaker: 'Keynote',
    sourceDraft: 'We keep a two second buffer, but the latency budget is under eight hundred milliseconds.',
    sourceFinal: 'We keep a two-second buffer, but the latency budget is under eight hundred milliseconds.',
    zhDraft: '我们保留两秒缓冲，但延迟预算低于八百毫秒。',
    zhFinal: '我们保留两秒缓冲，但端到端延迟预算低于八百毫秒。',
    reason: '根据系统指标面板补全 end-to-end 语义，译文更符合工程表达。',
    confidence: 94,
    latency: 610,
    terms: ['latency budget', 'buffer'],
  },
  {
    id: 's4',
    speaker: 'Guest',
    sourceDraft: 'When the model is uncertain, it should admit it and revise the previous subtitle.',
    sourceFinal: 'When the model is uncertain, it should mark it and revise the previous subtitle.',
    zhDraft: '当模型不确定时，它应该承认这一点并修改前一个字幕。',
    zhFinal: '当模型不确定时，它应该标记风险，并回改前一个字幕。',
    reason: '产品策略使用风险标记，不把系统状态拟人化。',
    confidence: 90,
    latency: 720,
    terms: ['uncertain', 'revise'],
  },
  {
    id: 's5',
    speaker: 'Guest',
    sourceDraft: 'For developers, this means fewer missed details during remote launches.',
    sourceFinal: 'For developers, this means fewer missed details during remote launches.',
    zhDraft: '对开发者来说，这意味着远程发布时遗漏的细节更少。',
    zhFinal: '对开发者来说，这意味着远程发布时更少错过关键细节。',
    reason: '自然度优化：把 missed details 翻译为错过关键细节，贴合会议场景。',
    confidence: 96,
    latency: 570,
    terms: ['developers', 'remote launches'],
  },
  {
    id: 's6',
    speaker: 'Keynote',
    sourceDraft: 'The goal is simple: keep people in the conversation, not one paragraph behind.',
    sourceFinal: 'The goal is simple: keep people in the conversation, not one paragraph behind.',
    zhDraft: '目标很简单：让人们留在对话中，而不是落后一段话。',
    zhFinal: '目标很简单：让每个人都跟上内容节奏，而不是慢一整段。',
    reason: '表达润色：保持口语节奏，同时保留原句对比。',
    confidence: 97,
    latency: 540,
    terms: ['conversation rhythm'],
  },
];

const glossary = [
  { en: 'live interpretation', zh: '实时同传', locked: true },
  { en: 'cache policy', zh: '缓存策略', locked: true },
  { en: 'edge nodes', zh: '边缘节点', locked: true },
  { en: 'latency budget', zh: '延迟预算', locked: true },
  { en: 'revise', zh: '回改', locked: false },
  { en: 'remote launches', zh: '远程发布', locked: false },
];

const pipeline = [
  { label: 'VAD', value: '切分', icon: Radio },
  { label: 'ASR', value: '识别', icon: Activity },
  { label: 'MT', value: '翻译', icon: Languages },
  { label: 'REV', value: '回改', icon: Wand2 },
  { label: 'TTS', value: '播报', icon: Volume2 },
];

const modes = [
  { id: 'voice', label: '语音同传', icon: Mic },
  { id: 'web', label: '网页翻译', icon: Globe2 },
  { id: 'text', label: '文本翻译', icon: Languages },
];

const directions = [
  { id: 'zh-CN', label: '英译中', source: 'EN', target: '中文', speechLang: 'en-US' },
  { id: 'en-US', label: '中译英', source: '中文', target: 'EN', speechLang: 'zh-CN' },
];

function tokenize(value) {
  return value
    .replace(/\s+/g, ' ')
    .split(/(\s+|，|。|：|、|；|,|\.|:|;)/)
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speakZh(text, rate, lang = 'zh-CN') {
  if (!('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function pseudoTranslate(text, targetLanguage = 'zh-CN') {
  const toEnglish = targetLanguage === 'en-US';
  const lower = text.toLowerCase();
  const hits = glossary.filter((item) => lower.includes(item.en));
  if (lower.includes('latency')) return toEnglish ? 'This is about latency and end-to-end response time.' : '系统识别到延迟相关内容，建议关注端到端响应时间。';
  if (lower.includes('cache')) return toEnglish ? 'This is about cache policy.' : '系统识别到缓存相关内容，译文已锁定为缓存策略。';
  if (lower.includes('model')) return toEnglish ? 'This is about model capability and context revision.' : '系统识别到模型相关内容，译文将结合上下文自动回改。';
  if (lower.includes('developer')) return toEnglish ? 'For developers, this reduces missed details during meetings.' : '对开发者来说，这会减少会议中错过关键信息的情况。';
  return hits.length
    ? toEnglish
      ? `Matched terms: ${hits.map((item) => `${item.zh} / ${item.en}`).join(', ')}.`
      : `已命中术语：${hits.map((item) => `${item.en} / ${item.zh}`).join('，')}。`
    : toEnglish
      ? 'Live English translation will appear here after the model responds.'
      : '实时中文译文会在模型返回后显示。';
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="stat">
      <div className={`statIcon ${accent || ''}`}>
        <Icon size={18} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function IconButton({ active, children, icon: Icon, ...props }) {
  return (
    <button className={`button ${active ? 'isActive' : ''}`} type="button" {...props}>
      {Icon ? <Icon size={17} /> : null}
      <span>{children}</span>
    </button>
  );
}

function SegmentRow({ segment, active }) {
  return (
    <article className={`segmentRow ${active ? 'isActive' : ''} ${segment.status === 'corrected' ? 'isCorrected' : ''}`}>
      <div className="segmentMeta">
        <span>{segment.speaker}</span>
        <span>{segment.latency || '--'} ms</span>
        <span>{segment.confidence || '--'}%</span>
      </div>
      <p className="sourceLine">{segment.source || '...'}</p>
      <p className="translationLine">{segment.translation || '正在等待语义块...'}</p>
      {segment.status === 'corrected' ? (
        <div className="revision">
          <RefreshCcw size={14} />
          <span>{segment.reason}</span>
        </div>
      ) : null}
    </article>
  );
}

function TermsPanel({ activeSegment }) {
  const activeTerms = activeSegment?.terms || [];

  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Glossary</span>
          <h2>术语锁定</h2>
        </div>
        <BadgeCheck size={19} />
      </div>
      <div className="terms">
        {glossary.map((item) => (
          <div className={`term ${activeTerms.includes(item.en) ? 'hit' : ''}`} key={item.en}>
            <span>{item.en}</span>
            <strong>{item.zh}</strong>
            <small>{item.locked ? 'LOCK' : 'LIVE'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PipelinePanel({ running, correctionCount }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Pipeline</span>
          <h2>同传链路</h2>
        </div>
        <BrainCircuit size={19} />
      </div>
      <div className="pipeline">
        {pipeline.map((step, index) => {
          const Icon = step.icon;
          return (
            <div className={`pipeStep ${running ? 'isRunning' : ''}`} key={step.label} style={{ '--delay': `${index * 110}ms` }}>
              <Icon size={16} />
              <span>{step.label}</span>
              <strong>{step.value}</strong>
            </div>
          );
        })}
      </div>
      <div className="correctionStrip">
        <Sparkles size={17} />
        <span>自动回改</span>
        <strong>{correctionCount}</strong>
      </div>
    </section>
  );
}

function MicPanel({ onInsert, health, translating, speechLang }) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setAvailable(Boolean(SpeechRecognition));
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLang;
    recognition.onresult = (event) => {
      const result = Array.from(event.results)
        .slice(event.resultIndex)
        .map((item) => item[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!result) return;
      onInsert(result, !event.results[event.results.length - 1].isFinal);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;

    return () => recognition.stop();
  }, [onInsert, speechLang]);

  const toggle = () => {
    if (!available || !recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  return (
    <section className="panel micPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Input</span>
          <h2>麦克风</h2>
        </div>
        <Mic size={19} />
      </div>
      <button className="micButton" type="button" onClick={toggle} disabled={!available}>
        {listening ? <Pause size={20} /> : <Mic size={20} />}
        <span>{available ? (listening ? '停止识别' : '开始识别') : '当前浏览器不可用'}</span>
      </button>
      <div className={`serviceStatus ${health.configured ? 'ready' : 'local'}`}>
        <span />
        <strong>{translating ? '翻译中' : health.configured ? '云端模型就绪' : '本地降级模式'}</strong>
        <small>{health.model || 'gpt-5-mini'}</small>
      </div>
    </section>
  );
}

function DirectionSwitch({ value, setValue }) {
  return (
    <div className="directionSwitch" role="tablist" aria-label="翻译方向">
      {directions.map((item) => (
        <button
          className={value === item.id ? 'selected' : ''}
          key={item.id}
          type="button"
          onClick={() => setValue(item.id)}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function WebPanel({ url, setUrl, onStart, running, meta, error }) {
  return (
    <section className="panel webPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Web</span>
          <h2>网页实时翻译</h2>
        </div>
        <Globe2 size={19} />
      </div>
      <form className="urlForm" onSubmit={onStart}>
        <div className="urlInputWrap">
          <Link size={16} />
          <input
            aria-label="网页 URL"
            placeholder="https://example.com/article"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={running}
          />
        </div>
        <button className="sendButton" type="submit" disabled={running || !url.trim()}>
          {running ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </form>
      <div className="sampleActions">
        <button type="button" onClick={() => setUrl('https://example.com/')} disabled={running}>
          示例网页
        </button>
      </div>
      {meta ? (
        <div className="webMeta">
          <strong>{meta.title}</strong>
          <span>{meta.total} 个段落 · {meta.provider}</span>
        </div>
      ) : null}
      {error ? <div className="webError">{error}</div> : null}
    </section>
  );
}

function TextPanel({ value, setValue, onStart, running, error, targetLanguage }) {
  const sample =
    targetLanguage === 'en-US'
      ? '我们今天要讨论 cache policy 和 edge nodes 的 latency budget。'
      : 'This architecture 会把 streaming ASR 和回改引擎结合起来。';

  return (
    <section className="panel textPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">Text</span>
          <h2>文本翻译</h2>
        </div>
        <Languages size={19} />
      </div>
      <form className="textForm" onSubmit={onStart}>
        <textarea
          aria-label="待翻译文本"
          placeholder="输入英文、中文，或中英夹杂内容..."
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={running}
        />
        <button className="translateButton" type="submit" disabled={running || !value.trim()}>
          {running ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
          <span>{running ? '翻译中' : '开始翻译'}</span>
        </button>
      </form>
      <div className="sampleActions">
        <button type="button" onClick={() => setValue(sample)} disabled={running}>
          填入混合语种示例
        </button>
      </div>
      {error ? <div className="webError">{error}</div> : null}
    </section>
  );
}

function App() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState('voice');
  const [targetLanguage, setTargetLanguage] = useState('zh-CN');
  const [voiceOn, setVoiceOn] = useState(false);
  const [subtitleOn, setSubtitleOn] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.02);
  const [segments, setSegments] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [webRunning, setWebRunning] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [webMeta, setWebMeta] = useState(null);
  const [webError, setWebError] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textRunning, setTextRunning] = useState(false);
  const [textError, setTextError] = useState('');
  const [translationHealth, setTranslationHealth] = useState({
    configured: false,
    model: 'gpt-5-mini',
    provider: 'local',
    status: 'checking',
  });
  const runIdRef = useRef(0);
  const voiceOnRef = useRef(voiceOn);
  const speechRateRef = useRef(speechRate);
  const segmentsRef = useRef([]);
  const translationSeqRef = useRef(0);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        setTranslationHealth({
          configured: Boolean(payload.configured),
          model: payload.model || 'gpt-5-mini',
          provider: payload.provider || 'local',
          status: payload.configured ? 'ready' : 'local',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTranslationHealth((previous) => ({
          ...previous,
          configured: false,
          provider: 'local',
          status: 'offline',
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSegment = useMemo(
    () => segments.find((segment) => segment.id === activeId) || segments[segments.length - 1],
    [segments, activeId]
  );

  const correctionCount = useMemo(
    () => segments.filter((segment) => segment.status === 'corrected').length,
    [segments]
  );

  const avgLatency = useMemo(() => {
    const values = segments.map((segment) => segment.latency).filter(Boolean);
    if (!values.length) return '--';
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [segments]);

  const avgConfidence = useMemo(() => {
    const values = segments.map((segment) => segment.confidence).filter(Boolean);
    if (!values.length) return '--';
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [segments]);

  const reset = () => {
    runIdRef.current += 1;
    setRunning(false);
    setWebRunning(false);
    setWebMeta(null);
    setWebError('');
    setTextError('');
    setTextRunning(false);
    setSegments([]);
    setActiveId(null);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const runDemo = async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunning(true);
    setSegments([]);

    for (const segment of demoSegments) {
      if (runIdRef.current !== runId) return;
      setActiveId(segment.id);
      setSegments((previous) => [
        ...previous,
        {
          ...segment,
          source: '',
          translation: '',
          status: 'listening',
        },
      ]);

      const sourceTokens = tokenize(segment.sourceDraft);
      const zhTokens = tokenize(segment.zhDraft);
      const steps = Math.max(sourceTokens.length, zhTokens.length);

      for (let index = 1; index <= steps; index += 1) {
        if (runIdRef.current !== runId) return;
        setSegments((previous) =>
          previous.map((item) =>
            item.id === segment.id
              ? {
                  ...item,
                  source: sourceTokens.slice(0, index).join(''),
                  translation: zhTokens.slice(0, Math.max(1, index - 1)).join(''),
                  status: 'draft',
                }
              : item
          )
        );
        await sleep(74);
      }

      setSegments((previous) =>
        previous.map((item) =>
          item.id === segment.id
            ? {
                ...item,
                source: segment.sourceDraft,
                translation: segment.zhDraft,
                status: 'draft',
                confidence: Math.max(segment.confidence - 8, 78),
                latency: segment.latency + 140,
              }
            : item
        )
      );

      await sleep(520);
      if (runIdRef.current !== runId) return;

      setSegments((previous) =>
        previous.map((item) =>
          item.id === segment.id
            ? {
                ...item,
                source: segment.sourceFinal,
                translation: segment.zhFinal,
                status: 'corrected',
                confidence: segment.confidence,
                latency: segment.latency,
              }
            : item
        )
      );

      if (voiceOnRef.current) speakZh(segment.zhFinal, speechRateRef.current);
      await sleep(680);
    }

    if (runIdRef.current === runId) setRunning(false);
  };

  const toggleRun = () => {
    if (mode !== 'voice') return;
    if (running) {
      runIdRef.current += 1;
      setRunning(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
      runDemo();
    }
  };

  const insertMicTranscript = React.useCallback(async (text, interim) => {
    const liveId = 'mic-live';
    const terms = glossary.filter((item) => text.toLowerCase().includes(item.en.toLowerCase())).map((item) => item.en);

    if (interim) {
      setActiveId(liveId);
      setSegments((previous) => {
        const exists = previous.some((item) => item.id === liveId);
        const next = {
          id: liveId,
          speaker: 'Mic',
          source: text,
          translation: '正在等待完整语义块...',
          sourceDraft: text,
          sourceFinal: text,
          zhDraft: '',
          zhFinal: '',
          reason: '浏览器正在输出临时识别结果，暂不调用翻译模型。',
          confidence: 78,
          latency: 0,
          terms,
          status: 'draft',
        };
        return exists ? previous.map((item) => (item.id === liveId ? next : item)) : [...previous, next];
      });
      return;
    }

    const id = `mic-${Date.now()}`;
    const seq = translationSeqRef.current + 1;
    translationSeqRef.current = seq;
    const startedAt = performance.now();
    setActiveId(id);
    setSegments((previous) => {
      const exists = previous.some((item) => item.id === liveId);
      const next = {
        id,
        speaker: 'Mic',
        source: text,
        translation: '正在调用翻译模型...',
        sourceDraft: text,
        sourceFinal: text,
        zhDraft: '',
        zhFinal: '',
        reason: '语义块已稳定，正在进入模型翻译。',
        confidence: 80,
        latency: 0,
        terms,
        status: 'draft',
      };
      return exists ? previous.map((item) => (item.id === liveId ? next : item)) : [...previous, next];
    });

    setTranslationBusy(true);

    try {
      const context = segmentsRef.current
        .filter((segment) => segment.id !== liveId)
        .slice(-8)
        .map((segment) => ({
          source: segment.source,
          translation: segment.translation,
          status: segment.status,
        }));

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context, glossary, targetLanguage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '翻译接口请求失败');

      const translation = payload.translation || pseudoTranslate(text, targetLanguage);
      const latency = payload.latency || Math.round(performance.now() - startedAt);
      const status = payload.status === 'corrected' ? 'corrected' : payload.mode === 'live' ? 'stable' : payload.status || 'draft';
      const reason =
        payload.revisionReason ||
        (payload.mode === 'live' ? '云端模型已完成实时翻译。' : payload.error || '本地降级模式输出。');

      setSegments((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                translation,
                zhDraft: translation,
                zhFinal: translation,
                reason,
                confidence: payload.confidence || 82,
                latency,
                terms: payload.terms?.length ? payload.terms : terms,
                status,
              }
            : item
        )
      );

      setTranslationHealth((previous) => ({
        ...previous,
        configured: payload.mode === 'live' ? true : previous.configured,
        model: payload.model || previous.model,
        provider: payload.provider || previous.provider,
        status: payload.mode === 'live' ? 'live' : 'fallback',
        lastError: payload.error,
      }));

      if (voiceOnRef.current) speakZh(translation, speechRateRef.current, targetLanguage);
    } catch (error) {
      const translation = pseudoTranslate(text, targetLanguage);
      setSegments((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                translation,
                zhDraft: translation,
                zhFinal: translation,
                reason: error.message || '翻译接口不可用，已回退到本地降级模式。',
                confidence: 62,
                latency: Math.round(performance.now() - startedAt),
                terms,
                status: 'draft',
              }
            : item
        )
      );
      setTranslationHealth((previous) => ({
        ...previous,
        provider: 'local',
        status: 'fallback',
        lastError: error.message,
      }));
    } finally {
      if (translationSeqRef.current === seq) setTranslationBusy(false);
    }
  }, [targetLanguage]);

  const startWebTranslate = async (event) => {
    event.preventDefault();
    const targetUrl = webUrl.trim();
    if (!targetUrl || webRunning) return;

    runIdRef.current += 1;
    const runId = runIdRef.current;
    setWebRunning(true);
    setWebMeta(null);
    setWebError('');
    setSegments([]);
    setActiveId(null);

    try {
      const response = await fetch('/api/webpage/translate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          glossary,
          targetLanguage,
          limit: 14,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || '网页翻译请求失败。');
      }

      if (!response.body) throw new Error('当前浏览器不支持流式读取。');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (runIdRef.current === runId) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line);
          if (payload.type === 'meta') {
            setWebMeta(payload);
          }
          if (payload.type === 'error') {
            setWebError(payload.error || '网页翻译失败。');
          }
          if (payload.type === 'draft') {
            setActiveId(payload.id);
            setSegments((previous) => [
              ...previous,
              {
                id: payload.id,
                speaker: 'Web',
                source: payload.source,
                translation: '正在翻译网页段落...',
                sourceDraft: payload.source,
                sourceFinal: payload.source,
                zhDraft: '',
                zhFinal: '',
                reason: '网页正文已抽取，正在调用翻译模型。',
                confidence: 70,
                latency: 0,
                terms: [],
                status: 'draft',
              },
            ]);
          }
          if (payload.type === 'segment') {
            setActiveId(payload.id);
            setSegments((previous) =>
              previous.map((item) =>
                item.id === payload.id
                  ? {
                      ...item,
                      translation: payload.translation,
                      zhDraft: payload.translation,
                      zhFinal: payload.translation,
                      reason: payload.reason || '网页段落已翻译。',
                      confidence: payload.confidence || 82,
                      latency: payload.latency || 0,
                      terms: payload.terms || [],
                      status: payload.status || 'stable',
                    }
                  : item
              )
            );
          }
        }
      }
    } catch (error) {
      setWebError(error.message || '网页翻译失败。');
    } finally {
      if (runIdRef.current === runId) setWebRunning(false);
    }
  };

  const startTextTranslate = async (event) => {
    event.preventDefault();
    const text = textInput.trim();
    if (!text || textRunning) return;

    const id = `text-${Date.now()}`;
    const startedAt = performance.now();
    setTextRunning(true);
    setTextError('');
    setSegments([
      {
        id,
        speaker: 'Text',
        source: text,
        translation: '正在翻译文本...',
        sourceDraft: text,
        sourceFinal: text,
        zhDraft: '',
        zhFinal: '',
        reason: '文本已提交，正在调用翻译模型。',
        confidence: 70,
        latency: 0,
        terms: [],
        status: 'draft',
      },
    ]);
    setActiveId(id);

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          context: [],
          glossary,
          targetLanguage,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '文本翻译失败。');
      const translation = payload.translation || pseudoTranslate(text, targetLanguage);

      setSegments((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                translation,
                zhDraft: translation,
                zhFinal: translation,
                reason: payload.revisionReason || '文本翻译完成。',
                confidence: payload.confidence || 82,
                latency: payload.latency || Math.round(performance.now() - startedAt),
                terms: payload.terms || [],
                status: payload.status || 'stable',
              }
            : item
        )
      );
    } catch (error) {
      setTextError(error.message || '文本翻译失败。');
      const translation = pseudoTranslate(text, targetLanguage);
      setSegments((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                translation,
                reason: error.message || '已回退到本地降级模式。',
                confidence: 62,
                latency: Math.round(performance.now() - startedAt),
                status: 'draft',
              }
            : item
        )
      );
    } finally {
      setTextRunning(false);
    }
  };

  const live = running || translationBusy || webRunning || textRunning;
  const modelStatus =
    translationHealth.status === 'live'
      ? 'LIVE'
      : translationHealth.configured
        ? 'READY'
        : translationHealth.status === 'checking'
          ? '...'
        : 'LOCAL';
  const activeDirection = directions.find((item) => item.id === targetLanguage) || directions[0];
  const modeLabel = modes.find((item) => item.id === mode)?.label || '语音同传';

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brand">
          <div className="brandMark">
            <Languages size={25} />
          </div>
          <div>
            <span>Synapse</span>
            <strong>AI 同声传译助手</strong>
          </div>
        </div>
        <div className="topControls">
          <div className="modeTabs" role="tablist" aria-label="input mode">
            {modes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={mode === item.id ? 'selected' : ''}
                  type="button"
                  key={item.id}
                  onClick={() => setMode(item.id)}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          <IconButton icon={subtitleOn ? Subtitles : Subtitles} active={subtitleOn} onClick={() => setSubtitleOn((value) => !value)}>
            字幕
          </IconButton>
          <IconButton icon={voiceOn ? Volume2 : VolumeX} active={voiceOn} onClick={() => setVoiceOn((value) => !value)}>
            语音播报
          </IconButton>
        </div>
      </header>

      <section className="workspace">
        <aside className="leftRail">
          <section className="panel controlPanel">
            <div className="panelHeader">
              <div>
                <span className="eyebrow">Live</span>
                <h2>控制台</h2>
              </div>
              <Bot size={20} />
            </div>
            <div className="primaryActions">
              <button className="runButton" type="button" onClick={reset}>
                <RotateCcw size={20} />
                <span>清空结果</span>
              </button>
              <button className="resetButton" type="button" onClick={reset}>
                <RotateCcw size={18} />
              </button>
            </div>
            <div className="sliderRow">
              <label htmlFor="speechRate">语速</label>
              <input
                id="speechRate"
                type="range"
                min="0.82"
                max="1.24"
                step="0.02"
                value={speechRate}
                onChange={(event) => setSpeechRate(Number(event.target.value))}
              />
              <strong>{speechRate.toFixed(2)}x</strong>
            </div>
            <DirectionSwitch value={targetLanguage} setValue={setTargetLanguage} />
          </section>

          {mode === 'voice' ? (
            <MicPanel
              onInsert={insertMicTranscript}
              health={translationHealth}
              translating={translationBusy}
              speechLang={activeDirection.speechLang}
            />
          ) : null}
          {mode === 'web' ? (
            <WebPanel
              url={webUrl}
              setUrl={setWebUrl}
              onStart={startWebTranslate}
              running={webRunning}
              meta={webMeta}
              error={webError}
            />
          ) : null}
          {mode === 'text' ? (
            <TextPanel
              value={textInput}
              setValue={setTextInput}
              onStart={startTextTranslate}
              running={textRunning}
              error={textError}
              targetLanguage={targetLanguage}
            />
          ) : null}

          <section className="panel">
            <div className="panelHeader">
              <div>
                <span className="eyebrow">Health</span>
                <h2>实时指标</h2>
              </div>
              <Gauge size={19} />
            </div>
            <div className="statsGrid">
              <Stat icon={Zap} label="平均延迟" value={`${avgLatency} ms`} accent="green" />
              <Stat icon={CheckCircle2} label="置信度" value={`${avgConfidence}%`} accent="blue" />
              <Stat icon={RefreshCcw} label="回改次数" value={correctionCount} accent="amber" />
              <Stat icon={Subtitles} label="字幕状态" value={subtitleOn ? 'ON' : 'OFF'} accent="violet" />
              <Stat icon={BrainCircuit} label="模型状态" value={modelStatus} accent={modelStatus === 'LIVE' || modelStatus === 'READY' ? 'green' : 'amber'} />
            </div>
          </section>
        </aside>

        <section className="captionStage">
          <div className="stageHeader">
            <div>
              <span className="eyebrow">Now Interpreting</span>
              <h1>{modeLabel} · {activeDirection.label}</h1>
            </div>
            <div className={`livePill ${live ? 'onAir' : ''}`}>
              <span />
              {webRunning ? 'WEB LIVE' : translationBusy ? 'AI LIVE' : running ? 'ON AIR' : 'READY'}
            </div>
          </div>

          <div className="transcriptWindow">
            <div className="sourceCaption">
              <span>{activeDirection.source}</span>
              <p>{activeSegment?.source || '等待输入...'}</p>
            </div>
            {subtitleOn ? (
              <div className="zhCaption">
                <span>{activeDirection.target}</span>
                <p>{activeSegment?.translation || '等待翻译结果'}</p>
              </div>
            ) : (
              <div className="captionOff">
                <Volume2 size={24} />
                <p>语音播报模式</p>
              </div>
            )}
          </div>

          <div className="timelineHeader">
            <span>字幕时间线</span>
            <ChevronRight size={16} />
          </div>
          <div className="segmentList">
            {segments.length ? (
              segments.map((segment) => <SegmentRow key={segment.id} segment={segment} active={segment.id === activeId} />)
            ) : (
              <div className="emptyState">
                <Sparkles size={24} />
                <p>准备接收音频</p>
              </div>
            )}
          </div>
        </section>

      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
