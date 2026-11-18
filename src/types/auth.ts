export type AppRoleCode =
  | 'director'
  | 'project_manager'
  | 'estimator'
  | 'site_supervisor'
  | 'foreman'
  | 'purchasing'
  | 'warehouse'
  | 'finance'
  | 'hr'
  | 'admin';

export type RoleScope = 'company' | 'project' | 'both';

export interface UserProfile {
  id: string;
  employee_code?: string | null;
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  is_demo_user?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AppRole {
  id: string;
  code: AppRoleCode;
  name: string;
  scope: RoleScope;
  project_id: string | null;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_id: string;
  project_id: string | null;
  assigned_by?: string | null;
  assigned_at?: string;
}

export interface EffectivePermission {
  code: string;
  /** null means the permission applies at company scope. */
  project_id: string | null;
}

export interface MyAccess {
  profile: UserProfile | null;
  roles: AppRole[];
  permissions: EffectivePermission[];
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface ManagedUserAssignment extends UserRoleAssignment {
  role: AppRole | null;
  project_title: string | null;
}

export interface ManagedUser extends UserProfile {
  email: string;
  assignments: ManagedUserAssignment[];
}
