import React, { useEffect, useState } from 'react';
import type { AppConfig, ProviderId } from '../lib/messages';
import { defaultConfig, loadConfig, saveConfig } from '../lib/config';
import { DEFAULT_BASE_URL, DEFAULT_MODELS, MODEL_LABELS } from '../lib/llm';
import { getSubfolder, getVaultHandle, pickVault, setSubfolder, setVaultHandle } from '../lib/obsidian';

const PROVIDERS: { id: ProviderId; label: string; hint?: string }[] = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  {
    id: 'custom',
    label: '自定义 (OpenAI 兼容)',
    hint: '支持任何 OpenAI 兼容协议的服务：智谱 GLM、Moonshot、阶跃、通义千问、火山方舟、SiliconFlow、OpenRouter、Groq、Together、本地 Ollama 等。在 Base URL 填到 /v1 这一级，模型 ID 按服务商文档填。',
  },
];

export function Options() {
  const [cfg, setCfg] = useState<AppConfig>(defaultConfig);
  const [saved, setSaved] = useState(false);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [subfolder, setSubfolderState] = useState('');
  const [vaultMsg, setVaultMsg] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then(setCfg);
    getVaultHandle().then((h) => setVaultName(h?.name ?? null));
    getSubfolder().then(setSubfolderState);
  }, []);

  const onPickVault = async () => {
    setVaultMsg(null);
    try {
      const h = await pickVault();
      setVaultName(h?.name ?? null);
      setVaultMsg('已设置');
      setTimeout(() => setVaultMsg(null), 1500);
    } catch (e) {
      setVaultMsg(e instanceof Error ? e.message : String(e));
    }
  };
  const onClearVault = async () => {
    await setVaultHandle(null);
    setVaultName(null);
  };
  const onSubfolderBlur = async () => {
    await setSubfolder(subfolder);
  };

  const updateProv = (id: ProviderId, patch: Partial<AppConfig['providers'][ProviderId]>) => {
    setCfg((c) => ({
      ...c,
      providers: { ...c.providers, [id]: { ...c.providers[id], ...patch } },
    }));
  };

  const handleSave = async () => {
    await saveConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Paper Reading Assistant 设置</h1>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-1">默认 Provider</label>
        <select
          className="border rounded px-2 py-1 w-full"
          value={cfg.activeProvider}
          onChange={(e) => setCfg({ ...cfg, activeProvider: e.target.value as ProviderId })}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {PROVIDERS.map((p) => {
        const pc = cfg.providers[p.id];
        return (
          <fieldset key={p.id} className="border rounded p-4 mb-4">
            <legend className="px-2 text-sm font-semibold">{p.label}</legend>
            {p.hint && <p className="text-[11px] text-gray-500 mb-2">{p.hint}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">API Key</label>
                <input
                  type="password"
                  className="border rounded px-2 py-1 w-full font-mono text-xs"
                  value={pc.apiKey}
                  onChange={(e) => updateProv(p.id, { apiKey: e.target.value })}
                  placeholder={p.id === 'deepseek' ? 'sk-...' : ''}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Base URL</label>
                <input
                  className="border rounded px-2 py-1 w-full font-mono text-xs"
                  value={pc.baseURL || ''}
                  onChange={(e) => updateProv(p.id, { baseURL: e.target.value })}
                  placeholder={DEFAULT_BASE_URL[p.id]}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">默认模型</label>
                <div className="flex gap-2">
                  <select
                    className="border rounded px-2 py-1 flex-1 text-xs bg-white"
                    value={DEFAULT_MODELS[p.id].includes(pc.defaultModel) ? pc.defaultModel : '__custom__'}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        const next = window.prompt('输入自定义模型 ID', pc.defaultModel);
                        if (next?.trim()) updateProv(p.id, { defaultModel: next.trim() });
                      } else {
                        updateProv(p.id, { defaultModel: e.target.value });
                      }
                    }}
                  >
                    {DEFAULT_MODELS[p.id].map((m) => (
                      <option key={m} value={m}>{MODEL_LABELS[p.id]?.[m] ?? m}</option>
                    ))}
                    {!DEFAULT_MODELS[p.id].includes(pc.defaultModel) && (
                      <option value={pc.defaultModel}>{pc.defaultModel}（自定义）</option>
                    )}
                    <option value="__custom__">✏️ 自定义…</option>
                  </select>
                  <input
                    className="border rounded px-2 py-1 w-40 font-mono text-xs"
                    value={pc.defaultModel}
                    onChange={(e) => updateProv(p.id, { defaultModel: e.target.value })}
                    placeholder="或直接输入 ID"
                  />
                </div>
              </div>
            </div>
          </fieldset>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded"
          onClick={handleSave}
        >保存</button>
        {saved && <span className="text-green-600 text-sm">已保存</span>}
      </div>

      <fieldset className="border rounded p-4 mt-6">
        <legend className="px-2 text-sm font-semibold">Obsidian 导出</legend>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Vault 文件夹</label>
            <div className="flex items-center gap-2">
              <button
                className="border rounded px-2 py-1 text-xs hover:bg-gray-50"
                onClick={onPickVault}
              >{vaultName ? '重新选择' : '选择文件夹…'}</button>
              {vaultName ? (
                <>
                  <span className="text-xs text-gray-700 font-mono">{vaultName}</span>
                  <button className="text-xs text-red-500 hover:underline" onClick={onClearVault}>清除</button>
                </>
              ) : (
                <span className="text-xs text-gray-400">未设置</span>
              )}
              {vaultMsg && <span className="text-xs text-green-600">{vaultMsg}</span>}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              选择你的 Obsidian Vault 根目录。浏览器会记住授权；如果重启后失效，导出时会再次询问。
            </p>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">子目录（可选）</label>
            <input
              className="border rounded px-2 py-1 w-full font-mono text-xs"
              value={subfolder}
              onChange={(e) => setSubfolderState(e.target.value)}
              onBlur={onSubfolderBlur}
              placeholder="如 Papers/Reading 或 Inbox/Reading"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              留空则写入 Vault 根目录；多层用 / 分隔，目录不存在会自动创建。
            </p>
          </div>
        </div>
      </fieldset>

      <p className="text-xs text-gray-500 mt-6">
        API Key 仅保存在本地浏览器（chrome.storage.local），不会上传任何服务器。
        所有 LLM 请求由扩展的 Service Worker 直接发往各 Provider。
      </p>
    </div>
  );
}
