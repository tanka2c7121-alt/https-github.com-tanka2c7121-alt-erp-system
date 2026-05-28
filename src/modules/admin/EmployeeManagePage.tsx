"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type AppUser = {
  id: number;
  user_id: string;
  password: string;
  user_name: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
};

export default function EmployeeManagePage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [editingUserId, setEditingUserId] =
  useState<number | null>(null);

  async function fetchUsers() {
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
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

  async function handleSaveUser() {
    if (!userId || !password || !userName) {
      alert("아이디, 비밀번호, 직원명을 입력하세요.");
      return;
    }

    let error = null;

if (editingUserId) {

  const result = await supabase
    .from("app_users")
    .update({
      user_id: userId,
      password,
      user_name: userName,
      role,
    })
    .eq("id", editingUserId);

  error = result.error;

} else {

  const result = await supabase
    .from("app_users")
    .insert({
      user_id: userId,
      password,
      user_name: userName,
      role,
      is_active: true,
    });

  error = result.error;
}

    if (error) {
      alert("직원 등록 실패: " + error.message);
      return;
    }

    setUserId("");
    setPassword("");
    setUserName("");
    setRole("STAFF");
    setEditingUserId(null);

    await fetchUsers();
    alert(
  editingUserId
    ? "직원 정보가 수정되었습니다."
    : "직원이 등록되었습니다."
);
  }

  async function toggleActive(user: AppUser) {
    const { error } = await supabase
      .from("app_users")
      .update({
        is_active: !user.is_active,
      })
      .eq("id", user.id);

    if (error) {
      alert("상태 변경 실패: " + error.message);
      return;
    }

    await fetchUsers();
  }

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">직원관리</h3>
        <p className="text-sm text-slate-600">
          직원 로그인 계정을 등록하고 사용 여부를 관리합니다.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h4 className="mb-4 text-lg font-bold">직원 등록</h4>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="아이디"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="직원명"
            value={userName}
            onChange={(e) => setUserName(e.target.value)} 
          />

          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="STAFF">STAFF</option>
            <option value="ADMIN">ADMIN</option>
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
                <th className="px-3 py-2">권한</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="px-3 py-2 font-semibold">{user.user_id}</td>
                  <td className="px-3 py-2">{user.user_name}</td>
                  <td className="px-3 py-2">{user.role}</td>
                  <td className="px-3 py-2">
                    {user.is_active ? "사용중" : "중지"}
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
                        setRole(user.role ?? "STAFF");
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
                         {user.is_active ? "중지" : "사용"}
                       </button>

                      </div>
                   </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-slate-500"
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