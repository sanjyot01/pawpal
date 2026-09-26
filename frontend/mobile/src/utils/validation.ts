/**
 * Client-side checks for the things the app can know without asking the server:
 * presence and format. They exist to save a round trip and to put the error next
 * to the field, not to enforce anything — the backend's @NotBlank/@Email/@Size on
 * AuthController is the boundary that actually holds, and it is still the only
 * thing standing between a hand-rolled HTTP request and the database.
 *
 * Keep these mirroring the backend's format rules and nothing more. Business
 * rules ("is this email taken", "is this walk full") depend on server state and
 * belong only on the server.
 *
 * Each returns an error string, or undefined when the value is acceptable.
 */

/** Matches the backend's @Email on RegisterBody. Deliberately permissive. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors @Size(min = 6) on RegisterBody.password. */
export const MIN_PASSWORD_LENGTH = 6;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (!value) return 'Email is required';
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address';
  return undefined;
}

export function validateName(name: string): string | undefined {
  if (!name.trim()) return 'Name is required';
  return undefined;
}

/** Login only checks presence: the length rule is the server's to enforce on an
 *  existing account, and an account made before the rule would be un-loginable. */
export function validateLoginPassword(password: string): string | undefined {
  if (!password) return 'Password is required';
  return undefined;
}

export function validateNewPassword(password: string): string | undefined {
  if (!password) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return undefined;
}
