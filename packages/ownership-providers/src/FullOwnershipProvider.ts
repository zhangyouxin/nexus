import { BIish, BI } from '@ckb-lumos/bi';
import isEqual from 'lodash.isequal';
import {
  createTransactionFromSkeleton,
  minimalCellCapacityCompatible,
  parseAddress,
  TransactionSkeletonType,
} from '@ckb-lumos/helpers';
import { Events, FullOwnership, InjectedCkb } from '@nexus-wallet/protocol';
import { errors } from '@nexus-wallet/utils';
import { Address, blockchain, Cell, HexString, Script, Transaction } from '@ckb-lumos/base';
import { WitnessArgs } from '@ckb-lumos/base/lib/blockchain';
import { bytes } from '@ckb-lumos/codec';
import { prepareSigningEntries } from '@ckb-lumos/common-scripts/lib/secp256k1_blake160';
import { Config as LumosConfig } from '@ckb-lumos/config-manager/lib';

// util types for FullOwnership

type Suffix<T extends string, P extends string> = T extends `${P}${infer S}` ? S : never;
type FullOwnershipPrefix = 'wallet_fullOwnership_';
type OwnershipMethodNames = Suffix<keyof FullOwnership, FullOwnershipPrefix>;
type ParamOf<K extends OwnershipMethodNames> = Parameters<FullOwnership[`${FullOwnershipPrefix}${K}`]>[0];
type ReturnOf<K extends OwnershipMethodNames> = ReturnType<FullOwnership[`${FullOwnershipPrefix}${K}`]>;

/** Must be a full format address if it's an address */
export type LockScriptLike = Address | Script;

export type PayFeeOptions = {
  /**
   * The fee rate, in Shannons per byte. If not specified, the fee rate will be calculated automatically.
   */
  feeRate?: BIish;

  /**
   * Only in these output indexes, can pay fee
   */
  byOutPutIndexes?: number[];

  /**
   * if `true`, the fee can be paid by the other wallet owned cells. if {@link PayFeeOptions#byOutPutIndexes} is specified, payers lock have higher priority.
   */
  autoInject: boolean;
};

// TODO: let lumos export `getTransactionSizeByTx` and `calculateFeeCompatible` and `lockToScript`
/* istanbul ignore next */
function getTransactionSizeByTx(tx: Transaction): number {
  const serializedTx = blockchain.Transaction.pack(tx);
  // 4 is serialized offset bytesize
  const size = serializedTx.byteLength + 4;
  return size;
}

/* istanbul ignore next */
function calculateFeeCompatible(size: number, feeRate: BIish): BI {
  const ratio = BI.from(1000);
  const base = BI.from(size).mul(feeRate);
  const fee = base.div(ratio);
  if (fee.mul(ratio).lt(base)) {
    return fee.add(1);
  }
  return BI.from(fee);
}

function calculateSumCapacity(cells: { reduce: <R>(reducer: (prev: R, cur: Cell) => R, initial: R) => R }) {
  return cells.reduce((prev, cur) => prev.add(cur.cellOutput.capacity), BI.from(0));
}

export type FullOwnershipProviderConfig = {
  ckb: InjectedCkb<FullOwnership, Events>;
};

export class FullOwnershipProvider {
  private ckb: InjectedCkb<FullOwnership, Events>;

  constructor(config: FullOwnershipProviderConfig) {
    this.ckb = config.ckb;
  }

  async getLiveCells(params?: ParamOf<'getLiveCells'>): ReturnOf<'getLiveCells'> {
    return this.ckb.request({ method: 'wallet_fullOwnership_getLiveCells', params });
  }

  async getOffChainLocks(params: ParamOf<'getOffChainLocks'>): ReturnOf<'getOffChainLocks'> {
    return this.ckb.request({ method: 'wallet_fullOwnership_getOffChainLocks', params });
  }

  async getOnChainLocks(params: ParamOf<'getOnChainLocks'>): ReturnOf<'getOnChainLocks'> {
    return this.ckb.request({ method: 'wallet_fullOwnership_getOnChainLocks', params });
  }

