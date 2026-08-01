export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}
