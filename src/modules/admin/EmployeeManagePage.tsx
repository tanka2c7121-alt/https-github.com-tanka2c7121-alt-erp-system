"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type AppUser = {
  id: number;
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
const approvalRoles = ["직원", "부서장", "관리부", "관리자"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmployeeManagePage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
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

    setUsers(data ?? []);
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  function resetForm() {
    setUserId("");
    setPassword("");
    setUserName("");
    setDepartment("관리부");
    setPhoneNumber("");
    setRole("STAFF");
    setApprovalRole("직원");
    setEditingUserId(null);
  }

  async function handleSaveUser() {
    if (!userId || !password || !userName) {
      alert("아이디, 비밀번호, 직원명을 입력하세요.");
      return;
    }

    if (!emailPattern.test(userId)) {
      alert("아이디는 이메일 형식으로 입력하세요.");
      return;
    }

    const payload = {
      user_id: userId,
      password,
      user_name: userName,
      department,
      phone_number: phoneNumber,
      role,
      approval_role: approvalRole,
    };

    const result = editingUserId
      ? await supabase.from("app_users").update(payload).eq("id", editingUserId)
      : await supabase.from("app_users").insert({
          ...payload,
          is_active: true,
        });

    if (result.error) {
      alert("직원 등록 실패: " + result.error.message);
      return;
    }

    resetForm();
    await fetchUsers();
    alert(editingUserId ? "직원 정보가 수정되었습니다." : "직원이 등록되었습니다.");
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

    if (!ok) {
      return;
    }

    const { error } = await supabase
      .from("app_users")
      .delete()
      .eq("id", user.id);

    if (error) {
      alert("직원 삭제 실패: " + error.message);
      return;
    }

    if (editingUserId === user.id) {
      resetForm();
    }

    await fetchUsers();
  }

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">직원관리</h3>
        <p className="text-sm text-slate-600">
          직원 로그인 계정을 등록하고 회원가입 신청을 승인합니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="mb-4 text-lg font-bold">
          {editingUserId ? "직원 수정" : "직원 등록"}
        </h4>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-8">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="이메일 아이디"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="비밀번호"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

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
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={approvalRole}
            onChange={(event) => setApprovalRole(event.target.value)}
          >
            {approvalRoles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSaveUser}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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
                  <td className="px-3 py-2">{user.role}</td>
                  <td className="px-3 py-2">{user.approval_role ?? "직원"}</td>
                  <td className="px-3 py-2">
                    {user.is_active ? "사용중" : "승인대기"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setUserId(user.user_id);
                          setPassword(user.password);
                          setUserName(user.user_name ?? "");
                          setDepartment(user.department ?? "관리부");
                          setPhoneNumber(user.phone_number ?? "");
                          setRole(user.role ?? "STAFF");
                          setApprovalRole(user.approval_role ?? "직원");
                        }}
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
                        className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-red-100 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
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
