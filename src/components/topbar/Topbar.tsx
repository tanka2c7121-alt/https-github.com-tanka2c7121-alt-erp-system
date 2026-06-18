import { useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { roleLabel } from "../../types/roles";
import GlobalVehicleSearch from "./GlobalVehicleSearch";

export type NotificationItem = {
  id: string;
  title: string;
  count: number;
  menu: MenuItem;
};

type Props = {
  user: any;
  onLogout: () => void;
  notifications?: NotificationItem[];
  onSelectMenu?: (menu: MenuItem) => void;
};

export default function Topbar({
  user,
  onLogout,
  notifications = [],
  onSelectMenu,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const activeNotifications = notifications.filter((item) => item.count > 0);
  const totalCount = activeNotifications.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return (
    <header className="relative z-50 flex min-h-16 items-center justify-between gap-3 border-b border-white/70 bg-white/75 px-3 py-3 shadow-sm shadow-slate-200/70 backdrop-blur-xl md:h-16 md:px-6 md:py-0">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-slate-900 md:text-xl">
          신흥현대서비스 ERP
        </h1>
        <p className="hidden text-xs text-slate-500 sm:block">
          Shinhung Hyundai Service Management System
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <GlobalVehicleSearch onSelectMenu={onSelectMenu} />

        <div className="hidden text-sm text-slate-600 sm:block">
          {roleLabel(user?.role)} 모드
        </div>

        {notifications.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((value) => !value)}
              className="relative rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white md:text-sm"
            >
              알림
              {totalCount > 0 && (
                <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalCount}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="fixed right-3 top-[64px] z-[1000] w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-2xl shadow-slate-300/60 md:right-6">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900">알림</div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    닫기
                  </button>
                </div>

                {activeNotifications.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-4 text-center text-slate-500">
                    확인할 알림이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelectMenu?.(item.menu);
                          setIsOpen(false);
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left hover:bg-blue-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            클릭하면 해당 목록으로 이동합니다.
                          </span>
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                          {item.count}건
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 md:px-4 md:text-sm"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
