(() => {
  const HIDDEN_ATTR = 'data-hide-shorts';
  const SPA_EVENTS = ['yt-page-data-updated', 'yt-navigate-finish', 'spfdone', 'yt-navigate-start'];

  const DEFAULT_SETTINGS = {
    hideShelves: true,
    redirectShorts: true,
    hideSearch: true,
    strictMode: false,
    allowUntil: 0,
    statsDate: todayKey(),
    statsCount: 0
  };

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    observer: null,
    scanScheduled: false,
    statsSavePending: false
  };

  const storageGet = (keys) =>
    new Promise((resolve) => {
      chrome.storage.sync.get(keys ?? null, (items) => {
        if (chrome.runtime?.lastError) {
          console.error('[Hide Shorts] storage.get failed', chrome.runtime.lastError);
        }
        resolve(items);
      });
    });

  const storageSet = (items) =>
    new Promise((resolve) => {
      chrome.storage.sync.set(items, () => {
        if (chrome.runtime?.lastError) {
          console.error('[Hide Shorts] storage.set failed', chrome.runtime.lastError);
        }
        resolve();
      });
    });

  const RULES = [
    {
      selector: 'ytd-rich-section-renderer',
      getTarget: (node) => (containsShortsLink(node) ? node : null),
      isEnabled: (settings) => settings.hideShelves
    },
    {
      selector: 'ytd-reel-shelf-renderer',
      isEnabled: (settings) => settings.hideShelves || settings.hideSearch
    },
    {
      selector: 'ytd-reel-item-renderer',
      isEnabled: (settings) => settings.hideShelves || settings.hideSearch
    },
    {
      selector: 'ytd-rich-item-renderer a[href^="/shorts/"]',
      getTarget: (node) => node.closest('ytd-rich-item-renderer'),
      isEnabled: (settings) => settings.hideShelves || settings.strictMode
    },
    {
      selector: 'ytd-video-renderer a[href^="/shorts/"]',
      getTarget: (node) => node.closest('ytd-video-renderer'),
      isEnabled: (settings) => settings.hideSearch || settings.strictMode
    },
    {
      selector: 'ytd-grid-video-renderer a[href^="/shorts/"]',
      getTarget: (node) => node.closest('ytd-grid-video-renderer'),
      isEnabled: (settings) => settings.hideShelves || settings.strictMode
    },
    {
      selector: 'ytd-compact-video-renderer a[href^="/shorts/"]',
      getTarget: (node) => node.closest('ytd-compact-video-renderer'),
      isEnabled: (settings) => settings.hideShelves || settings.strictMode
    },
    {
      selector: 'ytd-thumbnail-overlay-time-status-renderer[overlay-style="SHORTS"]',
      getTarget: (node) => node.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer'),
      isEnabled: (settings) => settings.strictMode
    },
    {
      selector: 'ytd-guide-entry-renderer a[title="Shorts"]',
      getTarget: (node) => node.closest('ytd-guide-entry-renderer'),
      isEnabled: (settings) => settings.hideShelves
    },
    {
      selector: 'ytd-mini-guide-entry-renderer a[title="Shorts"]',
      getTarget: (node) => node.closest('ytd-mini-guide-entry-renderer'),
      isEnabled: (settings) => settings.hideShelves
    },
    {
      selector: 'tp-yt-paper-tab a[href^="/shorts"]',
      getTarget: (node) => node.closest('tp-yt-paper-tab, yt-tab-shape'),
      isEnabled: (settings) => settings.hideShelves || settings.strictMode
    },
    {
      selector: 'yt-chip-cloud-chip-renderer a[href^="/shorts"]',
      getTarget: (node) => node.closest('yt-chip-cloud-chip-renderer'),
      isEnabled: (settings) => settings.hideShelves || settings.strictMode
    }
  ];

  const init = async () => {
    await loadSettings();
    attachStorageListener();
    observeDomWhenReady();
    SPA_EVENTS.forEach((event) => window.addEventListener(event, handleSpaEvent, { passive: true }));
    window.addEventListener('popstate', handleSpaEvent, { passive: true });
    maybeRedirect();
    scheduleScan();
  };

  const loadSettings = async () => {
    const stored = await storageGet(null);
    const normalized = { ...DEFAULT_SETTINGS, ...stored };
    if (normalized.statsDate !== today()) {
      normalized.statsDate = today();
      normalized.statsCount = 0;
      await storageSet({ statsDate: normalized.statsDate, statsCount: normalized.statsCount });
    }
    state.settings = normalized;
  };

  const attachStorageListener = () => {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      let needsScan = false;
      let shouldRestore = false;
      let shouldRedirectCheck = false;
      Object.entries(changes).forEach(([key, { newValue }]) => {
        state.settings[key] = newValue;
        if (['hideShelves', 'hideSearch', 'strictMode'].includes(key)) {
          needsScan = true;
          if (newValue === false) shouldRestore = true;
        }
        if (key === 'allowUntil') {
          if (isTemporarilyAllowed()) {
            shouldRestore = true;
          } else {
            needsScan = true;
            shouldRedirectCheck = true;
          }
        }
        if (key === 'redirectShorts') {
          shouldRedirectCheck = true;
        }
      });
      if (shouldRestore) restoreHiddenElements();
      if (needsScan) scheduleScan();
      if (shouldRedirectCheck) maybeRedirect();
    });
  };

  const observeDomWhenReady = () => {
    if (state.observer || !document) return;
    if (!document.body) {
      requestAnimationFrame(observeDomWhenReady);
      return;
    }

    state.observer = new MutationObserver(scheduleScan);
    state.observer.observe(document.body, { childList: true, subtree: true });
  };

  const handleSpaEvent = () => {
    maybeRedirect();
    scheduleScan();
  };

  const containsShortsLink = (node) =>
    Boolean(
      node?.querySelector?.(
        'a[href^="/shorts/"], ytd-reel-video-renderer, ytd-reel-item-renderer, ytd-reel-shelf-renderer'
      )
    );

  const isTemporarilyAllowed = () => Date.now() < state.settings.allowUntil;

  const hideElement = (element) => {
    if (!element || element.hasAttribute(HIDDEN_ATTR)) return false;
    element.setAttribute(HIDDEN_ATTR, 'true');
    element.style.setProperty('display', 'none', 'important');
    return true;
  };

  const restoreHiddenElements = () => {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((node) => {
      node.style.removeProperty('display');
      node.removeAttribute(HIDDEN_ATTR);
    });
  };

  const isRuleEnabled = (rule) => (rule.isEnabled ? rule.isEnabled(state.settings) : true);

  const scheduleScan = () => {
    if (state.scanScheduled) return;
    state.scanScheduled = true;
    requestAnimationFrame(() => {
      state.scanScheduled = false;
      scanForShorts();
    });
  };

  const scanForShorts = () => {
    if (isTemporarilyAllowed()) return;
    let anyRuleActive = false;
    RULES.forEach((rule) => {
      if (!isRuleEnabled(rule)) return;
      anyRuleActive = true;
      document.querySelectorAll(rule.selector).forEach((match) => {
        const target = rule.getTarget ? rule.getTarget(match) : match;
        if (target && hideElement(target)) recordBlocked();
      });
    });
    if (!anyRuleActive && state.observer) {
      state.observer.disconnect();
      state.observer = null;
    } else if (anyRuleActive && !state.observer && document.body) {
      observeDomWhenReady();
    }
  };

  const recordBlocked = () => {
    const todayKeyValue = today();
    if (state.settings.statsDate !== todayKeyValue) {
      state.settings.statsDate = todayKeyValue;
      state.settings.statsCount = 0;
    }
    state.settings.statsCount += 1;
    scheduleStatsSave();
  };

  const scheduleStatsSave = () => {
    if (state.statsSavePending) return;
    state.statsSavePending = true;
    setTimeout(() => {
      state.statsSavePending = false;
      const payload = {
        statsDate: state.settings.statsDate,
        statsCount: state.settings.statsCount
      };
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime?.lastError) {
          console.error('[Hide Shorts] failed saving stats', chrome.runtime.lastError);
        }
      });
    }, 1000);
  };

  const today = () => todayKey();

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }

  const isShortsUrl = (url) =>
    url.pathname.startsWith('/shorts') ||
    url.searchParams.get('feature') === 'shorts' ||
    url.searchParams.get('app') === 'desktop_shorts_app' ||
    (url.searchParams.get('pp') || '').includes('shorts');

  const maybeRedirect = () => {
    if (!state.settings.redirectShorts || isTemporarilyAllowed()) return;
    const url = new URL(window.location.href);
    if (!isShortsUrl(url)) return;

    const redirectTarget = 'https://www.youtube.com/';
    window.location.replace(redirectTarget);
  };

  init();
})();
