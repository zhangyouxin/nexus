import { OnChainLockProvider } from './ownership/onchainLockProvider';
import { SignTransactionPayload } from '@nexus-wallet/types/src/services/OwnershipService';
import { Backend } from './ownership/backend';
import { Cell, Script } from '@ckb-lumos/base';
import { OwnershipService, Paginate, KeystoreService, NotificationService } from '@nexus-wallet/types';
import {
  SignDataPayload,
  GetOffChainLocksPayload,
  GroupedSignature,
  GetLiveCellsPayload,
  GetOnChainLocksPayload,
} from '@nexus-wallet/types/lib/services/OwnershipService';
import { asserts, createLogger } from '@nexus-wallet/utils';
import { createTransactionSkeleton } from '@ckb-lumos/helpers';
import { prepareSigningEntries } from '@ckb-lumos/common-scripts/lib/secp256k1_blake160';
import { LocksManager } from './ownership/locksManager';
import { CircularOffChainLockInfo } from './ownership/circular';
import { throwError } from '@nexus-wallet/utils/lib/error';
import { DefaultLockCursor, DefaultLiveCellCursor, LockCursor } from './ownership/cursor';
import { LockInfo } from './ownership/types';

type ServiceProps = {
  keystoreService: KeystoreService;
  notificationService: NotificationService;
  locksManager: LocksManager;
  backend: Backend;
};
type CreateOwnershipServiceProps = ServiceProps & { type: 'full' | 'ruleBased' };

type OwnershipServiceMap = {
  fullOwnershipService: OwnershipService;
  ruleBasedOwnershipService: OwnershipService;
};

export function createOwnershipServices(config: ServiceProps): OwnershipServiceMap {
  return {
    fullOwnershipService: createOwnershipService({ ...config, type: 'full' }),
    ruleBasedOwnershipService: createOwnershipService({ ...config, type: 'ruleBased' }),
  };
}

