import React from 'react';
import { generateMnemonic } from '../../wallet/key';
import './Popup.css';

export const Popup: React.FC = () => {
  const [mnemonic, setMnemonic] = React.useState<string>();
  const handleCreateAccount = () => {
    const mnemonic = generateMnemonic();
    setMnemonic(mnemonic);
  };
  return (
    <div className="container">
      <button onClick={handleCreateAccount}>Create Account</button>
      <span>{mnemonic}</span>
    </div>
  );
};

export default Popup;
