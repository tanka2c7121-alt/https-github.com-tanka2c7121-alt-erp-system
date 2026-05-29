type Props = {
  user: any;
  onLogout: () => void;
};

export default function Topbar({ user, onLogout }: Props) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-white px-3 py-3 md:h-16 md:px-6 md:py-0">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-slate-900 md:text-xl">
          신흥현대서비스 ERP
        </h1>
        <p className="hidden text-xs text-slate-500 sm:block">
          Shinhung Hyundai Service Management System
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <div className="hidden text-sm text-slate-600 sm:block">
          {user?.role === "ADMIN" ? "관리자 모드" : "직원 모드"}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 md:px-4 md:text-sm"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
