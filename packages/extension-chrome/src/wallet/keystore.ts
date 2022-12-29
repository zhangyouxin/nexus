import crypto from 'crypto';
import { Keccak } from 'sha3';
import { v4 as uuid } from 'uuid';

import { ExtendedPrivateKey } from './key';

const CIPHER = 'aes-128-ctr';
const CKB_CLI_ORIGIN = 'ckb-cli';

interface CipherParams {
  iv: string;
}

interface KdfParams {
  dklen: number;
  n: number;
  r: number;
  p: number;
  salt: string;
}

interface Crypto {
  cipher: string;
  cipherparams: CipherParams;
  ciphertext: string;
  kdf: string;
  kdfparams: KdfParams;
  mac: string;
}

// Encrypt and save master extended private key.
export default class Keystore {
  crypto: Crypto;
  id: string;
  version: number = 3;

  constructor(theCrypto: Crypto, id: string) {
    this.crypto = theCrypto;
    this.id = id;
  }

  static fromJson = (json: string): Keystore => {
    try {
      const object = JSON.parse(json);
      if (object.origin === CKB_CLI_ORIGIN) {
        throw 'Keystore from CKB CLI is not supported';
      }
      return new Keystore(object.crypto, object.id);
    } catch {
      throw new Error('Invalid keystore');
    }
  };

  /**
   * Keystore default name is `${id}`.
   *
   * @param options If you are sure to overwrite existing keystore, set `overwrite` to true.
   */
  save({ overwrite = false }: { overwrite?: boolean }): void {
    const itemName = this.id;
    if (!overwrite && localStorage.getItem(itemName)) {
      throw new Error('Keystore already exists!');
    }
    localStorage.setItem(itemName, JSON.stringify(this));
  }

  // Create an empty keystore object that contains empty private key
  static createEmpty = (): Keystore => {
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const kdfparams: KdfParams = {
      dklen: 32,
      salt: salt.toString('hex'),
      n: 2 ** 18,
      r: 8,
      p: 1,
    };
    return new Keystore(
      {
        ciphertext: '',
        cipherparams: {
          iv: iv.toString('hex'),
        },
        cipher: CIPHER,
        kdf: 'scrypt',
        kdfparams,
        mac: '',
      },
      uuid(),
    );
  };

  static create = (
    extendedPrivateKey: ExtendedPrivateKey,
    password: string,
    options: { salt?: Buffer; iv?: Buffer } = {},
  ): Keystore => {
    const salt = options.salt || crypto.randomBytes(32);
    const iv = options.iv || crypto.randomBytes(16);
    const kdfparams: KdfParams = {
      dklen: 32,
      salt: salt.toString('hex'),
      n: 2 ** 18,
      r: 8,
      p: 1,
    };
    const derivedKey = crypto.scryptSync(password, salt, kdfparams.dklen, Keystore.scryptOptions(kdfparams));

    const cipher = crypto.createCipheriv(CIPHER, derivedKey.slice(0, 16), iv);
    if (!cipher) {
      throw new Error('Unsupported cipher');
    }
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(extendedPrivateKey.serialize(), 'hex')),
      cipher.final(),
    ]);

    return new Keystore(
      {
        ciphertext: ciphertext.toString('hex'),
        cipherparams: {
          iv: iv.toString('hex'),
        },
        cipher: CIPHER,
        kdf: 'scrypt',
        kdfparams,
        mac: Keystore.mac(derivedKey, ciphertext),
      },
      uuid(),
    );
  };

  // Imported from xpub with empty private key.
  isEmpty(): boolean {
    return this.crypto.ciphertext === '' && this.crypto.mac === '';
  }

  // Decrypt and return serialized extended private key.
  decrypt(password: string): string {
    const derivedKey = this.derivedKey(password);
    const ciphertext = Buffer.from(this.crypto.ciphertext, 'hex');
    if (Keystore.mac(derivedKey, ciphertext) !== this.crypto.mac) {
      throw new Error('Invalid password');
    }
    const decipher = crypto.createDecipheriv(
      this.crypto.cipher,
      derivedKey.slice(0, 16),
      Buffer.from(this.crypto.cipherparams.iv, 'hex'),
    );
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('hex');
  }

  extendedPrivateKey = (password: string): ExtendedPrivateKey => {
    return ExtendedPrivateKey.parse(this.decrypt(password));
  };

  checkPassword = (password: string): boolean => {
    const derivedKey = this.derivedKey(password);
    const ciphertext = Buffer.from(this.crypto.ciphertext, 'hex');
    return Keystore.mac(derivedKey, ciphertext) === this.crypto.mac;
  };

  derivedKey = (password: string): Buffer => {
    const { kdfparams } = this.crypto;
    return crypto.scryptSync(
      password,
      Buffer.from(kdfparams.salt, 'hex'),
      kdfparams.dklen,
      Keystore.scryptOptions(kdfparams),
    );
  };

  static mac = (derivedKey: Buffer, ciphertext: Buffer): string => {
    return new Keccak(256).update(Buffer.concat([derivedKey.slice(16, 32), ciphertext])).digest('hex');
  };

  static scryptOptions = (kdfparams: KdfParams): { N: number; r: number; p: number; maxmem: number } => {
    return {
      N: kdfparams.n,
      r: kdfparams.r,
      p: kdfparams.p,
      maxmem: 128 * (kdfparams.n + kdfparams.p + 2) * kdfparams.r,
    };
  };
}
