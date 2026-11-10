import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/cascadia-code/400.css';
import '@fontsource/cascadia-code/700.css';
import '@xterm/xterm/css/xterm.css';
import './styles.css';

async function start(): Promise<void> {
  // Without Electron (browser preview), install a mock hub before loading the store.
  const preview = !('hub' in window);
  if (preview) await (await import('./preview/mock-hub')).installMockHub();
  const [{ createApp }, { default: App }, store] = await Promise.all([import('vue'), import('./App.vue'), import('./store')]);
  await store.boot();
  createApp(App).mount('#app');
  if (preview) (await import('./preview/demo')).openDemoTabs();
}

void start();
