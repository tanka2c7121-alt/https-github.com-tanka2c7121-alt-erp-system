export type UserRole = "ADMIN" | "CHIEF" | "LEADER" | "STAFF";

export const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "ADMIN", label: "ADMIN / 관리자" },
  { value: "CHIEF", label: "CHIEF / 총괄관리" },
  { value: "LEADER", label: "LEADER / 부서장" },
  { value: "STAFF", label: "STAFF / 일반직원" },
];

export const roleLabel = (role?: string | null) => {
  if (role === "ADMIN") return "관리자";
  if (role === "CHIEF") return "총괄관리";
  if (role === "LEADER") return "부서장";
  return "일반직원";
};

export const isUserRole = (value?: string | null): value is UserRole =>
  value === "ADMIN" ||
  value === "CHIEF" ||
  value === "LEADER" ||
  value === "STAFF";
