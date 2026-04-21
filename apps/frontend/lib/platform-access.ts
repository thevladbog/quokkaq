import type { User } from '@quokkaq/shared-types';

/**
 * User may open the SaaS operator UI (`/platform`): only global `platform_admin`
 * (`isPlatformAdmin` from `UserModelSchema`).
 */
export function userCanOpenPlatformOperatorUI(
  user: Pick<User, 'isPlatformAdmin'> | null | undefined
): boolean {
  return user?.isPlatformAdmin === true;
}
