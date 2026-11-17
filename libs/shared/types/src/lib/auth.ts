export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  /** The clinic this session acts for. */
  clinic: { id: string; name: string };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}