  /**
   * Inject capacity to the transaction's inputs at least equal to the `amount`,
   * if the collected capacity is over the `amount`, a change cell will be added to the transaction's outputs.
   * @param txSkeleton
   * @param config
   * @example
   *   // Transfer 100 CKB to the target lock script
   *   declare let txSkeleton: TransactionSkeletonType;
   *   declare const target: Script;
   *   declare const provider: FullOwnershipProvider;
   *   const capacity = '10000000000'; // 100 CKB
   *   txSkeleton = txSkeleton.update('outputs', (outputs) =>
   *     outputs.push({ cellOutput: { capacity: capacity, lock: target }, data: '0x' }),
   *   );
   *
   *   txSkeleton = await provider.injectCapacity(txSkeleton, { amount: capacity });
   *
   */
  injectCapacity(txSkeleton: TransactionSkeletonType, config: { amount: BIish }): Promise<TransactionSkeletonType> {
    return this._injectCapacity(txSkeleton, config);
  }

  private async _injectCapacity(
    txSkeleton: TransactionSkeletonType,
    config: {
      /** Inject at least this amount of capacity */
      amount: BIish;

      /**
       * If specified, candidate cells for injecting will be filtered by this lock script.
       */
      lock?: LockScriptLike;
    },
  ): Promise<TransactionSkeletonType> {
    const changeLock = (await this.getOffChainLocks({ change: 'internal' }))[0];
    if (!changeLock) {
      errors.throwError('No change lock script found, it may be a internal bug');
    }

    const changeCell: Cell = {
      cellOutput: {
        capacity: '0x0',
        lock: changeLock,
      },
      data: '0x',
    };
    const minimalChangeCapacity = minimalCellCapacityCompatible(changeCell);

    let neededCapacity = BI.from(config.amount).add(minimalChangeCapacity);
    const inputCells: Cell[] = [];
    const payerLock = config.lock ? await this.parseLockScriptLike(config.lock) : undefined;

    for await (const cell of this.collector({ lock: payerLock })) {
      inputCells.push(cell);
      neededCapacity = neededCapacity.sub(BI.from(cell.cellOutput.capacity));
      if (neededCapacity.lte(0)) {
        break;
      }
    }
    if (neededCapacity.gt(0)) {
      errors.throwError('No cell sufficient to inject');
    }

    const totalInputs = inputCells.reduce((sum, cell) => sum.add(BI.from(cell.cellOutput.capacity)), BI.from(0));
    const changeAmount = totalInputs.sub(BI.from(config.amount));

    changeCell.cellOutput.capacity = changeAmount.toHexString();

    txSkeleton = txSkeleton
      .update('inputs', (inputs) => {
        return inputs.push(...inputCells);
      })
      .update('outputs', (outputs) => {
        return outputs.push(changeCell);
      });

    return txSkeleton;
  }

  /**
   * Pay the transaction fee using the specified lock
   * @param txSkeleton The transaction skeleton
   * @param options.payers if provided, candidates for paying fee will be filtered by these lock scripts
   * @param options.autoInject if true, wallet owned lock can be payer as fallback
   * @param options.feeRate The fee rate, in Shannons per byte. If not specified, the fee rate will be calculated automatically.
   * @example
   * ```ts
   * const provider = new FullOwnershipProvider({ ckb });
   * // auto calculate fee rate and use wallet owned lock to pay fee
   * const txSkeleton = await provider.payFee({ txSkeleton });
   * // auto inject capacity when payers can not cover the fee
   * const txSkeleton = await provider.payFee({ txSkeleton, payers: [payer1, payer2], autoInject: true });
   * // throw error when payers can not cover the fee
   * const txSkeleton = await provider.payFee({ txSkeleton, payers: [payer1, payer2], autoInject: false });
   * ```
   */
  async payFee(txSkeleton: TransactionSkeletonType, options: PayFeeOptions): Promise<TransactionSkeletonType> {
    if (options.byOutPutIndexes?.length === 0 && !options.autoInject) {
      errors.throwError('no byOutPutIndexes is provided, but autoInject is `false`');
    }
    const autoInject = !!options.autoInject;
    const feeRate = BI.from(options.feeRate || 1000);
    let currentTransactionSize = getTransactionSizeByTx(createTransactionFromSkeleton(txSkeleton));
    let txSkeletonWithFee = txSkeleton;

    // use existed output cell to pay fee
    let remainFee = calculateFeeCompatible(currentTransactionSize, feeRate);
    // sum(inputsCapacity) - sum(outputsCapacity) - fee >= 0
    if (
      calculateSumCapacity(txSkeleton.get('inputs'))
        .sub(calculateSumCapacity(txSkeleton.get('outputs')))
        .gte(remainFee)
    ) {
      return txSkeleton;
    }
    let size = 0;

    const byOutPutIndexes = options.byOutPutIndexes ? options.byOutPutIndexes : [];

    for (const byOutPutIndex of byOutPutIndexes) {
      if (remainFee.lte(0)) {
        break;
      }
      const currentCell = txSkeleton.get('outputs').get(byOutPutIndex);
      if (!currentCell) {
        errors.throwError('`byOutPutIndex` is out of range');
      }
      const cellCapacity = BI.from(currentCell.cellOutput.capacity);
      const minimalCapacity = minimalCellCapacityCompatible(currentCell);

      // How many capacity is needed?
      // cellCapacity - originFee >= minimalCapacity ? originFee : cellCapacity - minimalCapacity
      const neededCapacity = cellCapacity.sub(remainFee).gte(minimalCapacity)
        ? remainFee
        : cellCapacity.sub(minimalCapacity);

      remainFee = remainFee.sub(neededCapacity);
      txSkeletonWithFee = txSkeletonWithFee.setIn(
        ['outputs', byOutPutIndex, 'cellOutput', 'capacity'],
        cellCapacity.sub(neededCapacity).toHexString(),
      );
    }

    // all byOutputIndexes are used but still remain fee to pay and disable autoInject
    if (remainFee.lte(0)) {
      return txSkeletonWithFee;
    } else if (autoInject) {
      txSkeleton = txSkeletonWithFee;
    } else {
      errors.throwError('cells from `byOutPutIndexes` sufficient to pay fee');
    }

    const paidFee = calculateFeeCompatible(currentTransactionSize, feeRate).sub(remainFee);

    while (currentTransactionSize > size) {
      size = currentTransactionSize;
      const fee = calculateFeeCompatible(size, feeRate).sub(paidFee);

      try {
        txSkeletonWithFee = await this.injectCapacity(txSkeleton, {
          amount: fee,
        });
      } catch {
        errors.throwError('No cell sufficient to pay fee');
      }

      currentTransactionSize = getTransactionSizeByTx(createTransactionFromSkeleton(txSkeletonWithFee));
    }

    return txSkeletonWithFee;
  }

