"use client";

import { useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import Topbar from "../topbar/Topbar";
import Statusbar from "../statusbar/Statusbar";
import type { MenuItem } from "../../data/menuData";

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

  const [selectedMenu, setSelectedMenu] = useState<MenuItem>({
    id: "dashboard",
    title: "대시보드",
  });

  const selectedData = selectedMenu.data as
    | { workName?: string; nextWorkName?: string }
    | undefined;

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <Topbar user={user} onLogout={onLogout} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          selectedMenuId={selectedMenu.id}
          onSelectMenu={setSelectedMenu}
          isAdmin={isAdmin}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <section className="min-h-[500px] rounded-2xl border bg-white p-6 shadow-sm">
            {selectedMenu.id === "employee" ||
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
                  setSelectedMenu({
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
              <FactoryDashboardPage onSelectMenu={setSelectedMenu} />
            ) : selectedMenu.id === "factory-settlement" ? (
              <SettlementMainPage onSelectMenu={setSelectedMenu} />
            ) : selectedMenu.id === "factory-settlement-repair-register" ? (
              <SettlementRegisterPage initialWorkName={selectedData?.workName} />
            ) : selectedMenu.id === "factory-settlement-repair" ? (
              <FactorySettlementPage onSelectMenu={setSelectedMenu} view="all" />
            ) : selectedMenu.id === "factory-settlement-daily-cash-register" ? (
              <DailyCashRegisterPage editData={selectedMenu.data as any} />
            ) : selectedMenu.id === "factory-settlement-daily-cash-print" ? (
              <DailyCashPrintPage />
            ) : selectedMenu.id === "factory-settlement-daily-cash" ? (
              <DailyCashPage onSelectMenu={setSelectedMenu} />
            ) : selectedMenu.id === "factory-inbound" ? (
              <InboundStatusPage onSelectMenu={setSelectedMenu} />
            ) : selectedMenu.id === "factory-outbound" ? (
              <OutboundStatusPage onSelectMenu={setSelectedMenu} />
            ) : selectedMenu.id === "factory-work-register" ? (
              <WorkRegisterPage
                onSelectMenu={setSelectedMenu}
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
