"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type HomeDashboardPageProps = {
  isAdmin: boolean;
  user?: {
    user_id: string;
    user_name: string;
    department?: string | null;
    approval_role?: string | null;
    role: UserRole;
  };
  userName?: string;
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrder = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
};

type PendingUser = {
  id: number;
  user_id: string;
  user_name: string | null;
  department: string | null;
};

type PendingExpenseRequest = {
  id: number;
  request_date: string;
  vendor: string | null;
  content: string;
  amount: number;
  requested_name: string | null;
  requested_by: string;
};

type PendingAttendanceRequest = {
  id: number;
  request_type: string;
  start_date: string;
  end_date: string | null;
  requested_name: string | null;
  requested_by: string;
  reason: string;
};

type HomeNotice = {
  id: number;
  title: string;
  content: string;
  is_active: boolean;
  created_by: string | null;
  created_name: string | null;
  created_at: string;
  updated_at: string;
};

const todayText = localDateText;
const dismissedNoticeKey = (noticeId: number) =>
  `erpDismissedHomeNotice:${noticeId}:${todayText()}`;
const currentWorkMonth = (orders: WorkOrder[]) => {
  const today = todayText();
  const calendarMonth = today.slice(0, 7);
  const workMonths = orders
    .map((item) => item.work_name?.slice(0, 7) ?? "")
    .filter((month) => /^\d{4}-\d{2}$/.test(month));

  if (workMonths.includes(calendarMonth)) {
    return calendarMonth;
  }

  return [...workMonths].sort().pop() ?? calendarMonth;
};

