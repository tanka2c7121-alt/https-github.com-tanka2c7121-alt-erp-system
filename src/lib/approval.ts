import type { UserRole } from "../types/roles";

export type ApprovalRole = "관리자" | "총괄관리" | "부서장" | "직원";

type ApprovalUser = {
  role?: UserRole | string | null;
  approval_role?: string | null;
  department?: string | null;
};

export const getApprovalRole = (user?: ApprovalUser | null): ApprovalRole => {
  if (!user) return "직원";
  if (user.role === "ADMIN" || user.approval_role === "관리자") return "관리자";
  if (user.role === "CHIEF" || user.approval_role === "총괄관리") return "총괄관리";
  if (user.role === "LEADER" || user.approval_role === "부서장") return "부서장";
  return "직원";
};

export const isAdminUser = (user?: ApprovalUser | null) =>
  getApprovalRole(user) === "관리자";

export const isChiefUser = (user?: ApprovalUser | null) =>
  getApprovalRole(user) === "총괄관리";

export const isDepartmentHeadUser = (user?: ApprovalUser | null) =>
  getApprovalRole(user) === "부서장";

export const isSameDepartment = (
  user?: ApprovalUser | null,
  department?: string | null
) => Boolean(user?.department && department && user.department === department);
