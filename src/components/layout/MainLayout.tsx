"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../sidebar/Sidebar";
import Topbar, { type NotificationItem } from "../topbar/Topbar";
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
import SettlementCompletePrintPage from "../../modules/factory/SettlementCompletePrintPage";
import DailyCashPage from "../../modules/factory/DailyCashPage";
import DailyCashPrintPageNew from "../../modules/factory/DailyCashPrintPageNew";
import DailyCashRegisterPage from "../../modules/factory/DailyCashRegisterPage";
import SettlementMainPage from "../../modules/factory/SettlementMainPage";
import PendingSettlementPage from "../../modules/factory/PendingSettlementPage";
import PendingInsuranceListPage from "../../modules/factory/PendingInsuranceListPage";
import ClosedSettlementManagementPage from "../../modules/factory/ClosedSettlementManagementPage";
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
import PartnerSupportPage from "../../modules/sales/PartnerSupportPage";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
  is_active: boolean;
};

type MainLayoutProps = {
  user: LoginUser;
  onLogout: () => void;
};

type PageData = {
  workName?: string;
  nextWorkName?: string;
  openCamera?: boolean;
  autoPrint?: boolean;
  expenseRequest?: any;
  attendanceRequest?: any;
  incidentReport?: any;
};

const initialMenu: MenuItem = {
  id: "dashboard",
  title: "업무홈",
};

const defaultCameraQuickAction: MenuItem = {
  id: "factory-work-register",
  title: "카메라열기",
  data: { openCamera: true },
};

const notificationLookbackDays = 7;

const quickActionStorageKey = (userId: string) =>
  `erp:quick-actions:${userId}`;

const myDocumentReadKey = (userId: string, type: string) =>
  `erp:my-document-notification-read:${userId}:${type}`;

const fallbackNotificationReadAt = () =>
  new Date(Date.now() - notificationLookbackDays * 24 * 60 * 60 * 1000).toISOString();

const getMyDocumentReadAt = (userId: string, type: string) => {
  if (typeof window === "undefined") return fallbackNotificationReadAt();

  return localStorage.getItem(myDocumentReadKey(userId, type)) ?? fallbackNotificationReadAt();
};

const markMyDocumentRead = (userId: string, type: string) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(myDocumentReadKey(userId, type), new Date().toISOString());
};

const getMyDocumentNotificationType = (menuId: string) => {
  if (menuId.startsWith("documents-expense-request")) return "expenses";
  if (menuId.startsWith("documents-attendance-request")) return "attendances";
  if (menuId.startsWith("documents-incident-report")) return "incidents";
  return null;
};

const isSameQuickAction = (left: MenuItem, right: MenuItem) =>
  left.id === right.id && JSON.stringify(left.data ?? {}) === JSON.stringify(right.data ?? {});

const menuCacheKey = (menu: MenuItem) =>
  `${menu.id}:${JSON.stringify(menu.data ?? {})}`;

const isCacheableMenu = (menu: MenuItem) => !menu.id.includes("print");
const realtimeRefreshMenuIds = new Set([
  "dashboard",
  "factory-inbound",
  "factory-release-list",
  "factory-outbound",
  "factory-outbound-list",
  "factory-settlement",
  "factory-settlement-repair-register",
  "factory-settlement-pending-insurance",
  "sales-partner-support",
]);

