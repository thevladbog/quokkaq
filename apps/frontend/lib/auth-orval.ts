/**
 * Auth flows via Orval-generated clients ({@link ./api/generated/auth.ts}) + shared-types validation.
 */
import { getAuthMe, postAuthLogin } from '@/lib/api/generated/auth';
import type { User } from '@quokkaq/shared-types';
import { UserModelSchema } from '@quokkaq/shared-types';

export async function fetchCurrentUser(): Promise<User> {
  const res = await getAuthMe();
  if (res.status !== 200) {
    throw new Error(`auth_me_${res.status}`);
  }
  return UserModelSchema.parse(res.data);
}

export async function loginWithPassword(credentials: {
  email: string;
  password: string;
}): Promise<{ accessToken: string; refreshToken?: string }> {
  const res = await postAuthLogin({
    email: credentials.email,
    password: credentials.password
  });
  if (res.status !== 200) {
    throw new Error('Login failed');
  }
  const token = res.data.accessToken ?? res.data.token;
  if (!token) {
    throw new Error('No token in login response');
  }
  return {
    accessToken: token,
    refreshToken: res.data.refreshToken
  };
}
