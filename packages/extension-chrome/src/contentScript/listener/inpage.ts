import { Client } from 'chomex';
import { CreateUserMessage } from './types';

export const inpageListener = (event: MessageEvent<CreateUserMessage>): MessageEvent<CreateUserMessage> => {
  if (event.data.target === 'NEXUS_INPAGE') {
    const client = new Client(chrome.runtime);
    client.message('NEXUS_INPAGE').then((response) => {
      console.log('NEXUS_INPAGE response:', response);
    });
  }
  return event;
};
