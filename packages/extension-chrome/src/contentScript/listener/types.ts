// add your target here
export type Target = 'NEXUS_INPAGE' | '/users/create';

export type MessageTarget = {
  target: Target;
};

export type CreateUserPayload = {
  user: {
    name: string;
    age?: number;
  };
};

export type CreateUserMessage = MessageTarget & CreateUserPayload;
