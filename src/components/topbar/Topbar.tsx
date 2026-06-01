import { useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { roleLabel } from "../../types/roles";

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
    <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-white px-3 py-3 md:h-16 md:px-6 md:py-0">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-slate-900 md:text-xl">
          ?좏씎?꾨??쒕퉬??ERP
        </h1>
        <p className="hidden text-xs text-slate-500 sm:block">
          Shinhung Hyundai Service Management System
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-4">
        <div className="hidden text-sm text-slate-600 sm:block">
          {roleLabel(user?.role)} 모드
        </div>

        {notifications.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen((value) => !value)}
              className="relative rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
            >
              ?뚮┝
              {totalCount > 0 && (
                <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {totalCount}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
                <div className="mb-2 font-bold text-slate-900">?뱀씤 ?뚮┝</div>

                {activeNotifications.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-4 text-center text-slate-500">
                    ???뚮┝???놁뒿?덈떎.
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
                        <span className="font-semibold text-slate-800">
                          {item.title}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                          {item.count}嫄?                        </span>
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
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 md:px-4 md:text-sm"
        >
          濡쒓렇?꾩썐
        </button>
      </div>
    </header>
  );
}
