import { messageListeners } from './listener';

function injectScript(): void {
  const script = document.createElement('script');
  script.async = false;
  script.src = chrome.runtime.getURL('inpage.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

window.addEventListener('message', (event) => {
  messageListeners.forEach((listener) => listener(event));
});

if (document.doctype?.name === 'html') {
  injectScript();
}
