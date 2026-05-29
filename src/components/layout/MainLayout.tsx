"use client";

import { useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import Topbar from "../topbar/Topbar";
import Statusbar from "../statusbar/Statusbar";
import { menuData, type MenuItem } from "../../data/menuData";

import WorkRegisterPage from "../../modules/factory/WorkRegisterPage";
import WorkPrintPage from "../../modules/factory/WorkPrintPage";
import FactoryDashboardPage from "../../modules/factory/FactoryDashboardPage";
import InboundStatusPage from "../../modules/factory/InboundstatusPage";
import OutboundStatusPage from "../../modules/factory/OutboundStatusPage";
import FactorySettlementPage from "../../modules/factory/FactorySettlementPage";
import SettlementRegisterPage from "../../modules/factory/SettlementRegisterPage";
import DailyCashPage from "../../modules/factory/DailyCashPage";
import DailyCashPrintPage from "../../modules/factory/DailyCashPrintPage";
import DailyCashRegisterPage from "../../modules/factory/DailyCashRegisterPage";
import SettlementMainPage from "../../modules/factory/SettlementMainPage";
import EmployeeManagePage from "../../modules/admin/EmployeeManagePage";
import EmployeeStatusPage from "../../modules/employee/EmployeeStatusPage";
import HomeDashboardPage from "../../modules/home/HomeDashboardPage";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  role: "ADMIN" | "STAFF";
  is_active: boolean;
};

type MainLayoutProps = {
  user: LoginUser;
  onLogout: () => void;
};

export default function MainLayout({ user, onLogout }: MainLayoutProps) {
  const isAdmin = user?.role === "ADMIN";
  const userRole = isAdmin ? "ADMIN" : "STAFF";

  const [selectedMenu, setSelectedMenu] = useState<MenuItem>({
    id: "dashboard",
    title: "대시보드",
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const selectedData = selectedMenu.data as
    | { workName?: string; nextWorkName?: string }
    | undefined;
  const mobileMenus = flattenMenus(menuData, userRole);
  const displayedMobileMenus = mobileMenus.some(
    (menu) => menu.id === selectedMenu.id
  )
    ? mobileMenus
    : [selectedMenu, ...mobileMenus];

  const handleMobileMenuChange = (menuId: string) => {
    const nextMenu = displayedMobileMenus.find((menu) => menu.id === menuId);

    if (nextMenu) {
      setSelectedMenu(nextMenu);
    }
  };

  const handleSelectMenu = (menu: MenuItem) => {
    setSelectedMenu(menu);
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <Topbar user={user} onLogout={onLogout} />

      <div className="flex flex-1 overflow-hidden">
        <div
          className={[
            "group/sidebar relative hidden h-full shrink-0 overflow-hidden bg-slate-900 transition-[width] duration-200 ease-out md:block",
            isSidebarOpen ? "w-64" : "w-4 hover:w-64",
          ].join(" ")}
        >
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute inset-y-0 left-0 z-20 w-4 bg-slate-900/90 transition-colors group-hover/sidebar:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-lg bg-slate-900 px-1 py-8 text-[10px] font-semibold text-slate-300 shadow-md"
          >
            MENU
          </button>
          <div className="h-full w-64 bg-slate-900 shadow-2xl">
            <Sidebar
              selectedMenuId={selectedMenu.id}
              onSelectMenu={handleSelectMenu}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 md:hidden">
            <label className="mb-1 block text-xs font-semibold text-slate-500">
              메뉴 선택
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
              value={selectedMenu.id}
              onChange={(event) => handleMobileMenuChange(event.target.value)}
            >
              {displayedMobileMenus.map((menu) => (
                <option key={menu.id} value={menu.id}>
                  {menu.title}
                </option>
              ))}
            </select>
          </div>

          <section className="min-h-[500px] rounded-xl border bg-white p-3 shadow-sm md:rounded-2xl md:p-6">
            {selectedMenu.id === "dashboard" ? (
              <HomeDashboardPage
                isAdmin={isAdmin}
                userName={user?.user_name}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "employee" ||
            selectedMenu.id === "employee-admin" ||
            selectedMenu.id === "employee-body" ||
            selectedMenu.id === "employee-paint" ||
            selectedMenu.id === "employee-repair" ? (
              <EmployeeStatusPage
                canManage={isAdmin}
                departmentFilter={
                  selectedMenu.id === "employee-admin"
                    ? "관리부"
                    : selectedMenu.id === "employee-body"
                      ? "판금부"
                      : selectedMenu.id === "employee-paint"
                        ? "도장부"
                        : selectedMenu.id === "employee-repair"
                          ? "정비부"
                          : undefined
                }
                onOpenManage={() =>
                  handleSelectMenu({
                    id: "employee-manage",
                    title: "직원관리",
                  })
                }
              />
            ) : selectedMenu.id === "employee-manage" && !isAdmin ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                직원관리 페이지는 관리자만 접근할 수 있습니다.
              </div>
            ) : selectedMenu.id === "employee-manage" ? (
              <EmployeeManagePage />
            ) : selectedMenu.id === "factory" ? (
              <FactoryDashboardPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-settlement" ? (
              <SettlementMainPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-settlement-repair-register" ? (
              <SettlementRegisterPage initialWorkName={selectedData?.workName} />
            ) : selectedMenu.id === "factory-settlement-repair" ? (
              <FactorySettlementPage onSelectMenu={handleSelectMenu} view="all" />
            ) : selectedMenu.id === "factory-settlement-daily-cash-register" ? (
              <DailyCashRegisterPage editData={selectedMenu.data as any} />
            ) : selectedMenu.id === "factory-settlement-daily-cash-print" ? (
              <DailyCashPrintPage />
            ) : selectedMenu.id === "factory-settlement-daily-cash" ? (
              <DailyCashPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-inbound" ? (
              <InboundStatusPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-outbound" ? (
              <OutboundStatusPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-work-register" ? (
              <WorkRegisterPage
                onSelectMenu={handleSelectMenu}
                initialWorkName={selectedData?.workName ?? selectedData?.nextWorkName}
              />
            ) : selectedMenu.id === "factory-work-print" ? (
              <WorkPrintPage
                workName={selectedData?.workName ?? selectedData?.nextWorkName}
              />
            ) : (
              <>
                <div className="text-sm text-slate-500">작업 화면 영역</div>

                <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-slate-600">
                  현재 선택한 메뉴:{" "}
                  <span className="font-semibold text-slate-900">
                    {selectedMenu.title}
                  </span>
                </div>
              </>
            )}
          </section>
        </main>
      </div>

      <Statusbar user={user} />
    </div>
  );
}

function flattenMenus(items: MenuItem[], role: "ADMIN" | "STAFF"): MenuItem[] {
  const result: MenuItem[] = [];

  items.forEach((item) => {
    if (item.roles && !item.roles.includes(role)) {
      return;
    }

    result.push(item);

    if (item.children?.length) {
      result.push(...flattenMenus(item.children, role));
    }
  });

  return result;
}
