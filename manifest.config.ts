import { defineManifest } from '@crxjs/vite-plugin';

const PUBLISHER_MATCHES = [
  'https://www.nature.com/*',
  'https://*.nature.com/*',
  'https://www.cell.com/*',
  'https://www.science.org/*',
  'https://www.sciencedirect.com/*',
  'https://onlinelibrary.wiley.com/*',
  'https://link.springer.com/*',
  'https://www.pnas.org/*',
  'https://journals.plos.org/*',
  'https://academic.oup.com/*',
  'https://pubs.acs.org/*',
  'https://pubs.rsc.org/*',
  'https://www.embopress.org/*',
  'https://elifesciences.org/*',
  'https://www.biorxiv.org/*',
  'https://www.medrxiv.org/*',
];

export default defineManifest({
  manifest_version: 3,
  name: 'Paper Reading Assistant',
  description: '在主流学术期刊页面调用 AI 进行总结与对话，记录阅读历史',
  version: '0.1.0',
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'clipboardRead'],
  host_permissions: [
    ...PUBLISHER_MATCHES,
    'https://api.deepseek.com/*',
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    // Required to fetch arbitrary PDFs the user opens in any tab. The
    // extension only fetches when the active tab is a .pdf URL and the
    // user clicks the action.
    '<all_urls>',
    // Local PDFs (file://) need both this entry AND the user to toggle
    // "Allow access to file URLs" in chrome://extensions for this extension.
    'file:///*',
  ],
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: PUBLISHER_MATCHES,
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
  options_page: 'src/options/index.html',
  action: {
    default_title: 'Paper Reading Assistant',
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
  },
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
});
