// This script runs inside every webview page
const { ipcRenderer } = require('electron');

function sendNav(url) {
  ipcRenderer.sendToHost('navigate', url);
}

// Intercept ALL link clicks
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link) return;

  const href = link.getAttribute('href');
  if (!href) return;

  // Allow javascript: mailto: tel: anchors
  if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return;
  }

  // Don't intercept same-page anchors unless they have an actual path
  if (href.startsWith('#')) return;

  e.preventDefault();
  e.stopPropagation();
  sendNav(href);
}, true);

// Override window.open
const origOpen = window.open;
window.open = function(url, target, features) {
  if (url && !url.startsWith('javascript:')) {
    sendNav(url);
    return null;
  }
  return origOpen.apply(window, arguments);
};
