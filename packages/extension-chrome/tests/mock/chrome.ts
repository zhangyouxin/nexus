/* eslint-disable @typescript-eslint/no-explicit-any */
interface Channel {
  onMessage: {
    addListener: (arg: any) => any;
    listenerFunc?: (...arg: any[]) => any;
  };
  sendMessage: (...arg: any[]) => any;
}

const runtime: Channel = {
  onMessage: {
    addListener: (listenerFunc) => {
      runtime.onMessage.listenerFunc = listenerFunc;
    },
  },
  sendMessage: (message, sendResponse) => {
    if (message.action === '/empty') {
      sendResponse();
    }
    //@ts-ignore
    runtime.onMessage.listenerFunc(message, this, (response) => {
      sendResponse(response);
    });
  },
};

const tabs: Channel = {
  onMessage: {
    addListener: (listenerFunc) => {
      tabs.onMessage.listenerFunc = listenerFunc;
    },
  },
  sendMessage: (tabId, message, sendResponse) => {
    // In real chrome module, it's gonna be dispatched by tabId.
    // To simulate that, instead of dispatching by tabId,
    // it just embeds `tab` object as given.
    message.tab = { id: tabId };
    //@ts-ignore
    tabs.onMessage.listenerFunc(message, this, (response) => {
      sendResponse(response);
    });
  },
};

Object.defineProperty(global, 'chrome', {
  value: {
    runtime,
    tabs,
  },
});
