import { sendMessage } from 'webext-bridge';
import { Client } from 'chomex';

function injectScript(): void {
  const script = document.createElement('script');
  script.async = false;
  script.src = chrome.runtime.getURL('inpage.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

window.addEventListener('message', (event) => {
  if (event.data.target === 'NEXUS_INPAGE') {
    sendMessage('notification', {}, 'background');
    console.log('NEXUS_INPAGE received message from content script:', event);
  } else if (event.data.target === '/users/create') {
    const client = new Client(chrome.runtime);
    client.message('/users/create', { user: event.data.user }).then((response) => {
      console.log('NEXUS_INPAGE create user response:', response);
    });
  }
});

if (document.doctype?.name === 'html') {
  injectScript();
}
