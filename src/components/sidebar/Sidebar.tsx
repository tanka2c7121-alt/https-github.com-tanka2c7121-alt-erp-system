"use client";

import { useState } from "react";
import { menuData, type MenuItem } from "../../data/menuData";
import type { UserRole } from "../../types/roles";

type SidebarProps = {
  selectedMenuId: string;
  onSelectMenu: (menu: MenuItem) => void;
  isAdmin: boolean;
  userRole: UserRole;
  userDepartment?: string | null;
};

export default function Sidebar({
  selectedMenuId,
  onSelectMenu,
  isAdmin,
  userRole,
  userDepartment,
}: SidebarProps) {
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    employee: true,
    factory: true,
    "factory-outbound": true,
    sales: true,
  });

  const toggleMenu = (id: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const renderMenu = (items: MenuItem[], depth = 0) => {
    return items.map((item) => {
      if (item.roles && !item.roles.includes(userRole)) {
        return null;
      }

      if (
        item.departments &&
        !isAdmin &&
        !item.departments.includes(userDepartment ?? "")
      ) {
        return null;
      }

      const hasChildren = Boolean(item.children && item.children.length > 0);
      const isOpen = openMenus[item.id];
      const isSelected = selectedMenuId === item.id;

      return (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => {
              if (hasChildren) toggleMenu(item.id);
              onSelectMenu(item);
            }}
            className={[
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
              isSelected
                ? "bg-blue-600 text-white"
                : "text-slate-200 hover:bg-slate-700",
            ].join(" ")}
            style={{ paddingLeft: `${12 + depth * 18}px` }}
          >
            <span>{item.title}</span>
            {hasChildren && <span>{isOpen ? "▾" : "▸"}</span>}
          </button>

          {hasChildren && isOpen && (
            <div className="mt-1 space-y-1">
              {renderMenu(item.children ?? [], depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <aside className="h-full w-64 overflow-y-auto bg-slate-900 py-4 pl-10 pr-4 text-white">
      <div className="mb-6">
        <div className="text-lg font-bold">ERP MENU</div>
        <div className="text-xs text-slate-400">업무 메뉴</div>
      </div>

      <nav className="space-y-1">{renderMenu(menuData)}</nav>
    </aside>
  );
}
