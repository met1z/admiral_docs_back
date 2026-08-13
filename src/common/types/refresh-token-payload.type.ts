import { AuthenticatedUser } from './authenticated-user.type';

export type RefreshTokenPayload = AuthenticatedUser & {
  sessionId: string;
};