function createOwnershipService(config: CreateOwnershipServiceProps): OwnershipService {
  const logger = createLogger('OwnershipService');
  return {
    //TODO try fetch 10 cells for now, will support `limit` filter in the future
    getLiveCells: async (payload?: GetLiveCellsPayload) => {
      const lockProvider: OnChainLockProvider = await getOnchainLockProvider(config);
      const payloadCursor = payload?.cursor ? DefaultLiveCellCursor.fromString(payload.cursor) : undefined;

      const fetchCell = async (limit: number, lockCursor?: LockCursor): Promise<Paginate<Cell>> => {
        const lockInfoWithCursor = lockProvider.getNextLock({
          cursor: lockCursor,
          filter: { change: payload?.change },
        });
        if (!lockInfoWithCursor) {
          return {
            cursor: '',
            objects: [],
          };
        }
        const lockInfo: LockInfo = lockInfoWithCursor.lockInfo;
        // pass indexer cursor to rpc only when the lockCursor points to the lock
        const paginatedCells = await config.backend.getNextLiveCellWithCursor({
          lock: lockInfo.lock,
          filter: { limit },
        });

        if (paginatedCells.objects.length < limit) {
          const moreCells = await fetchCell(
            limit - paginatedCells.objects.length,
            new DefaultLockCursor(lockInfo.parentPath, lockInfo.index),
          );

          return {
            cursor:
              moreCells.cursor ||
              new DefaultLiveCellCursor(lockInfo.parentPath, lockInfo.index, paginatedCells.cursor).encode(),
            objects: [...paginatedCells.objects, ...moreCells.objects],
          };
        }

        return {
          cursor: new DefaultLiveCellCursor(lockInfo.parentPath, lockInfo.index, paginatedCells.cursor).encode(),
          objects: paginatedCells.objects,
        };
      };

      let result: Paginate<Cell> = {
        cursor: '',
        objects: [],
      };
      if (payloadCursor) {
        const currentCursorLock = lockProvider.currentCursorLock({ cursor: payloadCursor });
        asserts.asserts(currentCursorLock, 'Invalid cursor.', payloadCursor);
        const cellsWithCursor = await config.backend.getNextLiveCellWithCursor({
          lock: currentCursorLock.lock,
          filter: { indexerCursor: payloadCursor.indexerCursor, limit: 10 },
        });
        result = {
          cursor: new DefaultLiveCellCursor(
            currentCursorLock.parentPath,
            currentCursorLock.index,
            cellsWithCursor.cursor,
          ).encode(),
          objects: cellsWithCursor.objects,
        };
      }
      if (result.objects.length < 10) {
        const moreCells = await fetchCell(10 - result.objects.length, payloadCursor);
        result = {
          cursor: moreCells.cursor || result.cursor,
          objects: [...result.objects, ...moreCells.objects],
        };
      }
      return result;
    },
    getOffChainLocks: async (payload: GetOffChainLocksPayload) => {
      const provider: CircularOffChainLockInfo = await getOffChainLockProvider(config, payload);
      const result = provider.next();
      //TODO try fetch 1 lock for now, will support `limit` filter in the future
      return result ? [result.lock] : [];
    },
    getOnChainLocks: async (payload: GetOnChainLocksPayload): Promise<Paginate<Script>> => {
      const provider: OnChainLockProvider = await getOnchainLockProvider(config);
      const cursor = payload.cursor ? DefaultLockCursor.fromString(payload.cursor) : undefined;
      const nextLockWithCursor = provider.getNextLock({ cursor, filter: { change: payload.change } });
      const lastCursor = nextLockWithCursor
        ? new DefaultLockCursor(nextLockWithCursor.lockInfo.parentPath, nextLockWithCursor.lockInfo.index).encode()
        : '';
      return {
        cursor: lastCursor,
        //TODO try fetch 1 lock for now, will support `limit` filter in the future
        objects: nextLockWithCursor ? [nextLockWithCursor.lockInfo.lock] : [],
      };
    },
    signTransaction: async (payload: SignTransactionPayload) => {
      const cellFetcher = config.backend.getLiveCellFetcher();
      let txSkeleton = await createTransactionSkeleton(payload.tx, cellFetcher);
      logger.info('txSkeleton', txSkeleton);
      txSkeleton = prepareSigningEntries(txSkeleton);
      const inputLocks = txSkeleton
        .get('inputs')
        .map((input) => input.cellOutput.lock)
        .toArray();
      const allLockInfoList = await Promise.all(
        inputLocks.map(async (lock) => await config.locksManager.getlockInfoByLock({ lock })),
      );
      const signingEntries = txSkeleton.get('signingEntries').toArray();
      const password = (await config.notificationService.requestSignTransaction({ tx: payload.tx })).password;
      const result: GroupedSignature = [];
      logger.info('signingEntries', signingEntries);
      for (let index = 0; index < signingEntries.length; index++) {
        const signingEntry = signingEntries[index];
        const lockInfo = allLockInfoList[signingEntry.index];
        asserts.asserts(lockInfo, 'Lock not found with signingEntry', signingEntry);
        const signature = await config.keystoreService.signMessage({
          message: signingEntry.message,
          password,
          path: `${lockInfo.parentPath}/${lockInfo.index}`,
        });
        result.push([lockInfo.lock, signature]);
      }
      return result;
    },
    signData: async (payload: SignDataPayload) => {
      const lockInfo = await config.locksManager.getlockInfoByLock({ lock: payload.lock });
      asserts.asserts(lockInfo, 'Lock not found when call signData with', payload);
      const password = (await config.notificationService.requestSignData({ data: payload.data })).password;
      const signature = await config.keystoreService.signMessage({
        message: payload.data,
        password,
        path: `${lockInfo.parentPath}/${lockInfo.index}`,
      });
      return signature;
    },
  };
}
export async function getOnchainLockProvider(
  config: Pick<CreateOwnershipServiceProps, 'type' | 'locksManager'>,
): Promise<OnChainLockProvider> {
  let provider: OnChainLockProvider;
  if (config.type === 'full') {
    provider = await config.locksManager.fullOnChainLockProvider();
  } else if (config.type === 'ruleBased') {
    provider = await config.locksManager.ruleBasedOnChainLockProvider();
  } else {
    throwError('Invalid getOnChainLocks payload', config);
  }
  return provider;
}

export async function getOffChainLockProvider(
  config: Pick<CreateOwnershipServiceProps, 'type' | 'locksManager'>,
  payload: Pick<GetOffChainLocksPayload, 'change'>,
): Promise<CircularOffChainLockInfo> {
  let provider: CircularOffChainLockInfo;
  if (config.type === 'full' && (payload.change === 'external' || !payload.change)) {
    provider = await config.locksManager.fullExternalProvider();
  } else if (config.type === 'full' && payload.change === 'internal') {
    provider = await config.locksManager.fullChangeProvider();
  } else if (config.type === 'ruleBased') {
    provider = await config.locksManager.ruleBasedProvider();
  } else {
    throwError('Invalid getOffChainLocks payload', payload);
  }
  return provider;
}
