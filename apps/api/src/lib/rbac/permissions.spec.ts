import { checkPermission, ForbiddenError } from './permissions';

describe('checkPermission', () => {
  it('passes when the permission is granted', () => {
    expect(() => checkPermission(['patients:view', 'patients:edit'], 'patients', 'view')).not.toThrow();
  });

  it('throws ForbiddenError when the permission is missing', () => {
    expect(() => checkPermission(['patients:view'], 'patients', 'delete')).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when the granted list is empty', () => {
    expect(() => checkPermission([], 'patients', 'view')).toThrow(ForbiddenError);
  });
});
