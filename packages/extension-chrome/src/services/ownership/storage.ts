import { Storage } from '@nexus-wallet/types';
import { HexString, Script, Transaction, OutPoint, Cell } from '@ckb-lumos/lumos';

export interface ScriptInfoDb {
  getAll(): Promise<ScriptInfo[]>;
  setAll(infos: ScriptInfo[]): Promise<void>;
  filterByMatch(filter: Partial<ScriptInfo>): Promise<ScriptInfo[]>;
}

export interface TransactionManagerDb {
  getAll(): Promise<TxManagerStorageScheme>;
  setAll(infos: TxManagerStorageScheme): Promise<void>;
  getTransactions(): Promise<Transaction[]>;
  getCreatedCells(): Promise<Cell[]>;
  getSpentCellOutpoints(): Promise<OutPoint[]>;
  addTransaction(tx: Transaction): Promise<void>;
  addCreatedCell(cell: Cell): Promise<void>;
  addSpentCellOutpoint(outpoint: OutPoint): Promise<void>;
  setTransactions(transactions: Transaction[]): Promise<void>;
  setCreatedCells(cells: Cell[]): Promise<void>;
  setSpentCellOutpoints(outpoints: OutPoint[]): Promise<void>;
}

export interface TxManagerStorageScheme {
  transactions: Transaction[];
  spentCellOutpoints: OutPoint[];
  createdCells: Cell[];
}

export type TxManagerStorage = Storage<Record<NetworkId, TxManagerStorageScheme>>;
export type OwnershipStorage = Storage<Record<NetworkId, ScriptInfo[]>>;

export interface ScriptInfo {
  // an auto-incremented id
  id: number;
  lock: Script;
  publicKey: HexString;
  parentPath: string;
  childIndex: number;
  status: LockStatus;
  scriptHash: HexString;
}

export type LockStatus = 'OnChain' | 'OffChain';

export type NetworkId = string;

export function createScriptInfoDb(payload: { networkId: string; storage: OwnershipStorage }): ScriptInfoDb {
  const { networkId, storage } = payload;

  const storageKey = `${networkId}:scriptInfo`;

  async function getAll() {
    const infos = await storage.getItem(storageKey);
    if (!infos) {
      await storage.setItem(storageKey, []);
    }

    return infos ?? [];
  }

  return {
    getAll: async () => {
      return getAll();
    },
    setAll: async (infos) => {
      return storage.setItem(storageKey, infos);
    },
    filterByMatch: async (match) => {
      const infos = await getAll();
      return infos.filter((info) => {
        return Object.keys(match).every((key) => {
          let k = key as keyof ScriptInfo;
          return info[k] === match[k];
        });
      });
    },
  };
}

export function createMagagerDb(payload: { networkId: string; storage: TxManagerStorage }): TransactionManagerDb {
  const { networkId, storage } = payload;

  const storageKey = `${networkId}:txManager`;

  async function getAll() {
    const infos = await storage.getItem(storageKey);
    if (!infos) {
      await storage.setItem(storageKey, {
        transactions: [],
        spentCellOutpoints: [],
        createdCells: [],
      });
    }

    return (
      infos ?? {
        transactions: [],
        spentCellOutpoints: [],
        createdCells: [],
      }
    );
  }

  return {
    getAll: async () => {
      return getAll();
    },
    setAll: async (infos) => {
      return storage.setItem(storageKey, infos);
    },
    getTransactions: async () => {
      return (await getAll()).transactions;
    },
    getCreatedCells: async () => {
      return (await getAll()).createdCells;
    },
    getSpentCellOutpoints: async () => {
      return (await getAll()).spentCellOutpoints;
    },
    addTransaction: async (tx) => {
      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        transactions: [...oldStorage.transactions, tx],
      });
    },
    addCreatedCell: async (cell) => {
      console.log('addCreatedCell', cell);

      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        createdCells: [...oldStorage.createdCells, cell],
      });
    },
    addSpentCellOutpoint: async (outpoint) => {
      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        spentCellOutpoints: [...oldStorage.spentCellOutpoints, outpoint],
      });
    },
    setTransactions: async (transactions) => {
      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        transactions,
      });
    },
    setCreatedCells: async (cells) => {
      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        createdCells: cells,
      });
    },
    setSpentCellOutpoints: async (outpoints) => {
      const oldStorage = await getAll();
      return storage.setItem(storageKey, {
        ...oldStorage,
        spentCellOutpoints: outpoints,
      });
    },
  };
}
