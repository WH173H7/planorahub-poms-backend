export type CrmUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  status: string;
  must_change_password: boolean;
  role_id: string;
  role_code: string;
  role_name: string;
  department_id: string | null;
  department_name: string | null;
  permissions: string[];
};

export type AuthMeResponse = { success: true; data: CrmUser };
