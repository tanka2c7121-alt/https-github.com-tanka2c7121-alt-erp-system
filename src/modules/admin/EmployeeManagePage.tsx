"use client";

import { useEffect, useState } from "react";
import {
  initialPasswordFromPhone,
  isValidErpPassword,
  passwordRuleText,
} from "../../lib/passwordPolicy";
import { supabase } from "../../lib/supabase";
import { roleLabel, roleOptions } from "../../types/roles";

type AppUser = {
  id: number;
  auth_uid: string | null;
  user_id: string;
  password: string;
  user_name: string | null;
  department: string | null;
  phone_number: string | null;
  approval_role: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
};

const departments = ["관리부", "도장부", "판금부", "정비부"];
const approvalRoles = ["직원", "부서장", "총괄관리", "관리자"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const approvalRoleByRole: Record<string, string> = {
  ADMIN: "관리자",
  CHIEF: "총괄관리",
  LEADER: "부서장",
  STAFF: "직원",
};

const normalizeApprovalRole = (role: string | null | undefined, approvalRole?: string | null) =>
  approvalRoles.includes(approvalRole ?? "")
    ? approvalRole ?? "직원"
    : approvalRoleByRole[role ?? ""] ?? "직원";

export default function EmployeeManagePage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [originalPassword, setOriginalPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [department, setDepartment] = useState("관리부");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState("STAFF");
  const [approvalRole, setApprovalRole] = useState("직원");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  async function fetchUsers() {
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("is_active", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      alert("직원 조회 실패: " + error.message);
      return;
    }

    setUsers((data ?? []) as AppUser[]);
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  function resetForm() {
    setUserId("");
    setPassword("");
    setOriginalPassword("");
    setUserName("");
    setDepartment("관리부");
    setPhoneNumber("");
    setRole("STAFF");
    setApprovalRole("직원");
    setEditingUserId(null);
  }

  async function handleSaveUser() {
    const normalizedUserId = userId.trim().toLowerCase();

    if (!normalizedUserId || !userName.trim()) {
      alert("아이디와 직원명을 입력하세요.");
      return;
    }

    if (!emailPattern.test(normalizedUserId)) {
      alert("아이디는 이메일 형식으로 입력하세요.");
      return;
    }

    if (!editingUserId && !isValidErpPassword(password)) {
      alert(passwordRuleText);
      return;
    }

    if (
      editingUserId &&
      password &&
      password !== originalPassword &&
      !isValidErpPassword(password)
    ) {
      alert(passwordRuleText);
      return;
    }

    const payload = {
      user_id: normalizedUserId,
      user_name: userName.trim(),
      department,
      phone_number: phoneNumber,
      role,
      approval_role: normalizeApprovalRole(role, approvalRole),
    };

    const result = editingUserId
      ? await supabase.from("app_users").update(payload).eq("id", editingUserId)
      : await supabase.from("app_users").insert({
          ...payload,
          password,
          is_active: true,
        });

    if (result.error) {
      alert("직원 저장 실패: " + result.error.message);
      return;
    }

    if (editingUserId && password && password !== originalPassword) {
      const { error } = await supabase.rpc("admin_reset_app_user_password", {
        target_user_id: normalizedUserId,
        new_password: password,
      });

      if (error) {
        alert(
          "직원정보는 수정됐지만 로그인 비밀번호 변경은 실패했습니다: " +
            error.message
        );
        await fetchUsers();
        return;
      }
    }

    resetForm();
    await fetchUsers();
    alert(editingUserId ? "직원정보가 수정되었습니다." : "직원이 등록되었습니다.");
  }

  async function toggleActive(user: AppUser) {
    const { error } = await supabase
      .from("app_users")
      .update({ is_active: !user.is_active })
      .eq("id", user.id);

    if (error) {
      alert("상태 변경 실패: " + error.message);
      return;
    }

    await fetchUsers();
  }

  async function handleDeleteUser(user: AppUser) {
    const ok = window.confirm(
      `${user.user_name ?? user.user_id} 직원을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`
    );

    if (!ok) return;

    const { error } = await supabase.from("app_users").delete().eq("id", user.id);

    if (error) {
      alert("직원 삭제 실패: " + error.message);
      return;
    }

    if (editingUserId === user.id) {
      resetForm();
    }

    await fetchUsers();
  }

  function startEdit(user: AppUser) {
    setEditingUserId(user.id);
    setUserId(user.user_id);
    setPassword(user.password);
    setOriginalPassword(user.password);
    setUserName(user.user_name ?? "");
    setDepartment(user.department ?? "관리부");
    setPhoneNumber(user.phone_number ?? "");
    setRole(user.role ?? "STAFF");
    setApprovalRole(normalizeApprovalRole(user.role, user.approval_role));
  }

  function fillInitialPassword() {
    if (!phoneNumber) {
      alert("전화번호를 먼저 입력하세요.");
      return;
    }

    setPassword(initialPasswordFromPhone(phoneNumber));
  }

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">직원관리</h3>
        <p className="text-sm text-slate-600">
          직원 계정 승인, 권한, 비밀번호를 관리합니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className="text-lg font-bold">
            {editingUserId ? "직원 수정" : "직원 등록"}
          </h4>

          {editingUserId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              새 등록
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-8">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="이메일 아이디"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />

          <div className="md:col-span-2">
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="비밀번호"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={fillInitialPassword}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                초기값
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              6자리 이상, 특수기호 포함. 초기값은 전화번호 뒤 4자리 + !!
            </p>
          </div>

          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="직원명"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
          />

          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            {departments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="전화번호"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
          />

          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value;
              setRole(nextRole);
              setApprovalRole(approvalRoleByRole[nextRole] ?? "직원");
            }}
          >
            {roleOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={approvalRole}
            onChange={(event) => setApprovalRole(event.target.value)}
            disabled
          >
            {approvalRoles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSaveUser}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {editingUserId ? "수정저장" : "등록"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="mb-4 text-lg font-bold">직원 목록</h4>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2">아이디</th>
                <th className="px-3 py-2">직원명</th>
                <th className="px-3 py-2">부서</th>
                <th className="px-3 py-2">전화번호</th>
                <th className="px-3 py-2">권한</th>
                <th className="px-3 py-2">승인권한</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">연동</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="px-3 py-2 font-semibold">{user.user_id}</td>
                  <td className="px-3 py-2">{user.user_name}</td>
                  <td className="px-3 py-2">{user.department}</td>
                  <td className="px-3 py-2">{user.phone_number}</td>
                  <td className="px-3 py-2">{roleLabel(user.role)}</td>
                  <td className="px-3 py-2">{user.approval_role ?? "직원"}</td>
                  <td className="px-3 py-2">
                    {user.is_active ? "사용중" : "승인대기"}
                  </td>
                  <td className="px-3 py-2">
                    {user.auth_uid ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
                        연결됨
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        미연결
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(user)}
                        className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-600"
                      >
                        수정
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleActive(user)}
                        className={
                          user.is_active
                            ? "rounded-lg bg-red-100 px-3 py-1 text-xs font-semibold text-red-600"
                            : "rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-600"
                        }
                      >
                        {user.is_active ? "중지" : "승인"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-slate-500"
                    colSpan={9}
                  >
                    등록된 직원이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
