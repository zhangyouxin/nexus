declare global {
  interface Ckb {
    version: string;
  }

  interface Window {
    ckb: Ckb;
  }
}

const fakeCkbProvider = {
  version: '0.0.1',
  enable() {
    window.postMessage({ target: 'NEXUS_INPAGE' });
  },
  createUser(user: { name: string; age: number }) {
    window.postMessage({ target: '/users/create', user });
  },
  getLiveCells() {
    return new Promise((resolve) => setTimeout(() => resolve([]), 200));
  },
};

window.ckb = Object.freeze(fakeCkbProvider);
export {};
