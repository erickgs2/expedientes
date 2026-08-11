import { toPublicClinicSettings } from './clinic-settings';

/**
 * The WhatsApp access token is a credential for the clinic's Meta account. Any response that
 * carried it would hand it to everyone who can open the settings screen, so this projection is the
 * single choke point both `GET` and `PUT` go through.
 */
describe('toPublicClinicSettings', () => {
  const row = {
    id: 'singleton',
    doctorName: 'MIROSLAVA GARCIA',
    whatsappAccessToken: 'EAAG-super-secret-token',
    whatsappPhoneNumberId: '123456789',
  };

  it('never includes the access token', () => {
    const result = toPublicClinicSettings(row);
    expect('whatsappAccessToken' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('EAAG-super-secret-token');
  });

  it('reports that a token is stored without revealing it', () => {
    expect(toPublicClinicSettings(row).whatsappAccessTokenSet).toBe(true);
  });

  it('reports no token when it is null', () => {
    expect(toPublicClinicSettings({ ...row, whatsappAccessToken: null }).whatsappAccessTokenSet).toBe(
      false
    );
  });

  it('treats a whitespace-only token as absent, since it cannot authenticate anything', () => {
    expect(toPublicClinicSettings({ ...row, whatsappAccessToken: '   ' }).whatsappAccessTokenSet).toBe(
      false
    );
  });

  it('passes every other field through untouched', () => {
    const result = toPublicClinicSettings(row);
    expect(result.doctorName).toBe('MIROSLAVA GARCIA');
    expect(result.whatsappPhoneNumberId).toBe('123456789');
    expect(result.id).toBe('singleton');
  });
});
