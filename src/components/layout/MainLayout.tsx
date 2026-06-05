"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import Topbar from "../topbar/Topbar";
import Statusbar from "../statusbar/Statusbar";
import { menuData, type MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

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
import DeductibleManagementPage from "../../modules/factory/DeductibleManagementPage";
import EmployeeManagePage from "../../modules/admin/EmployeeManagePage";
import VehicleCatalogPage from "../../modules/admin/VehicleCatalogPage";
import EmployeeStatusPage from "../../modules/employee/EmployeeStatusPage";
import SettingsDashboardPage from "../../modules/settings/SettingsDashboardPage";
import HomeDashboardPage from "../../modules/home/HomeDashboardPage";
import DocumentsDashboardPage from "../../modules/documents/DocumentsDashboardPage";
import ExpenseRequestPage from "../../modules/documents/ExpenseRequestPage";
import ExpenseRequestPrintPage from "../../modules/documents/ExpenseRequestPrintPage";
import AttendanceRequestPage from "../../modules/documents/AttendanceRequestPage";
import AttendanceRequestPrintPage from "../../modules/documents/AttendanceRequestPrintPage";
import IncidentReportPage from "../../modules/documents/IncidentReportPage";
import IncidentReportPrintPage from "../../modules/documents/IncidentReportPrintPage";
import SalesDashboardPage from "../../modules/sales/SalesDashboardPage";
import SalesRevenuePage from "../../modules/sales/SalesRevenuePage";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
  is_active: boolean;
};

const notificationLookbackDays = 7;

type MyDocumentNotificationType = "expenses" | "attendances" | "incidents";

const myDocumentReadKey = (userId: string, type: MyDocumentNotificationType) =>
  `erp:my-document-notification-read:${userId}:${type}`;

const fallbackNotificationReadAt = () =>
  new Date(Date.now() - notificationLookbackDays * 24 * 60 * 60 * 1000).toISOString();

const getMyDocumentReadAt = (userId: string, type: MyDocumentNotificationType) => {
  if (typeof window === "undefined") return fallbackNotificationReadAt();

  return localStorage.getItem(myDocumentReadKey(userId, type)) ?? fallbackNotificationReadAt();
};

const markMyDocumentRead = (userId: string, type: MyDocumentNotificationType) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(myDocumentReadKey(userId, type), new Date().toISOString());
};

const getMyDocumentNotificationType = (menuId: string): MyDocumentNotificationType | null => {
  if (menuId.startsWith("documents-expense-request")) return "expenses";
  if (menuId.startsWith("documents-attendance-request")) return "attendances";
  if (menuId.startsWith("documents-incident-report")) return "incidents";
  return null;
};
type MainLayoutProps = {
  user: LoginUser;
  onLogout: () => void;
};

