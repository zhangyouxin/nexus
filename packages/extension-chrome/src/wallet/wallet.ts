import { AccountExtendedPublicKey, ExtendedPrivateKey } from './key';
import Keychain from './keychain';
import Keystore from './keystore';
import { mnemonicToSeedSync, validateMnemonic } from './mnemonic';

export interface WalletProperties {
  id: string;
  name: string;
}

export const create = ({
  name,
  password,
  mnemonic,
}: {
  name: string;
  password: string;
  mnemonic: string;
}): Promise<WalletProperties> => {
  return createByMnemonic({ name, password, mnemonic, isImporting: false });
};

const createByMnemonic = async ({
  name,
  password,
  mnemonic,
}: {
  name: string;
  password: string;
  mnemonic: string;
  isImporting: boolean;
}): Promise<WalletProperties> => {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic');
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const masterKeychain = Keychain.fromSeed(seed);
  if (!masterKeychain.privateKey) {
    throw new Error('Invalid mnemonic');
  }
  const extendedKey = new ExtendedPrivateKey(
    masterKeychain.privateKey.toString('hex'),
    masterKeychain.chainCode.toString('hex'),
  );
  const keystore = Keystore.create(extendedKey, password);

  const accountKeychain = masterKeychain.derivePath(AccountExtendedPublicKey.ckbAccountPath);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const accountExtendedPublicKey = new AccountExtendedPublicKey(
    accountKeychain.publicKey.toString('hex'),
    accountKeychain.chainCode.toString('hex'),
  );

  return {
    id: keystore.id,
    name,
  };
};
