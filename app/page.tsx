"use client";

import { useMemo, useState } from "react";

import MainLayout from "../src/components/layout/MainLayout";
import LoginPage from "../src/components/login/LoginPage";
import { supabaseAuthPassword } from "../src/lib/authPassword";
import {
  initialPasswordFromPhone,
  isValidErpPassword,
  passwordRuleText,
} from "../src/lib/passwordPolicy";
import { supabase } from "../src/lib/supabase";
import type { UserRole } from "../src/types/roles";

type LoginUser = {
  id: string | number;
  auth_uid?: string | null;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
  is_active: boolean;
  password?: string;
  phone_number?: string | null;
};

export default function Home() {
  const [user, setUser] = useState<LoginUser | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const needsPasswordChange = useMemo(() => {
    if (!user?.phone_number || !user.password) {
      return false;
    }

    const initialPassword = initialPasswordFromPhone(user.phone_number);

    return Boolean(initialPassword) && user.password === initialPassword;
  }, [user]);

  if (!user) {
    return <LoginPage onLogin={(loginUser) => setUser(loginUser)} />;
  }

  if (needsPasswordChange) {
    return (
      <PasswordChangePage
        user={user}
        onComplete={(newPassword) =>
          setUser({
            ...user,
            password: newPassword,
          })
        }
        onLogout={handleLogout}
      />
    );
  }

  return <MainLayout user={user} onLogout={handleLogout} />;
}

function PasswordChangePage({
  user,
  onComplete,
  onLogout,
}: {
  user: LoginUser;
  onComplete: (newPassword: string) => void;
  onLogout: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
    if (!isValidErpPassword(newPassword)) {
      alert(passwordRuleText);
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("새 비밀번호가 서로 다릅니다.");
      return;
    }

    if (newPassword === initialPasswordFromPhone(user.phone_number ?? "")) {
      alert("초기 비밀번호와 다른 비밀번호를 입력하세요.");
      return;
    }

    setSaving(true);

    const { error: authError } = await supabase.auth.updateUser({
      password: supabaseAuthPassword(newPassword),
    });

    if (authError) {
      setSaving(false);
      alert("Supabase 비밀번호 변경 실패: " + authError.message);
      return;
    }

    const { error } = await supabase
      .from("app_users")
      .update({ password: newPassword })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      alert("비밀번호 변경 실패: " + error.message);
      return;
    }

    alert("비밀번호가 변경되었습니다.");
    onComplete(newPassword);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          비밀번호 변경
        </h1>

        <p className="mb-6 text-sm text-slate-500">
          초기 비밀번호로 로그인했습니다. 계속 사용하려면 새 비밀번호로 변경하세요.
        </p>

        <div className="space-y-4">
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="새 비밀번호"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="새 비밀번호 확인"
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />

          <button
            type="button"
            onClick={handleChangePassword}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "변경 중..." : "비밀번호 변경"}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
