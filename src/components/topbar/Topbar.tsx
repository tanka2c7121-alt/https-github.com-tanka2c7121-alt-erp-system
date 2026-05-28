type Props = {
  user: any;
  onLogout: () => void;
};

export default function Topbar({
  user,
  onLogout,
}: Props) {
  return (
    <header className="h-16 border-b bg-white px-6 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          신흥현대서비스 ERP
        </h1>
        <p className="text-xs text-slate-500">
          Shinhung Hyundai Service Management System
        </p>
      </div>

      <div className="text-sm text-slate-600">
        {user?.role === "ADMIN" ? "관리자 모드" : "직원 모드"}
      </div>
      <div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
      >
       로그아웃
     </button>
     </div>
    </header>
  );
}