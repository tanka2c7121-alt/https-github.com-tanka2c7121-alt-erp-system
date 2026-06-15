"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";

import { supabaseAuthPassword } from "../../lib/authPassword";
import { initialPasswordFromPhone } from "../../lib/passwordPolicy";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

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

type Props = {
  onLogin: (user: LoginUser) => void;
};

const rememberedUserIdKey = "erpRememberedUserId";
const showLogoAnimation = false;
const departments = ["관리부", "도장부", "판금부", "정비부"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const brandMarks = [
  {
    name: "ASTON MARTIN",
    logoSrc: "https://pngimg.com/uploads/aston_martin/aston_martin_PNG1.png",
  },
  {
    name: "Mercedes-Benz",
    logoSrc: "https://pngimg.com/uploads/car_logo/car_logo_PNG1655.png",
  },
  {
    name: "BMW",
    logoSrc: "https://pngimg.com/uploads/car_logo/car_logo_PNG1641.png",
  },
  {
    name: "Ferrari",
    logoSrc: "https://pngimg.com/uploads/car_logo/car_logo_PNG1642.png",
  },
  {
    name: "BUGATTI",
    logoSrc: "https://pngimg.com/uploads/bugatti_logo/bugatti_logo_PNG10.png",
  },
  {
    name: "Porsche",
    logoSrc: "https://pngimg.com/uploads/porsche_logo/porsche_logo_PNG1.png",
  },
  {
    name: "Land Rover",
    logoSrc: "https://upload.wikimedia.org/wikipedia/commons/c/c2/Land_Rover_2023.svg",
  },
  {
    name: "Kia",
    logoSrc: "https://cdn.simpleicons.org/kia/05141F",
  },
  {
    name: "Lamborghini",
    logoSrc: "https://pngimg.com/uploads/lamborghini/lamborghini_PNG10709.png",
  },
  {
    name: "Hyundai",
    logoSrc: "https://cdn.simpleicons.org/hyundai/05141F",
  },
];
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

  const isLoginMode = mode === "login";
  const inputClass =
    "h-11 w-full rounded-lg border border-slate-200 bg-white/90 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
  const primaryButtonClass =
    "h-11 w-full rounded-lg bg-blue-700 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryButtonClass =
    "h-11 w-full rounded-lg border border-slate-200 bg-white/70 text-sm font-bold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <main className="login-showcase relative min-h-screen overflow-hidden bg-[#edf4fb] text-slate-900">
      <style>
        {`
          .login-showcase {
            background:
              linear-gradient(to bottom, rgba(248,252,255,0.12), rgba(234,244,253,0.18)),
              url("/login-background.png") center / cover no-repeat,
              linear-gradient(135deg, #f9fcff 0%, #e8f1fa 48%, #cddff1 100%);
          }

          .logo-animation-stage {
            position: absolute;
            left: 50%;
            top: clamp(132px, 22vh, 216px);
            width: min(560px, 58vw);
            height: clamp(96px, 14vh, 144px);
            transform: translateX(-50%);
            z-index: 5;
            pointer-events: none;
          }

          .logo-animation-stage::before {
            content: "";
            position: absolute;
            inset: -30px -72px;
            border-radius: 999px;
            background: radial-gradient(circle, rgba(255,255,255,0.96) 0 30%, rgba(255,255,255,0.78) 44%, rgba(255,255,255,0) 72%);
            filter: blur(4px);
            animation: logoBackdrop 2.2s ease forwards;
          }

          .spotlight-mark,
          .final-genesis-mark {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
          }

          .spotlight-mark {
            animation: logoFlash 0.3s ease both;
          }

          .spotlight-mark::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 50%;
            width: 300px;
            height: 130px;
            transform: translate(-50%, -50%);
            border-radius: 999px;
            background: radial-gradient(circle, rgba(255,255,255,0.95) 0 18%, rgba(82,150,226,0.34) 36%, transparent 72%);
            filter: blur(14px);
            animation: logoGlow 0.3s ease both;
          }

          .spotlight-mark:nth-child(1) { animation-delay: 0s; }
          .spotlight-mark:nth-child(2) { animation-delay: 0.3s; }
          .spotlight-mark:nth-child(3) { animation-delay: 0.6s; }
          .spotlight-mark:nth-child(4) { animation-delay: 0.9s; }
          .spotlight-mark:nth-child(5) { animation-delay: 1.2s; }
          .spotlight-mark:nth-child(6) { animation-delay: 1.5s; }
          .spotlight-mark:nth-child(7) { animation-delay: 1.8s; }
          .spotlight-mark:nth-child(8) { animation-delay: 2.1s; }
          .spotlight-mark:nth-child(9) { animation-delay: 2.4s; }
          .spotlight-mark:nth-child(10) { animation-delay: 2.7s; }
          .spotlight-mark:nth-child(1)::before { animation-delay: 0s; }
          .spotlight-mark:nth-child(2)::before { animation-delay: 0.3s; }
          .spotlight-mark:nth-child(3)::before { animation-delay: 0.6s; }
          .spotlight-mark:nth-child(4)::before { animation-delay: 0.9s; }
          .spotlight-mark:nth-child(5)::before { animation-delay: 1.2s; }
          .spotlight-mark:nth-child(6)::before { animation-delay: 1.5s; }
          .spotlight-mark:nth-child(7)::before { animation-delay: 1.8s; }
          .spotlight-mark:nth-child(8)::before { animation-delay: 2.1s; }
          .spotlight-mark:nth-child(9)::before { animation-delay: 2.4s; }
          .spotlight-mark:nth-child(10)::before { animation-delay: 2.7s; }

          .animated-logo-chip {
            position: relative;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: min(240px, 34vw);
            height: 124px;
            filter:
              drop-shadow(0 0 8px rgba(255,255,255,0.92))
              drop-shadow(0 18px 24px rgba(32,70,106,0.18));
          }

          .animated-logo-chip img {
            display: block;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }

          .final-genesis-mark {
            animation: finalGenesisGlow 1s ease 3.02s forwards;
          }

          .final-genesis-mark::before {
            content: "";
            position: absolute;
            width: min(520px, 54vw);
            height: 128px;
            border-radius: 999px;
            background:
              radial-gradient(circle, rgba(255,255,255,0.58) 0 18%, rgba(94,157,224,0.26) 38%, transparent 72%);
            filter: blur(12px);
          }

          .final-genesis-svg {
            position: relative;
            z-index: 1;
            width: min(300px, 40vw);
            height: auto;
            filter:
              drop-shadow(0 0 12px rgba(255,255,255,0.92))
              drop-shadow(0 18px 26px rgba(10,28,47,0.18));
          }

          .login-card-panel {
            width: min(430px, calc(100vw - 40px));
          }

          @keyframes logoFlash {
            0% { opacity: 0; transform: scale(0.58); filter: blur(12px); }
            24% { opacity: 1; transform: scale(1.06); filter: blur(0); }
            68% { opacity: 1; transform: scale(1); filter: blur(0); }
            100% { opacity: 0; transform: scale(1.18); filter: blur(8px); }
          }

          @keyframes logoGlow {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.48); }
            35% { opacity: 1; transform: translate(-50%, -50%) scale(1.08); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(1.28); }
          }

          @keyframes finalGenesisGlow {
            0% { opacity: 0; transform: scale(0.72); }
            42% { opacity: 1; transform: scale(1.06); }
            100% { opacity: 1; transform: scale(1); }
          }

          @keyframes logoBackdrop {
            0%, 84% { opacity: 0.95; }
            100% { opacity: 0.08; }
          }

          @media (max-width: 760px) {
            .logo-animation-stage {
              top: 18vh;
              width: 82vw;
            }

            .final-genesis-mark::before {
              width: 78vw;
            }

            .final-genesis-svg {
              width: 54vw;
            }

            .login-card-panel {
              margin-top: 50vh;
            }
          }
        `}
      </style>

      {showLogoAnimation && (
        <div className="logo-animation-stage" aria-hidden="true">
          {brandMarks.map((brand) => (
            <div key={brand.name} className="spotlight-mark">
              <div className="animated-logo-chip">
                <img src={brand.logoSrc} alt="" />
              </div>
            </div>
          ))}
          <div className="final-genesis-mark">
            <img className="final-genesis-svg" src="/genesis-mark.png" alt="" />
          </div>
        </div>
      )}

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center px-5 pb-10 pt-[53.5vh] md:px-8">
        <div className="login-card-panel relative z-10 rounded-[14px] border border-white/80 bg-white/82 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur-md">
            {isLoginMode ? (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleLogin();
                }}
              >
                <input
                  type="email"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="이메일 아이디"
                  autoComplete="username"
                  className={inputClass}
                />

                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  className={inputClass}
                />

                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberId}
                    onChange={(event) => setRememberId(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-blue-700"
                  />
                  아이디 기억하기
                </label>

                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? "로그인 중..." : "로그인"}
                </button>

                <div className="flex items-center justify-between pt-1 text-sm font-medium text-slate-600">
                  <span />
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    disabled={loading}
                    className="transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    회원가입 신청
                  </button>
                </div>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSignup();
                }}
              >
                <input
                  type="email"
                  value={signupUserId}
                  onChange={(event) => setSignupUserId(event.target.value)}
                  placeholder="이메일 아이디"
                  autoComplete="username"
                  className={inputClass}
                />

                <input
                  value={signupName}
                  onChange={(event) => setSignupName(event.target.value)}
                  placeholder="이름"
                  autoComplete="name"
                  className={inputClass}
                />

                <select
                  value={signupDepartment}
                  onChange={(event) => setSignupDepartment(event.target.value)}
                  className={inputClass}
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
                  autoComplete="tel"
                  className={inputClass}
                />

                <div className="rounded-lg bg-blue-50 px-4 py-3 text-xs font-medium leading-5 text-blue-900">
                  초기 비밀번호는 전화번호 뒤 4자리 + !! 입니다.
                </div>

                <button type="submit" disabled={loading} className={primaryButtonClass}>
                  {loading ? "신청 중..." : "회원가입 신청"}
                </button>

                <button
                  type="button"
                  onClick={() => setMode("login")}
                  disabled={loading}
                  className={secondaryButtonClass}
                >
                  로그인으로 돌아가기
                </button>
              </form>
            )}
        </div>
      </section>
    </main>
  );
}
