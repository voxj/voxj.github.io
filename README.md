# Fictional Browser

## Clean install

```bash
rd /s /q node_modules package-lock.json
npm install
npm start
```

## Architecture

- **Preload script** (`webview-preload.js`) runs inside every page and intercepts link clicks
- Clicks are sent to parent via `ipcRenderer.sendToHost`
- Parent receives via `ipc-message` event and resolves URLs through registry
- **No `will-navigate`** — avoids the ERR_ABORTED loops entirely
- **Electron 30** — stable webview support

## How it works

- **Fiction mode** (purple): Every URL typed is looked up in `registry.json`. Mapped → loads backend. Not mapped → 404.
- **Real mode** (green): Normal internet browsing.
- Click **FICTION/REAL** button to toggle per-tab.

## Registry

```json
{
  "yourdomain.ex": { "url": "https://your-server.com/site/" }
}
```
