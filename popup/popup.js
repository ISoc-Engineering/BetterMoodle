// Settings live in chrome.storage.local. Open Moodle tabs reload themselves via
// chrome.storage.onChanged in main.js, so changes apply immediately.
const DEFAULTS = { enabled: true, aggressive: false };
const enabled = document.getElementById('enabled');
const aggressive = document.getElementById('aggressive');

chrome.storage.local.get(Object.keys(DEFAULTS)).then((s) => {
  const v = { ...DEFAULTS, ...s };
  enabled.checked = v.enabled;
  aggressive.checked = v.aggressive;
  aggressive.disabled = !v.enabled;
});

enabled.addEventListener('change', () => {
  aggressive.disabled = !enabled.checked;
  chrome.storage.local.set({ enabled: enabled.checked });
});
aggressive.addEventListener('change', () => chrome.storage.local.set({ aggressive: aggressive.checked }));
