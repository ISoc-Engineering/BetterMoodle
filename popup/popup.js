const box = document.getElementById('enabled');
chrome.storage.local.get('enabled').then(({ enabled }) => { box.checked = enabled !== false; });
// Open Moodle tabs reload themselves via chrome.storage.onChanged in main.js.
box.addEventListener('change', () => chrome.storage.local.set({ enabled: box.checked }));
