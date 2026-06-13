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

  const getVisibleExpandableMenuIds = (items: MenuItem[]): string[] => {
    return items.flatMap((item) => {
      if (item.roles && !item.roles.includes(userRole)) {
        return [];
      }

      if (
        item.departments &&
        !isAdmin &&
        !item.departments.includes(userDepartment ?? "")
      ) {
        return [];
      }

      const childIds = getVisibleExpandableMenuIds(item.children ?? []);

      return item.children && item.children.length > 0
        ? [item.id, ...childIds]
        : childIds;
    });
  };

  const toggleAllMenus = () => {
    const expandableIds = getVisibleExpandableMenuIds(menuData);
    const shouldOpen = expandableIds.some((id) => !openMenus[id]);

    setOpenMenus(
      Object.fromEntries(expandableIds.map((id) => [id, shouldOpen]))
    );
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
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition",
              isSelected
                ? "bg-blue-500 text-white shadow-sm"
                : "text-slate-700 hover:bg-white/70",
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
    <aside className="h-full w-64 overflow-y-auto border-r border-white/70 bg-white/60 py-4 pl-10 pr-4 text-slate-900 shadow-xl shadow-slate-300/30 backdrop-blur-2xl">
      <div className="mb-6">
        <button
          type="button"
          onClick={toggleAllMenus}
          className="rounded-lg text-left text-lg font-bold text-slate-950 underline-offset-4 hover:underline"
        >
          ERP MENU
        </button>
        <div className="text-xs text-slate-500">업무 메뉴</div>
      </div>

      <nav className="space-y-1">{renderMenu(menuData)}</nav>
    </aside>
  );
}