export default function HomeDashboardPage({
  isAdmin,
  user,
  userName,
  onSelectMenu,
}: HomeDashboardPageProps) {
  const approvalRole = user?.approval_role ?? (isAdmin ? "관리자" : "직원");
  const canApproveAttendance =
    isAdmin || ["부서장", "관리부", "관리자"].includes(approvalRole);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [pendingExpenseRequests, setPendingExpenseRequests] = useState<
    PendingExpenseRequest[]
  >([]);
  const [pendingAttendanceRequests, setPendingAttendanceRequests] = useState<
    PendingAttendanceRequest[]
  >([]);
  const [homeNotice, setHomeNotice] = useState<HomeNotice | null>(null);
  const [noticeList, setNoticeList] = useState<HomeNotice[]>([]);
  const [noticePopupOpen, setNoticePopupOpen] = useState(false);
  const [noticeEditorOpen, setNoticeEditorOpen] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const attendanceStatus =
      approvalRole === "부서장"
        ? "부서장 승인대기"
        : approvalRole === "관리부"
          ? "관리부 확인대기"
          : "관리자 승인대기";

    let attendanceQuery = supabase
      .from("attendance_requests")
      .select("id, request_type, start_date, end_date, requested_name, requested_by, reason")
      .eq("status", attendanceStatus)
      .order("id", { ascending: false });

    if (approvalRole === "부서장") {
      attendanceQuery = attendanceQuery.eq(
        "requested_department",
        user?.department ?? ""
      );
    }

    const [ordersResult, userResult, expenseResult, attendanceResult, noticeResult] =
      await Promise.all([
      supabase
        .from("work_orders")
        .select("id, work_name, car_number, car_model, inbound_date, outbound_date, release_date")
        .order("id", { ascending: false }),
      isAdmin
        ? supabase
            .from("app_users")
            .select("id, user_id, user_name, department")
            .eq("is_active", false)
            .order("id", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      isAdmin
        ? supabase
            .from("expense_requests")
            .select("id, request_date, vendor, content, amount, requested_name, requested_by")
            .eq("status", "승인대기")
            .order("id", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      canApproveAttendance
        ? attendanceQuery
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("home_notices")
        .select("*")
        .eq("is_active", true)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setLoading(false);

    if (ordersResult.error) {
      alert("업무 홈 조회 실패: " + ordersResult.error.message);
      return;
    }

    setWorkOrders((ordersResult.data ?? []) as WorkOrder[]);
    setPendingUsers((userResult.data ?? []) as PendingUser[]);
    setPendingExpenseRequests(
      expenseResult.error
        ? []
        : ((expenseResult.data ?? []) as PendingExpenseRequest[])
    );
    setPendingAttendanceRequests(
      attendanceResult.error
        ? []
        : ((attendanceResult.data ?? []) as PendingAttendanceRequest[])
    );

    if (!noticeResult.error && noticeResult.data) {
      const notice = noticeResult.data as HomeNotice;
      const dismissedToday =
        typeof window !== "undefined" &&
        localStorage.getItem(dismissedNoticeKey(notice.id)) === "1";

      setHomeNotice(notice);
      setNoticeTitle(notice.title);
      setNoticeContent(notice.content);
      setNoticePopupOpen(!dismissedToday);
    } else {
      setHomeNotice(null);
    }
  }, [approvalRole, canApproveAttendance, isAdmin, user?.department]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => {
      void loadDashboard();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadDashboard]);

  const dashboard = useMemo(() => {
    const today = todayText();
    const thisMonth = currentWorkMonth(workOrders);
    const activeOrders = workOrders.filter((item) => !item.release_date);
    const todayInbound = workOrders.filter((item) => item.inbound_date === today);
    const thisMonthInbound = workOrders.filter((item) =>
      item.work_name?.startsWith(thisMonth)
    );
    const todayOutbound = workOrders.filter((item) => item.release_date === today);
    const thisMonthOutbound = workOrders.filter((item) =>
      item.release_date?.startsWith(thisMonth)
    );

    return {
      activeOrders,
      todayInbound,
      thisMonthInbound,
      todayOutbound,
      thisMonthOutbound,
      recentInbound: [...activeOrders]
        .sort((a, b) => String(b.inbound_date).localeCompare(String(a.inbound_date)))
        .slice(0, 8),
    };
  }, [workOrders]);

  const openWork = (workName: string) => {
    onSelectMenu({
      id: "factory-work-register",
      title: "작업등록",
      data: { workName },
    });
  };

  const loadNoticeList = async () => {
    if (!isAdmin) return;

    const { data, error } = await supabase
      .from("home_notices")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("공지 목록 조회 실패: " + error.message);
      return;
    }

    setNoticeList((data ?? []) as HomeNotice[]);
  };

  const openNoticeManager = async () => {
    setEditingNoticeId(homeNotice?.id ?? null);
    setNoticeTitle(homeNotice?.title ?? "");
    setNoticeContent(homeNotice?.content ?? "");
    await loadNoticeList();
    setNoticeEditorOpen(true);
  };

  const startNewNotice = () => {
    setEditingNoticeId(null);
    setNoticeTitle("");
    setNoticeContent("");
  };

  const editNotice = (notice: HomeNotice) => {
    setEditingNoticeId(notice.id);
    setNoticeTitle(notice.title);
    setNoticeContent(notice.content);
  };

  const saveNotice = async () => {
    const title = noticeTitle.trim();
    const content = noticeContent.trim();

    if (!title || !content) {
      alert("공지 제목과 내용을 입력하세요.");
      return;
    }

    setNoticeSaving(true);

    const payload = {
      title,
      content,
      is_active: true,
      created_by: user?.user_id ?? "",
      created_name: user?.user_name ?? "",
    };

    const { data, error } = editingNoticeId
      ? await supabase
          .from("home_notices")
          .update(payload)
          .eq("id", editingNoticeId)
          .select("*")
          .single()
      : await supabase
          .from("home_notices")
          .insert(payload)
          .select("*")
          .single();

    setNoticeSaving(false);

    if (error || !data) {
      alert("공지 저장 실패: " + (error?.message ?? "저장 오류"));
      return;
    }

    setHomeNotice(data as HomeNotice);
    setEditingNoticeId((data as HomeNotice).id);
    await loadNoticeList();
    setNoticeEditorOpen(false);
    setNoticePopupOpen(true);
  };

  const disableNotice = async () => {
    if (!homeNotice) {
      setNoticeEditorOpen(false);
      return;
    }

    if (!confirm("현재 공지를 내릴까요?")) {
      return;
    }

    const { error } = await supabase
      .from("home_notices")
      .update({ is_active: false })
      .eq("id", homeNotice.id);

    if (error) {
      alert("공지 내리기 실패: " + error.message);
      return;
    }

    setHomeNotice(null);
    setNoticeTitle("");
    setNoticeContent("");
    setNoticePopupOpen(false);
    setNoticeEditorOpen(false);
  };

  const setNoticeActive = async (notice: HomeNotice, isActive: boolean) => {
    const { error } = await supabase
      .from("home_notices")
      .update({ is_active: isActive })
      .eq("id", notice.id);

    if (error) {
      alert("공지 상태 변경 실패: " + error.message);
      return;
    }

    if (homeNotice?.id === notice.id && !isActive) {
      setHomeNotice(null);
      setNoticePopupOpen(false);
    }

    if (isActive) {
      setHomeNotice({ ...notice, is_active: true });
    }

    await loadNoticeList();
  };

  const deleteNotice = async (notice: HomeNotice) => {
    if (!confirm(`공지 "${notice.title}"을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase.from("home_notices").delete().eq("id", notice.id);

    if (error) {
      alert("공지 삭제 실패: " + error.message);
      return;
    }

    if (homeNotice?.id === notice.id) {
      setHomeNotice(null);
      setNoticePopupOpen(false);
    }

    if (editingNoticeId === notice.id) {
      startNewNotice();
    }

    await loadNoticeList();
  };

  return (
    <div className="space-y-5 text-slate-900">
      {noticePopupOpen && homeNotice && (
        <NoticePopup
          notice={homeNotice}
          onClose={() => setNoticePopupOpen(false)}
          onCloseToday={() => {
            localStorage.setItem(dismissedNoticeKey(homeNotice.id), "1");
            setNoticePopupOpen(false);
          }}
        />
      )}

      {noticeEditorOpen && isAdmin && (
        <NoticeManager
          notices={noticeList}
          editingNoticeId={editingNoticeId}
          title={noticeTitle}
          content={noticeContent}
          saving={noticeSaving}
          hasNotice={Boolean(editingNoticeId)}
          onNew={startNewNotice}
          onEdit={editNotice}
          onToggleActive={(notice, isActive) => {
            void setNoticeActive(notice, isActive);
          }}
          onDelete={(notice) => {
            void deleteNotice(notice);
          }}
          onTitleChange={setNoticeTitle}
          onContentChange={setNoticeContent}
          onSave={() => {
            void saveNotice();
          }}
          onDisable={() => {
            void disableNotice();
          }}
          onClose={() => setNoticeEditorOpen(false)}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">업무 홈</h3>
          <p className="text-sm text-slate-600">
            {userName ? `${userName}님, 오늘도 안전하게 작업하세요.` : "오늘의 현장 업무를 확인합니다."}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          새로고침
        </button>
        {isAdmin && (
          <button
            type="button"
          onClick={() => {
            void openNoticeManager();
          }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            공지관리
          </button>
        )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard title="현재 입고" value={dashboard.activeOrders.length} tone="blue" />
        <SummaryCard title="오늘 입고" value={dashboard.todayInbound.length} tone="green" />
        <SummaryCard title="오늘 출고" value={dashboard.todayOutbound.length} tone="indigo" />
        <SummaryCard title="해당월 입고" value={dashboard.thisMonthInbound.length} tone="orange" />
        <SummaryCard title="이번 달 출고" value={dashboard.thisMonthOutbound.length} tone="slate" />
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          업무 홈을 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <QuickActions onSelectMenu={onSelectMenu} />

          {(isAdmin || canApproveAttendance) && (
            <AdminApprovalPanel
              showEmployeeApprovals={isAdmin}
              showExpenseApprovals={isAdmin}
              showAttendanceApprovals={canApproveAttendance}
              pendingUsers={pendingUsers.slice(0, 6)}
              pendingExpenses={pendingExpenseRequests.slice(0, 6)}
              pendingAttendances={pendingAttendanceRequests.slice(0, 6)}
              onOpenManage={() =>
                onSelectMenu({
                  id: "employee-manage",
                  title: "직원관리",
                })
              }
              onOpenExpenseRequests={() =>
                onSelectMenu({
                  id: "documents-expense-request",
                  title: "지출결의서",
                })
              }
              onOpenAttendanceRequests={() =>
                onSelectMenu({
                  id: "documents-attendance-request",
                  title: "근태신청서",
                })
              }
            />
          )}

          <RecentInboundList rows={dashboard.recentInbound} onOpen={openWork} />

          <NoticePanel />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number | string;
  tone: "blue" | "green" | "indigo" | "orange" | "slate";
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-green-100 bg-green-50 text-green-700",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    orange: "border-orange-100 bg-orange-50 text-orange-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function NoticePopup({
  notice,
  onClose,
  onCloseToday,
}: {
  notice: HomeNotice;
  onClose: () => void;
  onCloseToday: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-blue-600">업무 공지</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">
              {notice.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[50vh] whitespace-pre-wrap overflow-y-auto rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {notice.content}
        </div>
        <button
          type="button"
          onClick={onCloseToday}
          className="mt-5 w-full rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          오늘 그만보기
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          확인
        </button>
      </div>
    </div>
  );
}

function NoticeManager({
  notices,
  editingNoticeId,
  title,
  content,
  saving,
  hasNotice,
  onNew,
  onEdit,
  onToggleActive,
  onDelete,
  onTitleChange,
  onContentChange,
  onSave,
  onDisable,
  onClose,
}: {
  notices: HomeNotice[];
  editingNoticeId: number | null;
  title: string;
  content: string;
  saving: boolean;
  hasNotice: boolean;
  onNew: () => void;
  onEdit: (notice: HomeNotice) => void;
  onToggleActive: (notice: HomeNotice, isActive: boolean) => void;
  onDelete: (notice: HomeNotice) => void;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
  onDisable: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-1 gap-4 overflow-hidden rounded-2xl bg-white p-5 shadow-2xl md:grid-cols-[360px_1fr]">
        <section className="min-h-0 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 p-3">
            <h3 className="font-bold text-slate-900">공지 목록</h3>
            <button
              type="button"
              onClick={onNew}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
            >
              새 공지
            </button>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-2">
            {notices.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                등록된 공지가 없습니다.
              </div>
            ) : (
              notices.map((notice) => (
                <div
                  key={notice.id}
                  className={[
                    "mb-2 rounded-lg border p-3",
                    editingNoticeId === notice.id
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onEdit(notice)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-slate-900">
                        {notice.title}
                      </p>
                      <span
                        className={
                          notice.is_active
                            ? "shrink-0 rounded-full bg-green-100 px-2 py-1 text-[11px] font-bold text-green-700"
                            : "shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500"
                        }
                      >
                        {notice.is_active ? "활성" : "보관"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {notice.content}
                    </p>
                  </button>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleActive(notice, !notice.is_active)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {notice.is_active ? "내리기" : "띄우기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(notice)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-900">
              {hasNotice ? "공지 수정" : "새 공지"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>

          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="공지 제목"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
            <textarea
              className="min-h-[260px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="공지 내용"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {hasNotice && (
              <button
                type="button"
                onClick={onDisable}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                현재 공지 내리기
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "저장 중..." : "공지 저장"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickActions({
  onSelectMenu,
}: {
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const actions: Array<{
    id: string;
    menuId?: string;
    title: string;
    description: string;
    data?: MenuItem["data"];
  }> = [
    { id: "factory-work-register", title: "작업등록", description: "신규 입고 차량 등록" },
    {
      id: "factory-work-register-camera",
      menuId: "factory-work-register",
      title: "작업등록 카메라열기",
      description: "작업등록으로 이동 후 카메라 실행",
      data: { openCamera: true },
    },
    { id: "factory-settlement-repair", title: "차량정산", description: "차량별 정산 확인" },
    { id: "factory-settlement-daily-cash", title: "일일입출금", description: "일일 입출금 확인" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">빠른 작업</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() =>
              onSelectMenu({
                id: action.menuId ?? action.id,
                title: action.title,
                data: action.data,
              })
            }
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="font-bold text-slate-900">{action.title}</div>
            <div className="mt-1 text-xs text-slate-500">{action.description}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentInboundList({
  rows,
  onOpen,
}: {
  rows: WorkOrder[];
  onOpen: (workName: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">최근 입고 차량</h4>
        <span className="text-xs text-slate-500">{rows.length}건</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs text-slate-700">
              <th className="border border-slate-200 px-2 py-2 text-left">작명</th>
              <th className="border border-slate-200 px-2 py-2 text-left">차량</th>
              <th className="border border-slate-200 px-2 py-2 text-left">입고일</th>
              <th className="border border-slate-200 px-2 py-2 text-left">출고예정</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-slate-200 px-3 py-8 text-center text-slate-500">
                  진행중인 입고 차량이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => onOpen(row.work_name)}
                >
                  <td className="border border-slate-200 px-2 py-2 font-semibold">{row.work_name}</td>
                  <td className="border border-slate-200 px-2 py-2">
                    <div>{row.car_number}</div>
                    <div className="text-xs text-slate-500">{row.car_model}</div>
                  </td>
                  <td className="border border-slate-200 px-2 py-2">{row.inbound_date}</td>
                  <td className="border border-slate-200 px-2 py-2">{row.outbound_date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminApprovalPanel({
  showEmployeeApprovals,
  showExpenseApprovals,
  showAttendanceApprovals,
  pendingUsers,
  pendingExpenses,
  pendingAttendances,
  onOpenManage,
  onOpenExpenseRequests,
  onOpenAttendanceRequests,
}: {
  showEmployeeApprovals: boolean;
  showExpenseApprovals: boolean;
  showAttendanceApprovals: boolean;
  pendingUsers: PendingUser[];
  pendingExpenses: PendingExpenseRequest[];
  pendingAttendances: PendingAttendanceRequest[];
  onOpenManage: () => void;
  onOpenExpenseRequests: () => void;
  onOpenAttendanceRequests: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-4">
        {showEmployeeApprovals && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">직원 승인대기</h4>
            <button
              type="button"
              onClick={onOpenManage}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              직원관리
            </button>
          </div>

          <div className="space-y-2">
            {pendingUsers.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                승인대기 직원이 없습니다.
              </div>
            ) : (
              pendingUsers.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                >
                  <div>
                    <div className="font-semibold">
                      {row.user_name ?? row.user_id}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.department ?? "-"} / {row.user_id}
                    </div>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                    승인대기
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        )}

        {showExpenseApprovals && (
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">지출결의서 승인대기</h4>
            <button
              type="button"
              onClick={onOpenExpenseRequests}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              지출결의서
            </button>
          </div>

          <div className="space-y-2">
            {pendingExpenses.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                승인대기 지출결의서가 없습니다.
              </div>
            ) : (
              pendingExpenses.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={onOpenExpenseRequests}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {row.vendor ? `${row.vendor} - ${row.content}` : row.content}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.request_date} / {row.requested_name ?? row.requested_by}
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-orange-700">
                    ₩ {Number(row.amount || 0).toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        )}

        {showAttendanceApprovals && (
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">근태신청서 승인대기</h4>
            <button
              type="button"
              onClick={onOpenAttendanceRequests}
              className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              근태신청서
            </button>
          </div>

          <div className="space-y-2">
            {pendingAttendances.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
                승인대기 근태신청서가 없습니다.
              </div>
            ) : (
              pendingAttendances.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={onOpenAttendanceRequests}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-100 p-3 text-left hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {row.request_type} - {row.reason}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.start_date}
                      {row.end_date && row.end_date !== row.start_date
                        ? ` ~ ${row.end_date}`
                        : ""}{" "}
                      / {row.requested_name ?? row.requested_by}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                    승인대기
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

function NoticePanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">업무 안내</h4>
      <div className="space-y-3 text-sm text-slate-600">
        <div className="rounded-lg bg-slate-50 p-3">
          입고 차량은 작업등록에서 먼저 등록한 뒤 작업내용을 입력하세요.
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          출고 처리는 작업등록 또는 공장현황에서 출고일을 입력하면 반영됩니다.
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          금액과 정산 정보는 정산관리 메뉴에서만 확인합니다.
        </div>
      </div>
    </section>
  );
}
