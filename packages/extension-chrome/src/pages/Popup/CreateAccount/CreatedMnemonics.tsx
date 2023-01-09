import React from 'react';
import { ConfirmMnemonics } from './ConfirmMnemonics';
import { goTo } from 'react-chrome-extension-router';
import { Button } from 'antd';

type Props = {
  mnemonics: string;
};

export const CreatedMnemonics: React.FC<Props> = ({ mnemonics }: Props) => {
  const mnemonicArray = mnemonics.split(' ').map((item) => item.trim());
  const handleConfirm = () => {
    console.log('CreatedMnemonics', mnemonics);
    goTo(ConfirmMnemonics, { mnemonics });
  };
  return (
    <div className="container">
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        {mnemonicArray.map((item) => {
          return (
            <div className="border-solid border-2 border-black-600 w-24 text-center" key={item}>
              {item}
            </div>
          );
        })}
      </div>
      <div className="flex justify-center">
        <Button onClick={handleConfirm} size="large">
          I have put mnemonics on paper
        </Button>
      </div>
    </div>
  );
};
