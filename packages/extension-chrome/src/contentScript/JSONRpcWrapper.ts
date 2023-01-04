import { Client } from 'chomex';

export class JSONRpcWrapper {
  constructor(private client: Client) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public request = ({ method, params }: { method: string; params: unknown[] }): Promise<any> => {
    if (method === '/users/create') {
      return this.client.message({ action: method, user: (params[0] as { user: object }).user! });
    }
    return this.client.message({ action: method, ...params });
  };
}
