import { randomBytes } from 'node:crypto';

export type AdminInviteDeliveryMessage = {
  email: string;
  password: string;
  invitedBy: string;
};

export type AdminInviteDelivery = (message: AdminInviteDeliveryMessage) => Promise<void> | void;


export const generateRandomPassword = (length = 16): string => {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
};

export const isUserAdmin = (email: string | undefined, adminEmails: string[]): boolean => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return adminEmails.some((admin) => admin.trim().toLowerCase() === normalized);
};
