import { describe, expect, it } from 'vitest';
import { isSecretKey, maskValue } from '../src/core/mask.ts';

describe('isSecretKey', () => {
  it.each([
    'SECRET_KEY',
    'API_TOKEN',
    'DATABASE_PASSWORD',
    'PWD',
    'STRIPE_SECRET',
    'JWT_PRIVATE_KEY',
    'OAUTH_CREDENTIAL',
    'AUTH_HEADER',
    'DATABASE_DSN'
  ])('flags %s as secret', (key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  it.each(['APP_NAME', 'PORT', 'DATABASE_HOST', 'NODE_ENV', 'LOG_LEVEL'])(
    'keeps %s visible',
    (key) => {
      expect(isSecretKey(key)).toBe(false);
    }
  );

  it.each(['API_KEY_ID', 'CLIENT_KEY_ID', 'STRIPE_PUBLIC_KEY', 'PUBLIC_TOKEN'])(
    'does not flag %s (carve-out)',
    (key) => {
      expect(isSecretKey(key)).toBe(false);
    }
  );

  it('is case-insensitive', () => {
    expect(isSecretKey('secret_key')).toBe(true);
    expect(isSecretKey('AuthHeader')).toBe(false); // no underscore = no match
  });
});

describe('maskValue', () => {
  it('renders dots up to 8 chars', () => {
    expect(maskValue('abc')).toBe('•••');
    expect(maskValue('12345678')).toBe('••••••••');
  });

  it('appends length for longer values', () => {
    expect(maskValue('a'.repeat(32))).toBe('•••••••• (32)');
  });

  it('handles empty input', () => {
    expect(maskValue('')).toBe('••••');
  });
});
