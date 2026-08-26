import type { InviteDelivery } from './invites.js';

export type InviteDeliveryConfig = {
  endpoint: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
};

export const createHttpInviteDelivery = (config: InviteDeliveryConfig): InviteDelivery => {
  const fetchImpl = config.fetchImpl ?? fetch;
  return async (message) => {
    const response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.bearerToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`invite delivery failed with status ${response.status}`);
  };
};
