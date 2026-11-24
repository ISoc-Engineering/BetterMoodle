// Settings live in chrome.storage.local. Open Moodle tabs reload themselves via
// chrome.storage.onChanged in main.js (themes switch live, without a reload).
const DEFAULTS = { enabled: true, aggressive: false, theme: 'pop' };
const enabled = document.getElementById('enabled');
const aggressive = document.getElementById('aggressive');
const theme = document.getElementById('theme');

chrome.storage.local.get(Object.keys(DEFAULTS)).then((s) => {
  const v = { ...DEFAULTS, ...s };
  enabled.checked = v.enabled;
  aggressive.checked = v.aggressive;
  theme.value = v.theme;
  aggressive.disabled = theme.disabled = !v.enabled;
});

enabled.addEventListener('change', () => {
  aggressive.disabled = theme.disabled = !enabled.checked;
  chrome.storage.local.set({ enabled: enabled.checked });
});
aggressive.addEventListener('change', () => chrome.storage.local.set({ aggressive: aggressive.checked }));
theme.addEventListener('change', () => chrome.storage.local.set({ theme: theme.value }));
