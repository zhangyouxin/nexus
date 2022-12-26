import { Client } from 'chomex';
import { CreateUserMessage } from './types';

export const createUserListener = (event: MessageEvent<CreateUserMessage>): MessageEvent<CreateUserMessage> => {
  if (event.data.target === '/users/create') {
    const client = new Client(chrome.runtime);
    client.message('/users/create', { user: event.data.user }).then((response) => {
      console.log('create user response:', response);
    });
  }
  return event;
};
