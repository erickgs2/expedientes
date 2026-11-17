import type { AuthUser, LegalDocumentSummary } from '@expedientes/shared-types';
import type { ResolvedMembership } from '../rbac/permissions';

/** The signed-in user as the web sees it, for the clinic this session acts for. */
export function toAuthUser(
  membership: ResolvedMembership,
  pendingLegal: LegalDocumentSummary[]
): AuthUser {
  return {
    id: membership.userId,
    email: membership.email,
    fullName: membership.fullName,
    language: membership.language,
    roleId: membership.roleId,
    roleName: membership.roleName,
    permissions: membership.permissions,
    clinic: { id: membership.clinicId, name: membership.clinicName },
    isOwner: membership.isOwner,
    plan: membership.plan,
    pendingLegal,
  };
}
