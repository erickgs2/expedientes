import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('Sup3rSecret!', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a hash different from the plain text', async () => {
    const hash = await hashPassword('Sup3rSecret!');
    expect(hash).not.toBe('Sup3rSecret!');
  });
});
