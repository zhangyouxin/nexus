import { createUserListener } from './createUser';
import { inpageListener } from './inpage';

export const messageListeners = [inpageListener, createUserListener];
