"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import Topbar from "../topbar/Topbar";
import Statusbar from "../statusbar/Statusbar";
import { menuData, type MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";

import WorkRegisterPage from "../../modules/factory/WorkRegisterPage";
import WorkPrintPage from "../../modules/factory/WorkPrintPage";
import FactoryDashboardPage from "../../modules/factory/FactoryDashboardPage";
import InboundStatusPage from "../../modules/factory/InboundstatusPage";
import OutboundStatusPage from "../../modules/factory/OutboundStatusPage";
import ReleaseListPage from "../../modules/factory/ReleaseListPage";
import FactorySettlementPage from "../../modules/factory/FactorySettlementPage";
import SettlementRegisterPage from "../../modules/factory/SettlementRegisterPage";
import DailyCashPage from "../../modules/factory/DailyCashPage";
import DailyCashPrintPage from "../../modules/factory/DailyCashPrintPage";
import DailyCashRegisterPage from "../../modules/factory/DailyCashRegisterPage";
import SettlementMainPage from "../../modules/factory/SettlementMainPage";
import EmployeeManagePage from "../../modules/admin/EmployeeManagePage";
import VehicleCatalogPage from "../../modules/admin/VehicleCatalogPage";
import EmployeeStatusPage from "../../modules/employee/EmployeeStatusPage";
import HomeDashboardPage from "../../modules/home/HomeDashboardPage";
import ExpenseRequestPage from "../../modules/documents/ExpenseRequestPage";
import ExpenseRequestPrintPage from "../../modules/documents/ExpenseRequestPrintPage";
import AttendanceRequestPage from "../../modules/documents/AttendanceRequestPage";
import AttendanceRequestPrintPage from "../../modules/documents/AttendanceRequestPrintPage";
import IncidentReportPage from "../../modules/documents/IncidentReportPage";
import SalesDashboardPage from "../../modules/sales/SalesDashboardPage";
import SalesRevenuePage from "../../modules/sales/SalesRevenuePage";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
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
  const approvalRole =
    user?.approval_role ?? (isAdmin ? "관리자" : "직원");

  const [selectedMenu, setSelectedMenu] = useState<MenuItem>({
    id: "dashboard",
    title: "대시보드",
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationCounts, setNotificationCounts] = useState({
    employees: 0,
    expenses: 0,
    attendances: 0,
  });

  const selectedData = selectedMenu.data as
    | {
        workName?: string;
        nextWorkName?: string;
        expenseRequest?: any;
        attendanceRequest?: any;
      }
    | undefined;
  const mobileMenus = flattenMenus(menuData, userRole, user.department);
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

  const loadNotificationCounts = useCallback(async () => {
    const canSeeApprovalNotice =
      isAdmin || ["부서장", "관리부", "관리자"].includes(approvalRole);

    if (!canSeeApprovalNotice) {
      setNotificationCounts({
        employees: 0,
        expenses: 0,
        attendances: 0,
      });
      return;
    }

    const attendanceStatus =
      approvalRole === "부서장"
        ? "부서장 승인대기"
        : approvalRole === "관리부"
          ? "관리부 확인대기"
          : "관리자 승인대기";

    let attendanceQuery = supabase
      .from("attendance_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", attendanceStatus);

    if (approvalRole === "부서장") {
      attendanceQuery = attendanceQuery.eq(
        "requested_department",
        user.department ?? ""
      );
    }

    const [employeesResult, expensesResult, attendancesResult] =
      await Promise.all([
        isAdmin
          ? supabase
              .from("app_users")
              .select("id", { count: "exact", head: true })
              .eq("is_active", false)
          : Promise.resolve({ count: 0, error: null }),
        isAdmin
          ? supabase
              .from("expense_requests")
              .select("id", { count: "exact", head: true })
              .eq("status", "승인대기")
          : Promise.resolve({ count: 0, error: null }),
        attendanceQuery,
      ]);

    setNotificationCounts({
      employees: employeesResult.error ? 0 : employeesResult.count ?? 0,
      expenses: expensesResult.error ? 0 : expensesResult.count ?? 0,
      attendances: attendancesResult.error ? 0 : attendancesResult.count ?? 0,
    });
  }, [approvalRole, isAdmin, user.department]);

  useEffect(() => {
    void loadNotificationCounts();

    const handleFocus = () => {
      void loadNotificationCounts();
    };
    const intervalId = window.setInterval(() => {
      void loadNotificationCounts();
    }, 60000);

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
    };
  }, [loadNotificationCounts]);

  const notifications = [
    ...(isAdmin
      ? [
          {
            id: "employees",
            title: "직원 승인대기",
            count: notificationCounts.employees,
            menu: {
              id: "employee-manage",
              title: "직원관리",
            },
          },
          {
            id: "expenses",
            title: "지출결의서 승인대기",
            count: notificationCounts.expenses,
            menu: {
              id: "documents-expense-request",
              title: "지출결의서",
            },
          },
        ]
      : []),
    ...(["부서장", "관리부", "관리자"].includes(approvalRole) || isAdmin
      ? [
          {
            id: "attendances",
            title: "근태신청서 승인대기",
            count: notificationCounts.attendances,
            menu: {
              id: "documents-attendance-request",
              title: "근태신청서",
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <Topbar
        user={user}
        onLogout={onLogout}
        notifications={notifications}
        onSelectMenu={handleSelectMenu}
      />

      <div className="flex flex-1 overflow-hidden">
        <div
          className={[
            "group/sidebar relative hidden h-full shrink-0 overflow-hidden bg-slate-900 transition-[width] duration-200 ease-out md:block",
            isSidebarOpen ? "w-64" : "w-8 hover:w-64",
          ].join(" ")}
        >
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute inset-y-0 left-0 z-20 w-8 bg-slate-900/90 transition-colors group-hover/sidebar:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute inset-y-0 left-0 z-30 w-8 bg-slate-900 text-slate-200 shadow-md"
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold tracking-widest [writing-mode:vertical-rl]">
              MENU
            </span>
          </button>
          <div className="h-full w-64 bg-slate-900 shadow-2xl">
            <Sidebar
              selectedMenuId={selectedMenu.id}
              onSelectMenu={handleSelectMenu}
              isAdmin={isAdmin}
              userDepartment={user.department}
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
                user={user}
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
            ) : selectedMenu.id === "vehicle-catalog" &&
            !isAdmin &&
            user.department !== "관리부" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                기초자료관리 페이지는 관리자와 관리부 직원만 접근할 수 있습니다.
              </div>
            ) : selectedMenu.id === "vehicle-catalog" ? (
              <VehicleCatalogPage user={user} />
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
            ) : selectedMenu.id === "factory-release-list" ? (
              <ReleaseListPage onSelectMenu={handleSelectMenu} />
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
            ) : selectedMenu.id === "sales" ? (
              <SalesDashboardPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "sales-insurance" ? (
              <SalesRevenuePage kind="insurance" title="보험매출" />
            ) : selectedMenu.id === "sales-general" ? (
              <SalesRevenuePage kind="general" title="일반매출" />
            ) : selectedMenu.id === "sales-partner" ? (
              <SalesRevenuePage kind="partner" title="거래처매출" />
            ) : selectedMenu.id === "sales-card" ? (
              <SalesRevenuePage kind="card" title="카드매출" />
            ) : selectedMenu.id === "sales-blue" ? (
              <SalesRevenuePage kind="blue" title="BLUE포인트" />
            ) : selectedMenu.id === "documents" ||
            selectedMenu.id === "documents-expense-request" ? (
              <ExpenseRequestPage
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-expense-request-print" ? (
              <ExpenseRequestPrintPage
                expenseRequest={selectedData?.expenseRequest}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-attendance-request" ? (
              <AttendanceRequestPage
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-attendance-request-print" ? (
              <AttendanceRequestPrintPage
                attendanceRequest={selectedData?.attendanceRequest}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-incident-report" ? (
              <IncidentReportPage user={user} isAdmin={isAdmin} />
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

function flattenMenus(
  items: MenuItem[],
  role: "ADMIN" | "STAFF",
  department?: string | null
): MenuItem[] {
  const result: MenuItem[] = [];

  items.forEach((item) => {
    if (item.roles && !item.roles.includes(role)) {
      return;
    }

    if (item.departments && role !== "ADMIN" && !item.departments.includes(department ?? "")) {
      return;
    }

    result.push(item);

    if (item.children?.length) {
      result.push(...flattenMenus(item.children, role, department));
    }
  });

  return result;
}
