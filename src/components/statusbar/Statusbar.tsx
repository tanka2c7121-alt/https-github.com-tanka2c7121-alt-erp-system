import { roleLabel } from "../../types/roles";

type Props = {
  user: any;
};

export default function Statusbar({ user }: Props) {
  return (
    <footer className="flex min-h-10 items-center justify-between gap-2 border-t bg-white px-3 py-2 text-xs text-slate-500 md:h-10 md:px-6 md:py-0">
      <div className="truncate">
        로그인 사용자: {user?.user_name} ({roleLabel(user?.role)})
      </div>
      <div className="hidden sm:block">서버상태: 정상</div>
      <div className="hidden md:block">버전정보: v1.0.0</div>
    </footer>
  );
}
