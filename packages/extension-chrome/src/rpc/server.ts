import { Endpoint } from 'webext-bridge';
import browser from 'webextension-polyfill';
import { errors } from '@nexus-wallet/utils';
import { DebugMethods, WalletMethods, ServerParams } from './types';
import { JSONRPCServer } from 'json-rpc-2.0';
import { createServicesFactory } from '../services';
import { whitelistMiddleware } from './middlewares/whitelistMiddleware';

export const server = new JSONRPCServer<ServerParams>();
server.applyMiddleware(whitelistMiddleware);

export function addMethod<K extends keyof (WalletMethods & DebugMethods)>(
  method: K,
  handler: (param: WalletMethods[K]['params'], context: ServerParams) => WalletMethods[K]['result'],
): void {
  server.addMethod(String(method), handler);
}

let servicesFactory = createServicesFactory();

export function createRpcServerParams(payload: { endpoint: Endpoint }): ServerParams {
  return {
    getRequesterAppInfo: async () => {
      const tab = await browser.tabs.get(payload.endpoint.tabId);
      if (!tab.url || !tab.favIconUrl) {
        errors.throwError(
          'It seems that there is no permission for "permissions.tab", please check if the "permissions.tab" is disabled',
        );
      }
      return { url: tab.url, favIconUrl: tab.favIconUrl };
    },

    resolveService: (k) => servicesFactory.get(k),
  };
}