export default function MainLayout({ user, onLogout }: MainLayoutProps) {
  const isAdmin = user.role === "ADMIN";
  const userRole = user.role ?? "STAFF";
  const canViewSales = ["ADMIN", "CHIEF"].includes(userRole);
  const approvalRole = user.approval_role ?? (isAdmin ? "관리자" : "직원");
  const canCheckIncident = isAdmin || approvalRole === "관리부" || user.department === "관리부";

  const [selectedMenu, setSelectedMenu] = useState<MenuItem>(initialMenu);
  const [menuHistory, setMenuHistory] = useState<MenuItem[]>([]);
  const [cachedMenus, setCachedMenus] = useState<MenuItem[]>([initialMenu]);
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const [quickActionMenus, setQuickActionMenus] = useState<MenuItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileMenuPath, setMobileMenuPath] = useState<MenuItem[]>([]);
  const [notificationCounts, setNotificationCounts] = useState({
    employees: 0,
    expenses: 0,
    attendances: 0,
    incidents: 0,
    myExpenses: 0,
    myAttendances: 0,
    myIncidents: 0,
  });

  const canFavoriteCurrentMenu = selectedMenu.id !== "dashboard";
  const isCurrentMenuFavorited = quickActionMenus.some((menu) =>
    isSameQuickAction(menu, selectedMenu)
  );
  const mobileMenuParent = mobileMenuPath[mobileMenuPath.length - 1];
  const displayedMobileMenus = getVisibleMenuItems(
    mobileMenuParent?.children ?? menuData,
    userRole,
    user.department
  );
  const mobileMenuTitle = mobileMenuParent?.title ?? "硫붾돱";
  const hideRefreshButton = realtimeRefreshMenuIds.has(selectedMenu.id);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedValue = localStorage.getItem(quickActionStorageKey(user.user_id));

    if (!storedValue) {
      setQuickActionMenus([]);
      return;
    }

    try {
      const parsedValue = JSON.parse(storedValue);
      setQuickActionMenus(Array.isArray(parsedValue) ? parsedValue : []);
    } catch {
      setQuickActionMenus([]);
    }
  }, [user.user_id]);

  const saveQuickActionMenus = (menus: MenuItem[]) => {
    setQuickActionMenus(menus);

    if (typeof window === "undefined") return;

    localStorage.setItem(quickActionStorageKey(user.user_id), JSON.stringify(menus));
  };

  const toggleCurrentQuickAction = () => {
    if (!canFavoriteCurrentMenu) return;

    if (isCurrentMenuFavorited) {
      saveQuickActionMenus(
        quickActionMenus.filter((menu) => !isSameQuickAction(menu, selectedMenu))
      );
      return;
    }

    saveQuickActionMenus([
      ...quickActionMenus,
      {
        id: selectedMenu.id,
        title: selectedMenu.title,
        data: selectedMenu.data,
      },
    ]);
  };

  const handleSelectMenu = (menu: MenuItem) => {
    const currentKey = menuCacheKey(selectedMenu);
    const nextKey = menuCacheKey(menu);
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

    if (currentKey !== nextKey) {
      setMenuHistory((prev) => [...prev, selectedMenu].slice(-30));
    }

    if (isCacheableMenu(menu)) {
      setCachedMenus((prev) =>
        prev.some((cachedMenu) => menuCacheKey(cachedMenu) === nextKey)
          ? prev
          : [...prev, menu]
      );
    }

    setSelectedMenu(menu);
  };

  const handleBackMenu = () => {
    const previousMenu = menuHistory[menuHistory.length - 1];

    if (!previousMenu) return;

    if (isCacheableMenu(previousMenu)) {
      const previousKey = menuCacheKey(previousMenu);

      setCachedMenus((prev) =>
        prev.some((cachedMenu) => menuCacheKey(cachedMenu) === previousKey)
          ? prev
          : [...prev, previousMenu]
      );
    }

    setMenuHistory((prev) => prev.slice(0, -1));
    setSelectedMenu(previousMenu);
    setIsSidebarOpen(false);
  };

  const handleRefreshMenu = () => {
    const key = menuCacheKey(selectedMenu);

    setRefreshKeys((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + 1,
    }));
    void loadNotificationCounts();
  };

  const handleMobileMenuClick = (menu: MenuItem) => {
    const visibleChildren = getVisibleMenuItems(
      menu.children ?? [],
      userRole,
      user.department
    );

    if (visibleChildren.length > 0) {
      handleSelectMenu(menu);
      setMobileMenuPath((prev) => [...prev, menu]);
      return;
    }

    handleSelectMenu(menu);
  };

  const loadNotificationCounts = useCallback(async () => {
    const canSeeExpenseApprovalNotice =
      isAdmin || userRole === "CHIEF" || approvalRole === "총괄관리";
    const isFinalAttendanceApprover = isAdmin || approvalRole === "관리자";
    const isAdminDeptApprover =
      approvalRole === "관리부" || user.department === "관리부";
    const canSeeAttendanceApprovalNotice =
      isFinalAttendanceApprover || isAdminDeptApprover || approvalRole === "부서장";
    const canCheckIncident = isAdmin || isAdminDeptApprover;
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
    ] = await Promise.all([
      isAdmin
        ? supabase
            .from("app_users")
            .select("id", { count: "exact", head: true })
            .eq("is_active", false)
        : Promise.resolve({ count: 0, error: null }),
      canSeeExpenseApprovalNotice
        ? isAdmin
          ? supabase
              .from("expense_requests")
              .select("id", { count: "exact", head: true })
              .in("status", ["승인대기", "관리자 승인대기"])
          : supabase
              .from("expense_requests")
              .select("id", { count: "exact", head: true })
              .in("status", ["승인대기", "총괄관리 승인대기"])
        : Promise.resolve({ count: 0, error: null }),
      canSeeAttendanceApprovalNotice
        ? isFinalAttendanceApprover
          ? supabase
              .from("attendance_requests")
              .select("id", { count: "exact", head: true })
              .in("status", ["관리부 확인대기", "관리자 승인대기"])
          : isAdminDeptApprover
            ? supabase
                .from("attendance_requests")
                .select("id", { count: "exact", head: true })
                .eq("status", "관리부 확인대기")
          : supabase
              .from("attendance_requests")
              .select("id", { count: "exact", head: true })
              .eq("status", "부서장 승인대기")
              .eq("requested_department", user.department ?? "")
        : Promise.resolve({ count: 0, error: null }),
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
  }, [approvalRole, isAdmin, user.department, user.user_id, userRole]);

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

  const notifications: NotificationItem[] = [
    ...(isAdmin
      ? [
          {
            id: "employees",
            title: "직원 승인대기",
            count: notificationCounts.employees,
            menu: { id: "employee-manage", title: "직원관리" },
          },
          {
            id: "expenses",
            title: "지출결의서 승인대기",
            count: notificationCounts.expenses,
            menu: { id: "documents-expense-request", title: "지출결의서" },
          },
          {
            id: "incidents",
            title: "경위서 확인대기",
            count: notificationCounts.incidents,
            menu: { id: "documents-incident-report", title: "경위서" },
          },
        ]
      : []),
    ...(!isAdmin && (userRole === "CHIEF" || approvalRole === "총괄관리")
      ? [
          {
            id: "expenses",
            title: "지출결의서 승인대기",
            count: notificationCounts.expenses,
            menu: { id: "documents-expense-request", title: "지출결의서" },
          },
        ]
      : []),
    ...(!isAdmin && canCheckIncident
      ? [
          {
            id: "incidents",
            title: "경위서 확인대기",
            count: notificationCounts.incidents,
            menu: { id: "documents-incident-report", title: "경위서" },
          },
        ]
      : []),
    {
      id: "attendances",
      title: "근태신청서 확인대기",
      count: notificationCounts.attendances,
      menu: { id: "documents-attendance-request", title: "근태신청서" },
    },
    {
      id: "my-expenses",
      title: "내 지출결의서 처리완료",
      count: notificationCounts.myExpenses,
      menu: { id: "documents-expense-request", title: "지출결의서" },
    },
    {
      id: "my-attendances",
      title: "내 근태신청서 처리완료",
      count: notificationCounts.myAttendances,
      menu: { id: "documents-attendance-request", title: "근태신청서" },
    },
    {
      id: "my-incidents",
      title: "내 경위서 처리완료",
      count: notificationCounts.myIncidents,
      menu: { id: "documents-incident-report", title: "경위서" },
    },
  ];

  const renderMenuPage = (menu: MenuItem) => {
    const pageData = menu.data as PageData | undefined;
    const isSalesMenu = menu.id === "sales" || menu.id.startsWith("sales-");

    if (menu.id === "dashboard") {
      return (
        <HomeDashboardPage
          isAdmin={isAdmin}
          user={user}
          userName={user.user_name}
          quickActionMenus={[defaultCameraQuickAction, ...quickActionMenus]}
          onSelectMenu={handleSelectMenu}
        />
      );
    }

    if (
      menu.id === "employee" ||
      menu.id === "employee-admin" ||
      menu.id === "employee-body" ||
      menu.id === "employee-paint" ||
      menu.id === "employee-repair"
    ) {
      return (
        <EmployeeStatusPage
          canManage={isAdmin}
          userRole={userRole}
          departmentFilter={
            menu.id === "employee-admin"
              ? "관리"
              : menu.id === "employee-body"
                ? "자금"
                : menu.id === "employee-paint"
                  ? "현장"
                  : menu.id === "employee-repair"
                    ? "정비"
                    : undefined
          }
          onOpenManage={() =>
            handleSelectMenu({ id: "employee-manage", title: "직원관리" })
          }
        />
      );
    }

    if (menu.id === "settings") {
      return <SettingsDashboardPage userRole={userRole} onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "employee-manage" && !isAdmin) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          직원관리는 관리자만 접근할 수 있습니다.
        </div>
      );
    }
    if (menu.id === "employee-manage") return <EmployeeManagePage />;
    if (menu.id === "vehicle-catalog") return <VehicleCatalogPage user={user} />;
    if (menu.id === "factory") return <FactoryDashboardPage onSelectMenu={handleSelectMenu} />;
    if (menu.id === "factory-settlement") {
      return <SettlementMainPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-settlement-pending") {
      return <PendingSettlementPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-settlement-pending-insurance") {
      return <PendingInsuranceListPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-settlement-closed-management") {
      return (
        <ClosedSettlementManagementPage
          user={user}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "factory-settlement-repair-register") {
      return (
        <SettlementRegisterPage
          initialWorkName={pageData?.workName}
          user={user}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "factory-settlement-complete-print") {
      return (
        <SettlementCompletePrintPage
          workName={pageData?.workName}
          autoPrint={Boolean(pageData?.autoPrint)}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "factory-settlement-repair") {
      return <FactorySettlementPage onSelectMenu={handleSelectMenu} view="all" />;
    }
    if (menu.id === "factory-settlement-daily-cash-register") {
      return <DailyCashRegisterPage editData={menu.data as any} />;
    }
    if (menu.id === "factory-settlement-daily-cash-print") {
      return <DailyCashPrintPageNew user={user} />;
    }
    if (menu.id === "factory-settlement-daily-cash") {
      return <DailyCashPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-inbound") {
      return <InboundStatusPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-release-list") {
      return <ReleaseListPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-outbound" || menu.id === "factory-outbound-list") {
      return <OutboundStatusPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-deductible-management") {
      return <DeductibleManagementPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "factory-work-register") {
      return (
        <WorkRegisterPage
          onSelectMenu={handleSelectMenu}
          initialWorkName={pageData?.workName ?? pageData?.nextWorkName}
          openCameraOnMount={Boolean(pageData?.openCamera)}
        />
      );
    }
    if (menu.id === "factory-work-print") {
      return <WorkPrintPage workName={pageData?.workName ?? pageData?.nextWorkName} />;
    }

    if (isSalesMenu && !canViewSales) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          매출현황은 관리자와 총괄관리만 접근할 수 있습니다.
        </div>
      );
    }
    if (menu.id === "sales") return <SalesDashboardPage onSelectMenu={handleSelectMenu} />;
    if (menu.id === "sales-insurance") {
      return <SalesRevenuePage kind="insurance" title="보험매출" />;
    }
    if (menu.id === "sales-capital") {
      return <SalesRevenuePage kind="capital" title="캐피탈매출" />;
    }
    if (menu.id === "sales-general") {
      return <SalesRevenuePage kind="general" title="일반매출" />;
    }
    if (menu.id === "sales-partner") {
      return <SalesRevenuePage kind="partner" title="거래처매출" />;
    }
    if (menu.id === "sales-partner-support") {
      return <PartnerSupportPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "sales-card") {
      return <SalesRevenuePage kind="card" title="카드승인" />;
    }
    if (menu.id === "sales-blue") {
      return <SalesRevenuePage kind="blue" title="BLUE POINT" />;
    }

    if (menu.id === "documents") {
      return <DocumentsDashboardPage onSelectMenu={handleSelectMenu} />;
    }
    if (menu.id === "documents-expense-request") {
      return (
        <ExpenseRequestPage
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "documents-expense-request-print") {
      return (
        <ExpenseRequestPrintPage
          expenseRequest={pageData?.expenseRequest}
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "documents-attendance-request") {
      return (
        <AttendanceRequestPage
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "documents-attendance-request-print") {
      return (
        <AttendanceRequestPrintPage
          attendanceRequest={pageData?.attendanceRequest}
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "documents-incident-report") {
      return (
        <IncidentReportPage
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }
    if (menu.id === "documents-incident-report-print") {
      return (
        <IncidentReportPrintPage
          incidentReport={pageData?.incidentReport}
          user={user}
          isAdmin={isAdmin}
          onSelectMenu={handleSelectMenu}
        />
      );
    }

    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-slate-600">
        ?좏깮??硫붾돱: <span className="font-semibold text-slate-900">{menu.title}</span>
      </div>
    );
  };

  if (selectedMenu.id.includes("print")) {
    const printKey = `${menuCacheKey(selectedMenu)}:${
      refreshKeys[menuCacheKey(selectedMenu)] ?? 0
    }`;

    return (
      <div key={printKey} className="min-h-screen bg-slate-200 print:bg-white">
        <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={handleBackMenu}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            뒤로
          </button>
          <div className="min-w-0 truncate text-sm font-bold text-slate-700">
            {selectedMenu.title}
          </div>
        </div>
        {renderMenuPage(selectedMenu)}
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-x-hidden bg-transparent">
      <Topbar
        user={user}
        onLogout={onLogout}
        notifications={notifications}
        onSelectMenu={handleSelectMenu}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div
          className={[
            "group/sidebar relative hidden h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out md:block",
            isSidebarOpen ? "w-64" : "w-8 hover:w-64",
          ].join(" ")}
        >
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute inset-y-0 left-0 z-20 w-8 border-r border-white/60 bg-white/70 transition-colors backdrop-blur-xl group-hover/sidebar:bg-white"
          />
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="absolute inset-y-0 left-0 z-30 w-8 border-r border-white/70 bg-white/85 text-slate-700 shadow-md shadow-slate-300/40 backdrop-blur-xl"
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold tracking-widest [writing-mode:vertical-rl]">
              MENU
            </span>
          </button>
          <div className="h-full w-64">
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
          <div className="mb-3 rounded-2xl border border-white/70 bg-white/75 p-3 shadow-lg shadow-slate-300/30 backdrop-blur-xl md:hidden">
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
                  onClick={() => setMobileMenuPath((prev) => prev.slice(0, -1))}
                  className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-white"
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
                        : "border-white/70 bg-white/70 text-slate-800 shadow-sm hover:border-blue-200 hover:bg-white",
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

          <section className="min-h-[500px] min-w-0 overflow-x-hidden rounded-2xl border border-white/70 bg-white/80 p-3 shadow-2xl shadow-slate-300/40 backdrop-blur-xl md:rounded-[22px] md:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                {canFavoriteCurrentMenu && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/75 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white">
                    <input
                      type="checkbox"
                      checked={isCurrentMenuFavorited}
                      onChange={toggleCurrentQuickAction}
                      className="sr-only"
                    />
                    <span className={isCurrentMenuFavorited ? "text-yellow-500" : "text-slate-400"}>
                      {isCurrentMenuFavorited ? "★" : "☆"}
                    </span>
                    <span>빠른작업</span>
                  </label>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
              {!hideRefreshButton && (
                <button
                  type="button"
                  onClick={handleRefreshMenu}
                  className="shrink-0 rounded-full border border-blue-200 bg-blue-50/90 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-100"
                >
                  새로고침
                </button>
              )}
              {menuHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleBackMenu}
                  className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-white"
                >
                  뒤로
                </button>
              )}
              </div>
            </div>

            {isCacheableMenu(selectedMenu) ? (
              cachedMenus.map((menu) => {
                const cacheKey = menuCacheKey(menu);
                const isActive = cacheKey === menuCacheKey(selectedMenu);
                const refreshKey = refreshKeys[cacheKey] ?? 0;

                return (
                  <div key={`${cacheKey}:${refreshKey}`} className={isActive ? "block" : "hidden"}>
                    {renderMenuPage(menu)}
                  </div>
                );
              })
            ) : (
              <div key={`${menuCacheKey(selectedMenu)}:${refreshKeys[menuCacheKey(selectedMenu)] ?? 0}`}>
                {renderMenuPage(selectedMenu)}
              </div>
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
