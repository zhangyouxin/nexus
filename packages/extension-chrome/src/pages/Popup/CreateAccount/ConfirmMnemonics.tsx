import { Button, Input, notification } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React from 'react';
import { useMemo } from 'react';
import { useState } from 'react';
import { mnemonicToSeed } from '@ckb-lumos/hd/lib/mnemonic';
import Keychain from '@ckb-lumos/hd/lib/keychain';
import Keystore from '@ckb-lumos/hd/lib/keystore';
import { ExtendedPrivateKey } from '@ckb-lumos/hd/lib/extended_key';
import { goTo } from 'react-chrome-extension-router';
import { Home } from '../Home/Home';

type Props = {
  mnemonics: string;
};

export const ConfirmMnemonics: React.FC<Props> = ({ mnemonics }: Props) => {
  const handleConfirm = async () => {
    if (!validateMnemonics() || confirmPwdErr) {
      notification.error({ message: 'Please check input values' });
      return;
    }
    const seed = await mnemonicToSeed(mnemonics);
    const keychain = Keychain.fromSeed(seed);
    keychain.derivePath("m/44'/309'/0'");
    console.log('keychain.privateKey.toString()', keychain.privateKey.toString('hex'));

    const keystore = Keystore.create(
      new ExtendedPrivateKey(`0x${keychain.privateKey.toString('hex')}`, `0x${keychain.chainCode.toString('hex')}`),
      pwd,
    );
    const stringifiedKeystore = JSON.stringify(keystore);
    localStorage.setItem(keystore.id, stringifiedKeystore);

    goTo(Home);
  };

  const [inputMnemonics, setInputMnemonics] = useState('');
  const [pwd, setPwd] = useState('');
  const [repeatPwd, setRepeatPwd] = useState('');

  const handleInputMnemonicsChange = (e: { target: { value: string } }) => {
    setInputMnemonics(e.target.value);
  };
  const handlePwdChange = (e: { target: { value: string } }) => {
    setPwd(e.target.value);
  };
  const handleRepeatPwdChange = (e: { target: { value: string } }) => {
    setRepeatPwd(e.target.value);
  };

  const [mnemonicsErr, setMnemonicsErr] = useState('');
  const [confirmPwdErr, setConfirmPwdErr] = useState('');

  const validateMnemonics = (): boolean => {
    if (!inputMnemonics) {
      return false;
    }
    const inputMnemonicsArray = inputMnemonics.split(' ').map((item) => item.trim());
    const mnemonicsArray = mnemonics.split(' ').map((item) => item.trim());
    if (inputMnemonicsArray.length !== 12) {
      setMnemonicsErr('Mnemonics should be 12 words');
      return false;
    } else {
      let isMatch = true;
      for (let i = 0; i < 12; i++) {
        if (inputMnemonicsArray[i] !== mnemonicsArray[i]) {
          isMatch = false;
        }
      }
      if (!isMatch) {
        setMnemonicsErr('Mnemonics not match');
        return false;
      }
    }
    setMnemonicsErr('');
    return true;
  };
  useMemo(() => {
    if (pwd && repeatPwd && pwd !== repeatPwd) {
      setConfirmPwdErr('Password not match');
    } else {
      setConfirmPwdErr('');
    }
  }, [pwd, repeatPwd]);

  return (
    <div className="container">
      <div className="m-2">
        <TextArea
          placeholder="Repeat mnemonics here"
          value={inputMnemonics}
          onChange={handleInputMnemonicsChange}
          onBlur={validateMnemonics}
        />
        {!!mnemonicsErr && <div className="text-[#ff0000]">{mnemonicsErr}</div>}
      </div>
      <div className="m-2">
        <Input placeholder="password" value={pwd} onChange={handlePwdChange} />
      </div>
      <div className="m-2">
        <Input placeholder="confirm" value={repeatPwd} onChange={handleRepeatPwdChange} />
        {!!confirmPwdErr && <div className="text-[#ff0000]">{confirmPwdErr}</div>}
      </div>
      <div className="flex justify-center mt-4">
        <Button className="w-full mx-12" onClick={handleConfirm} size="large">
          START
        </Button>
      </div>
    </div>
  );
};
