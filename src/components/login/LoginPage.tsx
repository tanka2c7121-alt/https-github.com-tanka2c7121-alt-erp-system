"use client";

import { useState } from "react";

import { supabase } from "../../lib/supabase";

type LoginUser = {
  id: string;
  user_id: string;
  user_name: string;
  role: "ADMIN" | "STAFF";
  is_active: boolean;
};

type Props = {
  onLogin: (user: LoginUser) => void;
};

export default function LoginPage({
  onLogin,
}: Props) {

  const [userId, setUserId] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  async function handleLogin() {

    if (!userId || !password) {
      alert("아이디/비밀번호 입력");
      return;
    }

    setLoading(true);

    const { data, error } =
      await supabase
        .from("app_users")
        .select("*")
        .eq("user_id", userId)
        .eq("password", password)
        .eq("is_active", true)
        .single();

    setLoading(false);

    if (error || !data) {
  alert("로그인 실패");
  return;
}

localStorage.setItem("erpUser", JSON.stringify(data));

onLogin(data);}

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">

      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">

        <h1 className="mb-2 text-3xl font-bold text-slate-900">
          ERP 로그인
        </h1>

        <p className="mb-6 text-sm text-slate-500">
          신흥현대서비스
        </p>

        <div className="space-y-4">

          <input
            value={userId}
            onChange={(e) =>
              setUserId(e.target.value)
            }
            placeholder="아이디"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="비밀번호"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
          >
            {loading
              ? "로그인중..."
              : "로그인"}
          </button>

        </div>

      </div>

    </div>
  )
}

