# Hide YouTube Shorts

A lightweight browser extension that removes YouTube Shorts from the interface to help you stay focused and productive.

This extension works in real time, adapts to YouTube’s Single Page Application (SPA) behavior, and provides configurable controls through an options page.

---

## ✨ Features

- Hide Shorts from:
  - Home feed
  - Search results
  - Sidebar navigation
  - Shorts shelves and chips
- Optional redirection of `/shorts` URLs
- Strict mode for aggressive hiding
- Temporary allowance for Shorts (10-minute break)
- Daily statistics for Shorts blocked
- SPA-aware (no page reloads required)
- Zero polling, high-performance DOM observation

---

## 🧠 How It Works

The extension consists of three main parts:

### 1. Content Script (`content.js`)
- Injected into YouTube pages
- Observes DOM mutations using `MutationObserver`
- Listens to YouTube SPA navigation events
- Hides Shorts elements dynamically
- Updates block statistics

### 2. Options Page (`options.html`, `options.js`)
- Provides user controls for all features
- Stores settings using `chrome.storage.sync`
- Displays daily statistics
- Allows temporary Shorts access

### 3. Shared State (`chrome.storage`)
- Acts as the communication layer between:
  - Options page
  - Content script
- Enables real-time updates without reloads

---

## ⚙️ Configuration Options

| Setting | Description |
|------|------------|
| Hide Shorts shelves | Removes Shorts shelves from feeds |
| Redirect Shorts URLs | Redirects `/shorts` links away |
| Hide Shorts in search | Removes Shorts from search results |
| Strict mode | Aggressive detection and hiding |
| Temporary allow | Allows Shorts for 10 minutes |
| Daily stats | Tracks Shorts blocked per day |



---

## 🚀 Installation (Development)

1. Clone the repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the project folder

---

## 🔐 Permissions Used

- `storage` – to save user preferences and stats
- `https://www.youtube.com/*` – to modify YouTube pages

---

## 🧩 Design Principles

- No frameworks in content scripts
- Event-driven, not polling
- Idempotent DOM operations
- Minimal performance overhead
- Future-proof against YouTube UI changes

---

## 📌 Notes

- This extension does not collect or transmit any personal data
- All logic runs locally in the browser
- Works with YouTube’s dynamic SPA navigation
