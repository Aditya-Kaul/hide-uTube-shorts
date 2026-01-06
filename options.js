(() => {
  const TEN_MIN_MS = 10 * 60 * 1000;
  const DEFAULT_SETTINGS = {
    hideShelves: true,
    redirectShorts: true,
    hideSearch: true,
    strictMode: false,
    allowUntil: 0,
    statsDate: todayKey(),
    statsCount: 0
  };

  const elements = {
    hideShelves: document.getElementById('hide-shelves'),
    redirectShorts: document.getElementById('redirect-shorts'),
    hideSearch: document.getElementById('hide-search'),
    strictMode: document.getElementById('strict-mode'),
    allowButton: document.getElementById('allow-button'),
    allowStatus: document.getElementById('allow-status'),
    stats: document.getElementById('shorts-count')
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let allowTimer = null;

  const storageGet = (keys) =>
    new Promise((resolve) => {
      chrome.storage.sync.get(keys ?? null, (items) => {
        resolve(items);
      });
    });

  const storageSet = (items) =>
    new Promise((resolve) => {
      chrome.storage.sync.set(items, () => resolve());
    });

  const init = async () => {
    currentSettings = await loadSettings();
    applySettings(currentSettings);
    registerEvents();
    chrome.storage.onChanged.addListener(handleStorageChange);
  };

  const loadSettings = async () => {
    const stored = await storageGet(null);
    const normalized = { ...DEFAULT_SETTINGS, ...stored };
    if (normalized.statsDate !== todayKey()) {
      normalized.statsDate = todayKey();
      normalized.statsCount = 0;
      await storageSet({ statsDate: normalized.statsDate, statsCount: normalized.statsCount });
    }
    return normalized;
  };

  const registerEvents = () => {
    elements.hideShelves.addEventListener('change', handleToggle('hideShelves'));
    elements.redirectShorts.addEventListener('change', handleToggle('redirectShorts'));
    elements.hideSearch.addEventListener('change', handleToggle('hideSearch'));
    elements.strictMode.addEventListener('change', handleToggle('strictMode'));
    elements.allowButton.addEventListener('click', () => {
      const allowUntil = Date.now() + TEN_MIN_MS;
      currentSettings.allowUntil = allowUntil;
      storageSet({ allowUntil });
      updateAllowStatus(allowUntil);
    });
  };

  const handleToggle = (key) => (event) => {
    const value = event.target.checked;
    currentSettings[key] = value;
    storageSet({ [key]: value });
  };

  const handleStorageChange = (changes, area) => {
    if (area !== 'sync') return;
    Object.entries(changes).forEach(([key, { newValue }]) => {
      currentSettings[key] = newValue;
      if (key === 'allowUntil') {
        updateAllowStatus(newValue);
      } else if (key === 'statsCount' || key === 'statsDate') {
        updateStats();
      } else if (key in CHECKBOX_MAP) {
        const el = CHECKBOX_MAP[key];
        if (el) el.checked = Boolean(newValue);
      }
    });
  };

  const CHECKBOX_MAP = {
    hideShelves: elements.hideShelves,
    redirectShorts: elements.redirectShorts,
    hideSearch: elements.hideSearch,
    strictMode: elements.strictMode
  };

  const applySettings = (settings) => {
    Object.entries(CHECKBOX_MAP).forEach(([key, input]) => {
      input.checked = Boolean(settings[key]);
    });
    updateAllowStatus(settings.allowUntil);
    updateStats();
  };

  const updateAllowStatus = (rawAllowUntil) => {
    const allowUntil = Number(rawAllowUntil) || 0;
    if (allowTimer) {
      clearInterval(allowTimer);
      allowTimer = null;
    }

    const render = () => {
      const remaining = allowUntil - Date.now();
      if (remaining <= 0) {
        elements.allowStatus.textContent = 'Shorts currently blocked.';
        if (allowTimer) {
          clearInterval(allowTimer);
          allowTimer = null;
        }
        return;
      }
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      elements.allowStatus.textContent = `Shorts temporarily allowed for ${minutes}m ${seconds
        .toString()
        .padStart(2, '0')}s`;
    };

    render();
    if (allowUntil > Date.now()) {
      allowTimer = setInterval(render, 1000);
    }
  };

  const updateStats = () => {
    if (currentSettings.statsDate !== todayKey()) {
      currentSettings.statsDate = todayKey();
      currentSettings.statsCount = 0;
      storageSet({ statsDate: currentSettings.statsDate, statsCount: 0 });
    }
    elements.stats.textContent = `Shorts blocked today: ${currentSettings.statsCount}`;
  };

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
