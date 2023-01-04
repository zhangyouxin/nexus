import { Client } from 'chomex';
import { router as nexusRouter } from '../src/background/userRouter';
import { JSONRpcWrapper } from '../src/contentScript/JSONRpcWrapper';

import { describe, expect, test, beforeAll } from '@jest/globals';

beforeAll(() => {
  global.chrome.runtime.onMessage.addListener(nexusRouter.listener());
});

describe('when we have a user router', () => {
  test('calling "/users/create" should return created user with an "_id" field', () => {
    const client: Client = new Client(global.chrome.runtime);
    return client.message({ action: '/users/create', user: { name: 'eric', age: 12 } }).then((res) => {
      expect(res.data._id).toBeTruthy();
      expect(res.data.name).toBe('eric');
      expect(res.data.age).toBe(12);
      return Promise.resolve();
    });
  });
  test('calling "/users/create" with JSONRPC should return created user with an "_id" field', () => {
    const client: Client = new Client(global.chrome.runtime);
    const clientRpc = new JSONRpcWrapper(client);
    return clientRpc.request({ method: '/users/create', params: [{ user: { name: 'jack', age: 13 } }] }).then((res) => {
      expect(res.data._id).toBeTruthy();
      expect(res.data.name).toBe('jack');
      expect(res.data.age).toBe(13);
      return Promise.resolve();
    });
  });
});
