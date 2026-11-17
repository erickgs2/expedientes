import { resolveNotificationPhone } from './notification-contact';

describe('resolveNotificationPhone', () => {
  it("uses the companion's phone when one is linked", () => {
    expect(resolveNotificationPhone({ phone: '', contactPatient: { phone: '5512345678' } })).toBe('5512345678');
    expect(resolveNotificationPhone({ phone: '5599999999', contactPatient: { phone: '5512345678' } })).toBe(
      '5512345678'
    );
  });

  it("falls back to the patient's own phone", () => {
    expect(resolveNotificationPhone({ phone: '5599999999', contactPatient: null })).toBe('5599999999');
    expect(resolveNotificationPhone({ phone: '5599999999' })).toBe('5599999999');
  });

  it('ignores a companion whose phone is blank', () => {
    expect(resolveNotificationPhone({ phone: '5599999999', contactPatient: { phone: '  ' } })).toBe('5599999999');
  });
});
