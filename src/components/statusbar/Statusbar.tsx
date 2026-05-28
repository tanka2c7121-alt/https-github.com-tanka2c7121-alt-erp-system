type Props = {
  user: any;
};

export default function Statusbar({ user }: Props) {
  return (
    <footer className="flex h-10 items-center justify-between border-t bg-white px-6 text-xs text-slate-500">
      <div>
        로그인 사용자: {user?.user_name} ({user?.role})
      </div>
      <div>서버상태: 정상</div>
      <div>버전정보: v1.0.0</div>
    </footer>
  );
}
