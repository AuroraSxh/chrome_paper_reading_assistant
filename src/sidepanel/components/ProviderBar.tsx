import React from 'react';
import type { ProviderId } from '../../lib/messages';
import { DEFAULT_MODELS, MODEL_LABELS } from '../../lib/llm';
import { useStore } from '../store';

const LABELS: Record<ProviderId, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Claude',
  custom: '自定义',
};

const CUSTOM_VALUE = '__custom__';

export function ProviderBar() {
  const cfg = useStore((s) => s.cfg);
  const provider = useStore((s) => s.provider);
  const model = useStore((s) => s.model);
  const setProvider = useStore((s) => s.setProvider);
  const setModel = useStore((s) => s.setModel);

  const knownModels = DEFAULT_MODELS[provider] ?? [];
  const labels = MODEL_LABELS[provider] ?? {};
  const isCustom = !knownModels.includes(model);
  const hasKey = !!cfg.providers[provider]?.apiKey;

  const onModelChange = (v: string) => {
    if (v === CUSTOM_VALUE) {
      const next = window.prompt('输入自定义模型 ID', model);
      if (next?.trim()) void setModel(next.trim());
      return;
    }
    void setModel(v);
  };

  return (
    <div className="flex gap-2 items-center px-3 py-2 border-b bg-gray-50 text-xs">
      <select
        className="border rounded px-1.5 py-0.5 bg-white"
        value={provider}
        onChange={(e) => setProvider(e.target.value as ProviderId)}
        title="选择 AI 服务商"
      >
        {(Object.keys(LABELS) as ProviderId[]).map((id) => (
          <option key={id} value={id}>{LABELS[id]}</option>
        ))}
      </select>
      <select
        className="border rounded px-1.5 py-0.5 flex-1 bg-white truncate"
        value={isCustom ? model : model}
        onChange={(e) => onModelChange(e.target.value)}
        title={`当前模型：${model}`}
      >
        {knownModels.map((m) => (
          <option key={m} value={m}>{labels[m] ?? m}</option>
        ))}
        {isCustom && (
          <option value={model}>{model}（自定义）</option>
        )}
        <option value={CUSTOM_VALUE}>✏️ 自定义…</option>
      </select>
      {!hasKey && (
        <span
          title="该 Provider 还未配置 API Key"
          className="shrink-0 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded cursor-pointer"
          onClick={() => chrome.runtime.openOptionsPage()}
        >缺少 Key</span>
      )}
      <button
        className="shrink-0 text-blue-600 hover:underline"
        onClick={() => chrome.runtime.openOptionsPage()}
      >设置</button>
    </div>
  );
}
