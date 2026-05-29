"use client";

import { useEffect, useState } from "react";

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

const rememberedUserIdKey = "erpRememberedUserId";

export default function LoginPage({ onLogin }: Props) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rememberedUserId = localStorage.getItem(rememberedUserIdKey);

    if (!rememberedUserId) {
      return;
    }

    setUserId(rememberedUserId);
    setRememberId(true);
  }, []);

  async function handleLogin() {
    if (!userId || !password) {
      alert("아이디와 비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .eq("user_id", userId)
      .eq("password", password)
      .eq("is_active", true)
      .single();

    setLoading(false);

    if (error || !data) {
      alert("로그인에 실패했습니다.");
      return;
    }

    if (rememberId) {
      localStorage.setItem(rememberedUserIdKey, userId);
    } else {
      localStorage.removeItem(rememberedUserIdKey);
    }

    onLogin(data);
  }

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
            onChange={(event) => setUserId(event.target.value)}
            placeholder="아이디"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={rememberId}
              onChange={(event) => setRememberId(event.target.checked)}
              className="h-4 w-4"
            />
            아이디 기억하기
          </label>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </div>
      </div>
    </div>
  );
}
