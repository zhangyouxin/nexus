import { List, Set } from 'immutable';
import { values, blockchain, Transaction, Cell, Script, utils } from '@ckb-lumos/base';
import { RPC } from '@ckb-lumos/rpc';
import { RPC as RpcType } from '@ckb-lumos/rpc/lib/types/rpc';
import { createRpcClient } from './backendUtils';
import isEqual from 'lodash.isequal';
import { TransactionManagerDb } from '../storage';

function defaultLogger(level: string, message: string) {
  console.log(`[${level}] ${message}`);
}

type Props = {
  rpcUrl: string;
  txManagerDb: TransactionManagerDb;
  options?: {
    pollIntervalSeconds?: number;
  };
};

type RPCClient = ReturnType<typeof createRpcClient>;

const getTxHashesByLocks = async (lock: Script, client: RPCClient): Promise<String[]> => {
  const response = await client.request<RpcType.GetTransactionsResult>('get_transactions', [
    {
      script: {
        code_hash: lock.codeHash,
        hash_type: lock.hashType,
        args: lock.args,
      },
      script_type: 'lock',
      search_type: 'exact',
    },
    'asc',
    '0x64',
  ]);
  return response.objects.map((res) => res.tx_hash);
};

interface TransactionManager {
  start(): void;
  stop(): void;
  sendTransaction(tx: Transaction): Promise<string>;
  getCells(locks: Script[]): Promise<Cell[]>;
}

export class DefaultTransactionManager implements TransactionManager {
  logger: typeof defaultLogger;
  running: boolean;
  pollIntervalSeconds: number;
  rpc: RPC;
  client: RPCClient;
  txManagerDb: TransactionManagerDb;
  constructor(payload: Props) {
    this.rpc = new RPC(payload.rpcUrl);
    this.logger = defaultLogger;
    this.running = false;
    this.pollIntervalSeconds = payload?.options?.pollIntervalSeconds || 10;
    this.client = createRpcClient(payload.rpcUrl);
    this.txManagerDb = payload.txManagerDb;
    defaultLogger('info', 'TransactionManager created!');
  }

  async getCells(locks: Script[]): Promise<Cell[]> {
    const cells = await this.txManagerDb.getCreatedCells();
    return cells.filter((cell) =>
      locks.some((lock) => isEqual(utils.computeScriptHash(cell.cellOutput.lock), utils.computeScriptHash(lock))),
    );
  }

  // Start a monitor of network with the following 2 changes:
  // * A transaction is accepted on chain.
  // * A transaction is ruled out due to another transaction spends its input(s).
  // TODO: right now this works by polling the data periodically, later we might switch
  // to a notification based mechanism.
  start(): void {
    this.running = true;
    void this._loopMonitor();
  }

  stop(): void {
    this.running = false;
  }

  private async _loopMonitor(): Promise<void> {
    try {
      await this._checkTransactions();
    } catch (e) {
      this.logger('error', `Error checking transactions: ${e}`);
    }
    if (this.running) {
      setTimeout(() => this._loopMonitor(), this.pollIntervalSeconds * 1000);
    }
  }

  private async _checkTransactions(): Promise<void> {
    let filteredTransactions = Set<Transaction>();
    const txs = await this.txManagerDb.getTransactions();
    for await (let transactionValue of txs) {
      /* Extract tx value from TransactionValue wrapper */
      let tx = transactionValue;
      /* First, remove all transactions that use already spent cells */
      for (const input of tx.inputs) {
        const cell = await this.rpc.getLiveCell(input.previousOutput, false);
        if (!cell) {
          continue;
        }
      }
      /* Second, remove all transactions that have already been committed */
      const output = tx.outputs[0];
      if (output) {
        const txHashes = await getTxHashesByLocks(output.lock, this.client);
        // remove witnesses property because it's redundant for calculating txHash
        // delete tx.witnesses;
        const targetTxHash = new values.RawTransactionValue(tx, {
          validate: false,
        }).hash();
        if (txHashes.includes(targetTxHash)) {
          continue;
        }
      }
      filteredTransactions = filteredTransactions.add(transactionValue);
    }
    await this.txManagerDb.setTransactions(filteredTransactions.toArray());
    let createdCells = List<Cell>();
    filteredTransactions.forEach((transactionValue) => {
      const tx = transactionValue;
      tx.outputs.forEach((output, i) => {
        const outPoint = {
          txHash: tx.hash!,
          index: '0x' + i.toString(16),
        };
        createdCells = createdCells.push({
          outPoint,
          cellOutput: output,
          data: tx.outputsData[i],
        });
      });
    });
    await this.txManagerDb.setCreatedCells(createdCells.toArray());
  }

  async sendTransaction(tx: Transaction): Promise<string> {
    // check if the input tx is valid
    blockchain.Transaction.pack(tx);
    const spentCellOutpoints = await this.txManagerDb.getSpentCellOutpoints();
    tx.inputs.forEach((input) => {
      if (spentCellOutpoints.some((spentCell) => isEqual(spentCell, input.previousOutput))) {
        throw new Error(
          `OutPoint ${input.previousOutput.txHash}@${input.previousOutput.index} has already been spent!`,
        );
      }
    });
    const txHash = await this.rpc.sendTransaction(tx);
    tx.hash = txHash;
    await this.txManagerDb.addTransaction(tx);
    const addSpentCells = tx.inputs.map((input) => {
      return this.txManagerDb.addSpentCellOutpoint(input.previousOutput);
    });
    await Promise.all(addSpentCells);

    for (let i = 0; i < tx.outputs.length; i++) {
      const op = {
        txHash: txHash,
        index: `0x${i.toString(16)}`,
      };
      await this.txManagerDb.addCreatedCell({
        outPoint: op,
        cellOutput: tx.outputs[i],
        data: tx.outputsData[i],
      });
    }
    return txHash;
  }
}
