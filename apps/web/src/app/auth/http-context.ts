import { HttpContextToken } from '@angular/common/http';

/**
 * Requests whose screen reports every failure itself, inline (sign-up, password reset, invitation):
 * the error interceptor's toast would say the same thing twice.
 */
export const HANDLES_OWN_ERRORS = new HttpContextToken<boolean>(() => false);