export default function MainLayout({ user, onLogout }: MainLayoutProps) {
  const isAdmin = user?.role === "ADMIN";
  const userRole = user?.role ?? "STAFF";
  const canViewSales = ["ADMIN", "CHIEF"].includes(userRole);
  const approvalRole =
    user?.approval_role ?? (isAdmin ? "관리자" : "직원");

  const [selectedMenu, setSelectedMenu] = useState<MenuItem>({
    id: "dashboard",
    title: "업무홈",
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileMenuPath, setMobileMenuPath] = useState<MenuItem[]>([]);
  const isSalesMenu = selectedMenu.id === "sales" || selectedMenu.id.startsWith("sales-");
  const [notificationCounts, setNotificationCounts] = useState({
    employees: 0,
    expenses: 0,
    attendances: 0,
    incidents: 0,
    myExpenses: 0,
    myAttendances: 0,
    myIncidents: 0,
  });

  const selectedData = selectedMenu.data as
    | {
        workName?: string;
        nextWorkName?: string;
        expenseRequest?: any;
        attendanceRequest?: any;
        incidentReport?: any;
      }
    | undefined;  const mobileMenuParent = mobileMenuPath[mobileMenuPath.length - 1];
  const displayedMobileMenus = getVisibleMenuItems(
    mobileMenuParent?.children ?? menuData,
    userRole,
    user.department
  );
  const mobileMenuTitle = mobileMenuParent?.title ?? "메뉴";

  const handleMobileMenuClick = (menu: MenuItem) => {
    const visibleChildren = getVisibleMenuItems(
      menu.children ?? [],
      userRole,
      user.department
    );

    if (visibleChildren.length > 0) {
      setMobileMenuPath((prev) => [...prev, menu]);
      return;
    }

    handleSelectMenu(menu);
  };

  const handleMobileMenuBack = () => {
    setMobileMenuPath((prev) => prev.slice(0, -1));
  };

  const handleSelectMenu = (menu: MenuItem) => {
    const myDocumentType = getMyDocumentNotificationType(menu.id);

    if (myDocumentType) {
      markMyDocumentRead(user.user_id, myDocumentType);
      setNotificationCounts((prev) => ({
        ...prev,
        ...(myDocumentType === "expenses" ? { myExpenses: 0 } : {}),
        ...(myDocumentType === "attendances" ? { myAttendances: 0 } : {}),
        ...(myDocumentType === "incidents" ? { myIncidents: 0 } : {}),
      }));
    }

    setSelectedMenu(menu);
    setIsSidebarOpen(false);
  };

  const loadNotificationCounts = useCallback(async () => {
    const canSeeApprovalNotice =
      isAdmin || ["부서장", "관리부", "관리자"].includes(approvalRole);

    const attendanceStatus =
      approvalRole === "부서장"
        ? "부서장 승인대기"
        : approvalRole === "관리부"
          ? "관리부 확인대기"
          : "관리자 승인대기";

    let attendanceQuery = canSeeApprovalNotice
      ? supabase
      .from("attendance_requests")
      .select("id", { count: "exact", head: true })
          .eq("status", attendanceStatus)
      : null;

    if (attendanceQuery && approvalRole === "부서장") {
      attendanceQuery = attendanceQuery.eq(
        "requested_department",
        user.department ?? ""
      );
    }

    const canCheckIncident = isAdmin || user.department === "관리부";
    const myExpenseReadAt = getMyDocumentReadAt(user.user_id, "expenses");
    const myAttendanceReadAt = getMyDocumentReadAt(user.user_id, "attendances");
    const myIncidentReadAt = getMyDocumentReadAt(user.user_id, "incidents");

    const [
      employeesResult,
      expensesResult,
      attendancesResult,
      incidentsResult,
      myExpensesResult,
      myAttendancesResult,
      myIncidentsResult,
    ] =
      await Promise.all([
        canSeeApprovalNotice && isAdmin
          ? supabase
              .from("app_users")
              .select("id", { count: "exact", head: true })
              .eq("is_active", false)
          : Promise.resolve({ count: 0, error: null }),
        canSeeApprovalNotice && isAdmin
          ? supabase
              .from("expense_requests")
              .select("id", { count: "exact", head: true })
              .eq("status", "승인대기")
          : Promise.resolve({ count: 0, error: null }),
        attendanceQuery ?? Promise.resolve({ count: 0, error: null }),
        canCheckIncident
          ? supabase
              .from("incident_reports")
              .select("id", { count: "exact", head: true })
              .eq("status", "확인대기")
          : Promise.resolve({ count: 0, error: null }),
        supabase
          .from("expense_requests")
          .select("id", { count: "exact", head: true })
          .eq("requested_by", user.user_id)
          .in("status", ["승인완료", "반려"])
          .gt("approved_at", myExpenseReadAt),
        supabase
          .from("attendance_requests")
          .select("id", { count: "exact", head: true })
          .eq("requested_by", user.user_id)
          .in("status", ["승인완료", "반려"])
          .gt("approved_at", myAttendanceReadAt),
        supabase
          .from("incident_reports")
          .select("id", { count: "exact", head: true })
          .eq("requested_by", user.user_id)
          .in("status", ["확인완료", "반려"])
          .gt("checked_at", myIncidentReadAt),
      ]);

    setNotificationCounts({
      employees: employeesResult.error ? 0 : employeesResult.count ?? 0,
      expenses: expensesResult.error ? 0 : expensesResult.count ?? 0,
      attendances: attendancesResult.error ? 0 : attendancesResult.count ?? 0,
      incidents: incidentsResult.error ? 0 : incidentsResult.count ?? 0,
      myExpenses: myExpensesResult.error ? 0 : myExpensesResult.count ?? 0,
      myAttendances: myAttendancesResult.error ? 0 : myAttendancesResult.count ?? 0,
      myIncidents: myIncidentsResult.error ? 0 : myIncidentsResult.count ?? 0,
    });
  }, [approvalRole, isAdmin, user.department, user.user_id]);

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
    ...(isAdmin || user.department === "관리부"
      ? [
          {
            id: "incidents",
            title: "경위서 확인대기",
            count: notificationCounts.incidents,
            menu: {
              id: "documents-incident-report",
              title: "경위서",
            },
          },
        ]
      : []),
    {
      id: "my-expenses",
      title: "내 지출결의서 처리완료",
      count: notificationCounts.myExpenses,
      menu: {
        id: "documents-expense-request",
        title: "지출결의서",
      },
    },
    {
      id: "my-attendances",
      title: "내 근태신청서 처리완료",
      count: notificationCounts.myAttendances,
      menu: {
        id: "documents-attendance-request",
        title: "근태신청서",
      },
    },
    {
      id: "my-incidents",
      title: "내 경위서 처리완료",
      count: notificationCounts.myIncidents,
      menu: {
        id: "documents-incident-report",
        title: "경위서",
      },
    },
  ];

  return (
    <div className="flex h-screen w-full flex-col overflow-x-hidden bg-slate-100">
      <Topbar
        user={user}
        onLogout={onLogout}
        notifications={notifications}
        onSelectMenu={handleSelectMenu}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div
          className={[
            "group/sidebar relative hidden h-full shrink-0 overflow-hidden bg-slate-900 transition-[width] duration-200 ease-out md:block",
            isSidebarOpen ? "w-64" : "w-8 hover:w-64",
          ].join(" ")}
        >
          <button
            type="button"
            aria-label="硫붾돱 ?닿린"
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
              userRole={userRole}
              userDepartment={user.department}
            />
          </div>
        </div>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 md:p-6">
          <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 md:hidden">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500">메뉴</div>
                <div className="truncate text-xs font-bold text-blue-700">
                  {mobileMenuTitle}
                </div>
              </div>

              {mobileMenuPath.length > 0 && (
                <button
                  type="button"
                  onClick={handleMobileMenuBack}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  뒤로
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {displayedMobileMenus.map((menu) => {
                const visibleChildren = getVisibleMenuItems(
                  menu.children ?? [],
                  userRole,
                  user.department
                );
                const hasChildren = visibleChildren.length > 0;
                const isSelected = selectedMenu.id === menu.id;

                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => handleMobileMenuClick(menu)}
                    className={[
                      "min-h-12 min-w-0 rounded-xl border px-3 py-2 text-left text-xs font-bold leading-snug shadow-sm transition",
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-200 hover:bg-blue-50",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 break-keep">{menu.title}</span>
                      {hasChildren && <span className="shrink-0 text-slate-400">›</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="min-h-[500px] min-w-0 overflow-x-hidden rounded-xl border bg-white p-3 shadow-sm md:rounded-2xl md:p-6">
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
                    ? "愿由щ?"
                    : selectedMenu.id === "employee-body"
                      ? "?먭툑遺"
                      : selectedMenu.id === "employee-paint"
                        ? "?꾩옣遺"
                        : selectedMenu.id === "employee-repair"
                          ? "?뺣퉬遺"
                          : undefined
                }
                onOpenManage={() =>
                  handleSelectMenu({
                    id: "employee-manage",
                    title: "직원관리",
                  })
                }
              />
            ) : selectedMenu.id === "settings" ? (
              <SettingsDashboardPage
                userRole={userRole}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "employee-manage" && !isAdmin ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                직원관리 페이지는 관리자만 접근할 수 있습니다.
              </div>
            ) : selectedMenu.id === "employee-manage" ? (
              <EmployeeManagePage />
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
            ) : selectedMenu.id === "factory-outbound" ||
              selectedMenu.id === "factory-outbound-list" ? (
              <OutboundStatusPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-deductible-management" ? (
              <DeductibleManagementPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "factory-work-register" ? (
              <WorkRegisterPage
                onSelectMenu={handleSelectMenu}
                initialWorkName={selectedData?.workName ?? selectedData?.nextWorkName}
              />
            ) : selectedMenu.id === "factory-work-print" ? (
              <WorkPrintPage
                workName={selectedData?.workName ?? selectedData?.nextWorkName}
              />
            ) : isSalesMenu && !canViewSales ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                매출현황 페이지는 관리자와 총괄관리만 접근할 수 있습니다.
              </div>
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
            ) : selectedMenu.id === "documents" ? (
              <DocumentsDashboardPage onSelectMenu={handleSelectMenu} />
            ) : selectedMenu.id === "documents-expense-request" ? (
              <ExpenseRequestPage
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-expense-request-print" ? (
              <ExpenseRequestPrintPage
                expenseRequest={selectedData?.expenseRequest}
                user={user}
                isAdmin={isAdmin}
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
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-incident-report" ? (
              <IncidentReportPage
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : selectedMenu.id === "documents-incident-report-print" ? (
              <IncidentReportPrintPage
                incidentReport={selectedData?.incidentReport}
                user={user}
                isAdmin={isAdmin}
                onSelectMenu={handleSelectMenu}
              />
            ) : (
              <>
                <div className="text-sm text-slate-500">?묒뾽 ?붾㈃ ?곸뿭</div>

                <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-slate-600">
                  ?꾩옱 ?좏깮??硫붾돱:{" "}
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

function getVisibleMenuItems(
  items: MenuItem[],
  role: UserRole,
  department?: string | null
): MenuItem[] {
  return items.filter((item) => {
    if (item.roles && !item.roles.includes(role)) {
      return false;
    }

    if (item.departments && role !== "ADMIN" && !item.departments.includes(department ?? "")) {
      return false;
    }

    return true;
  });
}

