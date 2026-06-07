"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type EmployeeStatusPageProps = {
  departmentFilter?: string;
  canManage: boolean;
  userRole: UserRole;
  onOpenManage: () => void;
};

type Employee = {
  id: number;
  user_id: string;
  user_name: string | null;
  department: string | null;
  phone_number: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

const departments = ["관리부", "도장부", "판금부", "정비부"];

export default function EmployeeStatusPage({
  departmentFilter,
  canManage,
  userRole,
  onOpenManage,
}: EmployeeStatusPageProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [openPhoneEmployeeId, setOpenPhoneEmployeeId] = useState<number | null>(null);
  const isStaffMode = userRole === "STAFF";

  const loadEmployees = useCallback(async () => {
    setLoading(true);

    const contactResult = await supabase.rpc("get_employee_contacts");

    if (!contactResult.error) {
      setEmployees((contactResult.data ?? []) as Employee[]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("app_users")
      .select("id, user_id, user_name, department, phone_number, role, is_active, created_at")
      .order("department", { ascending: true })
      .order("user_name", { ascending: true });

    setLoading(false);

    if (error) {
      alert("직원현황 조회 실패: " + error.message);
      return;
    }

    setEmployees(data ?? []);
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const visibleEmployees = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return employees
      .filter((employee) =>
        departmentFilter ? employee.department === departmentFilter : true
      )
      .filter((employee) => {
        if (!keyword) return true;

        return [
          employee.user_id,
          employee.user_name ?? "",
          employee.department ?? "",
          employee.phone_number ?? "",
          employee.role ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [departmentFilter, employees, searchText]);

  const activeCount = visibleEmployees.filter((item) => item.is_active).length;
  const pendingCount = visibleEmployees.filter((item) => !item.is_active).length;
  const adminCount = visibleEmployees.filter((item) => item.role === "ADMIN").length;
  const staffCount = visibleEmployees.filter((item) => item.role === "STAFF").length;

  const departmentSummary = departments.map((department) => {
    const departmentEmployees = visibleEmployees.filter(
      (employee) => employee.department === department
    );

    return {
      department,
      total: departmentEmployees.length,
      active: departmentEmployees.filter((employee) => employee.is_active).length,
      pending: departmentEmployees.filter((employee) => !employee.is_active).length,
      employees: departmentEmployees,
    };
  });

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">
            {departmentFilter ? `${departmentFilter} 직원현황` : "직원현황"}
          </h3>
          <p className="text-sm text-slate-600">
            부서별 직원, 승인대기, 권한 상태를 한눈에 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadEmployees()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            새로고침
          </button>

          {canManage && (
            <button
              type="button"
              onClick={onOpenManage}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              직원관리
            </button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard title="전체 직원" value={visibleEmployees.length} tone="blue" />
        <SummaryCard title="사용중" value={activeCount} tone="green" />
        <SummaryCard title="승인대기" value={pendingCount} tone="orange" />
        <SummaryCard title="관리자 / 직원" value={`${adminCount} / ${staffCount}`} tone="slate" />
      </section>

      {isStaffMode && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-lg font-bold">부서별 직원 카드</h4>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              {visibleEmployees.length.toLocaleString()}명
            </span>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
              직원현황을 불러오는 중입니다.
            </div>
          ) : visibleEmployees.length === 0 ? (
            <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
              조회된 직원이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {departmentSummary.map((item) => (
                <div
                  key={item.department}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h5 className="font-bold text-slate-900">{item.department}</h5>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-blue-700">
                      {item.total}명
                    </span>
                  </div>

                  {item.employees.length === 0 ? (
                    <div className="rounded-lg bg-white p-3 text-sm text-slate-500">
                      직원 없음
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {item.employees.map((employee) => {
                        const isOpen = openPhoneEmployeeId === employee.id;

                        return (
                          <button
                            key={employee.id}
                            type="button"
                            onClick={() =>
                              setOpenPhoneEmployeeId((prev) =>
                                prev === employee.id ? null : employee.id
                              )
                            }
                            className="w-full rounded-lg bg-white px-3 py-2 text-left transition hover:bg-blue-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {employee.user_name ?? "-"}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500">
                                {employee.is_active ? "사용중" : "승인대기"}
                              </span>
                            </div>

                            {isOpen && (
                              <div className="mt-2 rounded bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-700">
                                {employee.phone_number ?? "-"}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!departmentFilter && !isStaffMode && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {departmentSummary.map((item) => (
            <div
              key={item.department}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">{item.department}</h4>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {item.total}명
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-green-50 p-3 text-green-700">
                  <div className="text-xs font-semibold">사용중</div>
                  <div className="mt-1 text-xl font-bold">{item.active}</div>
                </div>
                <div className="rounded-lg bg-orange-50 p-3 text-orange-700">
                  <div className="text-xs font-semibold">승인대기</div>
                  <div className="mt-1 text-xl font-bold">{item.pending}</div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {!isStaffMode && (
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-bold">직원 목록</h4>
            <p className="text-sm text-slate-500">
              총 {visibleEmployees.length.toLocaleString()}명
            </p>
          </div>

          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="이름 / 아이디 / 전화번호 검색"
            className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">부서</th>
                <th className="px-3 py-2">전화번호</th>
                <th className="px-3 py-2">아이디</th>
                <th className="px-3 py-2">권한</th>
                <th className="px-3 py-2">상태</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    직원현황을 불러오는 중입니다.
                  </td>
                </tr>
              ) : visibleEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    조회된 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                visibleEmployees.map((employee) => (
                  <tr key={employee.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold">
                      {employee.user_name ?? "-"}
                    </td>
                    <td className="px-3 py-2">{employee.department ?? "-"}</td>
                    <td className="px-3 py-2">{employee.phone_number ?? "-"}</td>
                    <td className="px-3 py-2">{employee.user_id}</td>
                    <td className="px-3 py-2">
                      {employee.role === "ADMIN" ? "관리자" : "직원"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          employee.is_active
                            ? "rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                            : "rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700"
                        }
                      >
                        {employee.is_active ? "사용중" : "승인대기"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number | string;
  tone: "blue" | "green" | "orange" | "slate";
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-green-100 bg-green-50 text-green-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