  /**
   * Collect cells from wallet.
   * @returns A async iterator of cells
   *
   * @example
   * ```ts
   * async function getOwnedCells(lock: Script) {
   * const cells = [];
   *  for await(const cell of provider.collector({ lock })) {
   *      cells.push(cell);
   *  }
   *
   * return cells;
   * }
   * ```
   */
  async *collector({ lock }: { lock?: Script } = {}): AsyncIterable<Cell> {
    let cursor = '';
    while (true) {
      // TODO: in current version, the cursor prop is required. But it should be optional.
      const page = await this.getLiveCells({ cursor });
      if (page.objects.length === 0) {
        return;
      }
      cursor = page.cursor;
      for (const cell of page.objects) {
        if (!lock || isEqual(lock, cell.cellOutput.lock)) {
          yield cell;
        }
      }
    }
  }

  /**
   * request wallet to sign a transaction skeleton
   * @param txSkeleton The transaction skeleton, you can create it from transaction object via {@link @ckb-lumos/helpers#TransactionSkeleton}
   * @returns The signed transaction skeleton. The signatures are serialized and put into the witnesses field.
   */
  async signTransaction(txSkeleton: TransactionSkeletonType): Promise<TransactionSkeletonType> {
    const lumosConfig = await this.getLumosConfig();
    txSkeleton = prepareSigningEntries(txSkeleton, { config: lumosConfig });

    const groupedSignature = await this.ckb.request({
      method: 'wallet_fullOwnership_signTransaction',
      params: { tx: createTransactionFromSkeleton(txSkeleton) },
    });

    for (let [lock, signature] of groupedSignature) {
      const witnessIndex = txSkeleton.inputs.findIndex((input) => isEqual(input.cellOutput.lock, lock));

      /* istanbul ignore next */
      if (witnessIndex === -1) {
        continue;
      }

      const witnessArgs = WitnessArgs.unpack(txSkeleton.witnesses.get(witnessIndex) as HexString);
      let witnesses = txSkeleton.witnesses;
      witnesses = witnesses.set(witnessIndex, bytes.hexify(WitnessArgs.pack({ ...witnessArgs, lock: signature })));
      txSkeleton = txSkeleton.set('witnesses', witnesses);
    }

    txSkeleton = txSkeleton.update('signingEntries', (entries) => entries.clear());

    return txSkeleton;
  }

  // TODO: wait for wallet provide a API to get genesis block hash
  private async getLumosConfig(): Promise<LumosConfig> {
    errors.unimplemented();
  }

  private async parseLockScriptLike(lock: LockScriptLike) {
    if (typeof lock === 'object') {
      return lock;
    }

    const config = await this.getLumosConfig();
    return parseAddress(lock, { config });
  }
}
