import browser from 'webextension-polyfill';
import { Router } from 'chomex';

const router = new Router();

router.on('NEXUS_INPAGE', () => {
  browser.windows.create({
    type: 'popup',
    focused: true,
    left: 200,
    width: 360,
    height: 600,
    url: 'popup.html',
  });
});

export { router };

chrome.runtime.onMessage.addListener(router.listener());
