type Props = {
  user: any;
};

export default function Statusbar({
  user,
}: Props) {
  return (
    <footer className="h-10 border-t bg-white px-6 flex items-center justify-between text-xs text-slate-500">
      <div>
        로그인사용자: {user?.user_name} ({user?.role})
      </div>
      <div>서버상태: 정상</div>
      <div>버전정보: v1.0.0</div>
    </footer>
  );
}