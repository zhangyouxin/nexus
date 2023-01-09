import React from 'react';
import Logo from './logo.svg';
import './Popup.css';
import './index.css';
import { goTo } from 'react-chrome-extension-router';
import { CreatedMnemonics } from './CreateAccount/CreatedMnemonics';
import { generateMnemonic } from '@ckb-lumos/hd/lib/mnemonic';
import { Button } from 'antd';

const handleCreateAccount = () => {
  const mnemonics = generateMnemonic();
  goTo(CreatedMnemonics, { mnemonics });
};

export const Popup: React.FC = () => {
  return (
    <div className="m-8">
      <div className="w-80 h-60">
        <img src={Logo} alt="logo" />
      </div>
      <div className="w-full mx-18">
        <Button className="w-full" onClick={handleCreateAccount}>
          New Wallet
        </Button>
      </div>
      <div className="w-full mx-18">
        <Button className="w-full mt-3">Import Wallet</Button>
      </div>
    </div>
  );
};

export default Popup;
