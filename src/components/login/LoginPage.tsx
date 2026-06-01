"use client";

import { useEffect, useState } from "react";

import { supabaseAuthPassword } from "../../lib/authPassword";
import { initialPasswordFromPhone } from "../../lib/passwordPolicy";
import { supabase } from "../../lib/supabase";

type LoginUser = {
  id: string | number;
  auth_uid?: string | null;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: "ADMIN" | "STAFF";
  is_active: boolean;
  password?: string;
  phone_number?: string | null;
};

type Props = {
  onLogin: (user: LoginUser) => void;
};

const rememberedUserIdKey = "erpRememberedUserId";
const departments = ["관리부", "도장부", "판금부", "정비부"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const phoneDigits = (value: string) => value.replace(/\D/g, "");

const formatPhoneNumber = (value: string) => {
  const numbers = phoneDigits(value).slice(0, 11);

  if (numbers.length < 4) return numbers;
  if (numbers.length < 8) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;

  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
};

async function loadUserProfile(authUserId: string, email: string) {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .or(`auth_uid.eq.${authUserId},user_id.eq.${email}`)
    .maybeSingle();

  if (error || !data) {
    return { data: null, error };
  }

  if (!data.auth_uid) {
    await supabase
      .from("app_users")
      .update({ auth_uid: authUserId })
      .eq("id", data.id)
      .is("auth_uid", null);
  }

  return {
    data: {
      ...data,
      auth_uid: data.auth_uid ?? authUserId,
    } as LoginUser,
    error: null,
  };
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [loading, setLoading] = useState(false);

  const [signupUserId, setSignupUserId] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupDepartment, setSignupDepartment] = useState("관리부");
  const [signupPhone, setSignupPhone] = useState("");

  useEffect(() => {
    const rememberedUserId = localStorage.getItem(rememberedUserIdKey);

    if (!rememberedUserId) {
      return;
    }

    setUserId(rememberedUserId);
    setRememberId(true);
  }, []);

  async function handleLogin() {
    const normalizedUserId = userId.trim().toLowerCase();

    if (!normalizedUserId || !password) {
      alert("아이디와 비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);

    const passwordCandidates = Array.from(
      new Set([password, supabaseAuthPassword(password)])
    );
    let authUserId = "";
    let authErrorMessage = "";

    for (const authPassword of passwordCandidates) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedUserId,
        password: authPassword,
      });

      if (data.user) {
        authUserId = data.user.id;
        break;
      }

      authErrorMessage = error?.message ?? "";
    }

    if (!authUserId) {
      setLoading(false);
      alert(
        "로그인에 실패했습니다. Supabase Auth 비밀번호를 확인하세요." +
          (authErrorMessage ? `\n${authErrorMessage}` : "")
      );
      return;
    }

    const { data: profile } = await loadUserProfile(authUserId, normalizedUserId);

    if (!profile) {
      setLoading(false);
      alert("로그인 계정은 확인됐지만 직원정보가 없습니다. app_users 연결을 확인하세요.");
      return;
    }

    if (!profile.is_active) {
      setLoading(false);
      alert("아직 승인되지 않은 계정입니다. 관리자 승인 후 로그인하세요.");
      return;
    }

    if (profile.password !== password) {
      await supabase.from("app_users").update({ password }).eq("id", profile.id);
      profile.password = password;
    }

    setLoading(false);

    if (rememberId) {
      localStorage.setItem(rememberedUserIdKey, normalizedUserId);
    } else {
      localStorage.removeItem(rememberedUserIdKey);
    }

    onLogin(profile);
  }

  async function handleSignup() {
    const normalizedSignupUserId = signupUserId.trim().toLowerCase();
    const phoneNumber = phoneDigits(signupPhone);
    const initialPassword = initialPasswordFromPhone(phoneNumber);

    if (!normalizedSignupUserId || !signupName || !signupDepartment || !phoneNumber) {
      alert("아이디, 이름, 부서, 전화번호를 모두 입력하세요.");
      return;
    }

    if (!emailPattern.test(normalizedSignupUserId)) {
      alert("아이디는 이메일 형식으로 입력하세요.");
      return;
    }

    if (phoneNumber.length < 4) {
      alert("전화번호는 4자리 이상 입력하세요.");
      return;
    }

    setLoading(true);

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: normalizedSignupUserId,
      password: supabaseAuthPassword(initialPassword),
      options: {
        data: {
          user_name: signupName,
          department: signupDepartment,
          phone_number: signupPhone,
        },
      },
    });

    if (signupError) {
      setLoading(false);
      alert("Supabase 계정 생성 실패: " + signupError.message);
      return;
    }

    const { error } = await supabase.from("app_users").insert({
      auth_uid: signupData.user?.id ?? null,
      user_id: normalizedSignupUserId,
      password: initialPassword,
      user_name: signupName,
      department: signupDepartment,
      phone_number: signupPhone,
      role: "STAFF",
      approval_role: "직원",
      is_active: false,
    });

    setLoading(false);

    if (error) {
      alert("회원가입 신청 실패: " + error.message);
      return;
    }

    alert("회원가입 신청이 완료되었습니다. 관리자 승인 후 초기 비밀번호는 전화번호 뒤 4자리 + !! 입니다.");
    setSignupUserId("");
    setSignupName("");
    setSignupDepartment("관리부");
    setSignupPhone("");
    setMode("login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">ERP 로그인</h1>

        <p className="mb-6 text-sm text-slate-500">
          자동차공업사 업무 시스템
        </p>

        {mode === "login" ? (
          <div className="space-y-4">
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="이메일 아이디"
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

            <button
              type="button"
              onClick={() => setMode("signup")}
              className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              회원가입 신청
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              value={signupUserId}
              onChange={(event) => setSignupUserId(event.target.value)}
              placeholder="이메일 아이디"
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <input
              value={signupName}
              onChange={(event) => setSignupName(event.target.value)}
              placeholder="이름"
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <select
              value={signupDepartment}
              onChange={(event) => setSignupDepartment(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>

            <input
              value={signupPhone}
              onChange={(event) =>
                setSignupPhone(formatPhoneNumber(event.target.value))
              }
              placeholder="전화번호"
              className="w-full rounded-xl border border-slate-300 px-4 py-3"
            />

            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              신청 후 관리자가 승인해야 로그인할 수 있습니다. 초기 비밀번호는
              전화번호 뒤 4자리 + !! 입니다.
            </div>

            <button
              type="button"
              onClick={handleSignup}
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "신청 중..." : "회원가입 신청"}
            </button>

            <button
              type="button"
              onClick={() => setMode("login")}
              className="w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50"
            >
              로그인으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
