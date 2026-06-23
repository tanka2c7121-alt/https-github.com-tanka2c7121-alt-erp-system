"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";
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

type ApprovedAttendanceRequest = {
  id: number;
  request_type: string;
  start_date: string;
  end_date: string | null;
  requested_name: string | null;
  requested_by: string;
  reason: string;
  status: string;
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

type ScheduleEvent = {
  id: string;
  date: string;
  label: string;
  detail: string;
  tone: "amber" | "blue" | "green" | "indigo" | "red";
  kind: "attendance" | "inbound" | "outboundPlan" | "released" | "manual" | "holiday";
  manual?: boolean;
  dbId?: number;
  visibility?: ScheduleVisibility;
};

type ScheduleVisibility = "public" | "private";

type HomeSchedule = {
  id: number;
  start_date: string;
  end_date: string;
  title: string;
  memo: string;
  tone: ScheduleEvent["tone"];
  visibility: ScheduleVisibility;
  created_by: string | null;
  created_name: string | null;
};

type KoreanHoliday = {
  date: string;
  localName: string;
  name: string;
};

type ScheduleForm = {
  startDate: string;
  endDate: string;
  title: string;
  memo: string;
  tone: ScheduleEvent["tone"];
  visibility: ScheduleVisibility;
};

type FloatingFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const todayText = localDateText;
const holidayStorageKey = (year: string) => `erpKoreanHolidays:${year}`;
const calendarWeekDays = ["일", "월", "화", "수", "목", "금", "토"];
const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
const scheduleToneOptions: Array<{
  value: ScheduleEvent["tone"];
  label: string;
}> = [
  { value: "red", label: "빨강" },
  { value: "blue", label: "파랑" },
  { value: "green", label: "초록" },
  { value: "amber", label: "노랑" },
  { value: "indigo", label: "남색" },
];
const defaultScheduleForm = (date: string): ScheduleForm => ({
  startDate: date,
  endDate: date,
  title: "",
  memo: "",
  tone: "red",
  visibility: "public",
});
const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const getInitialFloatingFrame = (preferredWidth: number, preferredHeight: number): FloatingFrame => {
  if (typeof window === "undefined") {
    return { x: 0, y: 0, width: preferredWidth, height: preferredHeight };
  }

  const width = Math.min(preferredWidth, window.innerWidth - 32);
  const height = Math.min(preferredHeight, window.innerHeight - 32);

  return {
    x: Math.max(16, (window.innerWidth - width) / 2),
    y: Math.max(16, (window.innerHeight - height) / 2),
    width,
    height,
  };
};
const clampFloatingFrame = (next: FloatingFrame): FloatingFrame => {
  const maxWidth = Math.max(320, window.innerWidth - 32);
  const maxHeight = Math.max(320, window.innerHeight - 32);
  const width = clampNumber(next.width, 320, maxWidth);
  const height = clampNumber(next.height, 320, maxHeight);

  return {
    width,
    height,
    x: clampNumber(next.x, 16, Math.max(16, window.innerWidth - width - 16)),
    y: clampNumber(next.y, 16, Math.max(16, window.innerHeight - height - 16)),
  };
};
function ResizeGrip({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="팝업 크기 조절"
      className="absolute bottom-2 right-2 z-20 h-9 w-9 cursor-nwse-resize touch-none rounded-br-2xl text-blue-300 hover:text-blue-500"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className="absolute bottom-1 right-1 h-7 w-7 rounded-br-xl border-b-4 border-r-4 border-current" />
      <span className="absolute bottom-2.5 right-2.5 h-4 w-4 rounded-br-lg border-b-[3px] border-r-[3px] border-current" />
    </button>
  );
}
const dismissedNoticeKey = (noticeId: number) =>
  `erpDismissedHomeNotice:${noticeId}:${todayText()}`;
const realtimeTables = [
  { table: "work_orders" },
  { table: "app_users" },
  { table: "expense_requests" },
  { table: "attendance_requests" },
  { table: "incident_reports" },
  { table: "home_notices" },
  { table: "home_schedules" },
];
const parseLocalDate = (dateText: string) => {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
};
const toLocalDateText = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const addDays = (dateText: string, days: number) => {
  const date = parseLocalDate(dateText);
  date.setDate(date.getDate() + days);
  return toLocalDateText(date);
};
const buildDateRangeTexts = (startDate: string, endDate?: string | null) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];

  const rangeEnd =
    endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate
      ? endDate
      : startDate;
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= rangeEnd && dates.length < 62) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
};
const addMonths = (monthText: string, months: number) => {
  const [year, month] = monthText.split("-").map(Number);
  const date = new Date(year, month - 1 + months, 1);
  return toLocalDateText(date).slice(0, 7);
};
const isDateInMonth = (dateText: string | null | undefined, monthText: string) =>
  Boolean(
    dateText &&
      /^\d{4}-\d{2}-\d{2}$/.test(dateText) &&
      dateText.slice(0, 7) === monthText
  );
const formatKoreanDate = (dateText: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText;

  const date = parseLocalDate(dateText);
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${weekDays[date.getDay()]})`;
};
const getVehicleKey = (order: Pick<WorkOrder, "work_name" | "car_number" | "car_model">) => {
  const carNumber = String(order.car_number ?? "").trim();
  const carModel = String(order.car_model ?? "").trim();

  return carNumber || [order.work_name, carModel].filter(Boolean).join("|");
};
const getRoIssuedNumber = (orders: WorkOrder[], monthText: string) => {
  const prefix = `${monthText}-`;

  return orders.reduce((max, order) => {
    const workName = String(order.work_name ?? "");

    if (!workName.startsWith(prefix)) return max;

    const numberText = workName.slice(prefix.length);
    const number = /^\d+$/.test(numberText) ? Number(numberText) : 0;

    return number > max ? number : max;
  }, 0);
};
const buildMonthDays = (monthText: string) => {
  const [year, month] = monthText.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const startDate = new Date(firstDate);
  startDate.setDate(firstDate.getDate() - firstDate.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date: toLocalDateText(date),
      day: date.getDate(),
      dayOfWeek: date.getDay(),
      inMonth: date.getMonth() === month - 1,
    };
  });
};
export default function HomeDashboardPage({
  isAdmin,
  user,
  userName,
}: HomeDashboardPageProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [approvedAttendanceRequests, setApprovedAttendanceRequests] = useState<
    ApprovedAttendanceRequest[]
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
  const [visibleScheduleMonth, setVisibleScheduleMonth] = useState(
    todayText().slice(0, 7)
  );
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(todayText());
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [homeSchedules, setHomeSchedules] = useState<HomeSchedule[]>([]);
  const [koreanHolidays, setKoreanHolidays] = useState<KoreanHoliday[]>([]);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(
    defaultScheduleForm(todayText())
  );
  const noticePopupClosedIdRef = useRef<number | null>(null);
  const scheduleUserId = user?.user_id ?? null;
  const scheduleUserName = userName ?? user?.user_name ?? null;

  const loadDashboard = useCallback(async () => {
    const scheduleQuery = supabase
      .from("home_schedules")
      .select("*")
      .order("start_date", { ascending: true });

    if (scheduleUserId) {
      scheduleQuery.or(`visibility.eq.public,created_by.eq.${scheduleUserId}`);
    } else {
      scheduleQuery.eq("visibility", "public");
    }

    const [ordersResult, approvedAttendanceResult, noticeResult, scheduleResult] =
      await Promise.all([
      supabase
        .from("work_orders")
        .select("id, work_name, car_number, car_model, inbound_date, outbound_date, release_date")
        .order("id", { ascending: false }),
      supabase
        .from("attendance_requests")
        .select("id, request_type, start_date, end_date, requested_name, requested_by, reason, status")
        .eq("status", "승인완료")
        .order("start_date", { ascending: true }),
      supabase
        .from("home_notices")
        .select("*")
        .eq("is_active", true)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      scheduleQuery,
    ]);

    setLoading(false);

    if (ordersResult.error) {
      alert("업무 홈 조회 실패: " + ordersResult.error.message);
      return;
    }

    setWorkOrders((ordersResult.data ?? []) as WorkOrder[]);
    setApprovedAttendanceRequests(
      approvedAttendanceResult.error
        ? []
        : ((approvedAttendanceResult.data ?? []) as ApprovedAttendanceRequest[])
    );
    setHomeSchedules(
      scheduleResult.error
        ? []
        : ((scheduleResult.data ?? []) as HomeSchedule[])
    );

    if (!noticeResult.error && noticeResult.data) {
      const notice = noticeResult.data as HomeNotice;
      const dismissedToday =
        typeof window !== "undefined" &&
        localStorage.getItem(dismissedNoticeKey(notice.id)) === "1";
      const closedThisSession = noticePopupClosedIdRef.current === notice.id;

      setHomeNotice(notice);
      setNoticeTitle(notice.title);
      setNoticeContent(notice.content);
      setNoticePopupOpen(!dismissedToday && !closedThisSession);
    } else {
      setHomeNotice(null);
    }
  }, [scheduleUserId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const year = visibleScheduleMonth.slice(0, 4);
    const cacheKey = holidayStorageKey(year);

    const loadHolidays = async () => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setKoreanHolidays(JSON.parse(cached) as KoreanHoliday[]);
          return;
        }

        const response = await fetch(
          `https://date.nager.at/api/v3/PublicHolidays/${year}/KR`
        );

        if (!response.ok) {
          setKoreanHolidays([]);
          return;
        }

        const holidays = (await response.json()) as KoreanHoliday[];
        localStorage.setItem(cacheKey, JSON.stringify(holidays));
        setKoreanHolidays(holidays);
      } catch {
        setKoreanHolidays([]);
      }
    };

    void loadHolidays();
  }, [visibleScheduleMonth]);

  useRealtimeRefresh({
    channelName: "home-dashboard-page",
    tables: realtimeTables,
    onRefresh: loadDashboard,
  });

  const dashboard = useMemo(() => {
    const today = todayText();
    const thisMonth = visibleScheduleMonth;
    const activeOrders = workOrders.filter((item) => !item.release_date);
    const todayInbound = workOrders.filter((item) => item.inbound_date === today);
    const thisMonthInbound = workOrders.filter((item) =>
      isDateInMonth(item.inbound_date, thisMonth)
    );
    const thisMonthInboundVehicleCount = new Set(
      thisMonthInbound.map(getVehicleKey).filter(Boolean)
    ).size;
    const thisMonthRoIssuedCount = getRoIssuedNumber(workOrders, thisMonth);
    const todayOutbound = workOrders.filter((item) => item.release_date === today);
    const thisMonthOutbound = workOrders.filter((item) =>
      isDateInMonth(item.release_date, thisMonth)
    );
    const workScheduleEvents = workOrders
      .flatMap<ScheduleEvent>((item) => {
        const events: ScheduleEvent[] = [];
        const vehicle = [item.car_number, item.car_model].filter(Boolean).join(" / ");

        if (item.inbound_date) {
          events.push({
            id: `${item.id}-inbound`,
            date: item.inbound_date,
            label: "입고",
            detail: `${item.work_name} · ${vehicle || "차량 정보 없음"}`,
            tone: "green",
            kind: "inbound",
          });
        }

        if (item.outbound_date && !item.release_date) {
          events.push({
            id: `${item.id}-outbound-plan`,
            date: item.outbound_date,
            label: "출고 예정",
            detail: `${item.work_name} · ${vehicle || "차량 정보 없음"}`,
            tone: "blue",
            kind: "outboundPlan",
          });
        }

        if (item.release_date) {
          events.push({
            id: `${item.id}-released`,
            date: item.release_date,
            label: "출고 완료",
            detail: `${item.work_name} · ${vehicle || "차량 정보 없음"}`,
            tone: "indigo",
            kind: "released",
          });
        }

        return events;
      })
      .filter((event) => isDateInMonth(event.date, visibleScheduleMonth));
    const manualScheduleEvents = homeSchedules
      .flatMap<ScheduleEvent>((event) =>
        buildDateRangeTexts(event.start_date, event.end_date).map((date) => ({
          id: `manual-${event.id}-${date}`,
          dbId: event.id,
          date,
          label: event.visibility === "private" ? "나만보기" : "주요일정",
          detail: event.memo ? `${event.title} · ${event.memo}` : event.title,
          tone: event.tone ?? "red",
          kind: "manual",
          manual: true,
          visibility: event.visibility,
        }))
      )
      .filter((event) => isDateInMonth(event.date, visibleScheduleMonth));
    const attendanceScheduleEvents = approvedAttendanceRequests
      .flatMap<ScheduleEvent>((request) =>
        buildDateRangeTexts(request.start_date, request.end_date).map((date) => ({
          id: `attendance-${request.id}-${date}`,
          date,
          label: "근태",
          detail: [
            request.requested_name ?? request.requested_by,
            request.request_type,
            request.reason,
          ]
            .filter(Boolean)
            .join(" · "),
          tone: "amber",
          kind: "attendance",
        }))
      )
      .filter((event) => isDateInMonth(event.date, visibleScheduleMonth));
    const holidayEvents = koreanHolidays
      .filter((event) => isDateInMonth(event.date, visibleScheduleMonth))
      .map<ScheduleEvent>((event) => ({
        id: `holiday-${event.date}-${event.localName}`,
        date: event.date,
        label: "공휴일",
        detail: event.localName || event.name,
        tone: "red",
        kind: "holiday",
      }));
    const calendarEvents = [
      ...holidayEvents,
      ...manualScheduleEvents,
      ...attendanceScheduleEvents,
      ...workScheduleEvents,
    ].sort((a, b) => a.date.localeCompare(b.date));
    const selectedDayEvents = calendarEvents.filter(
      (event) => event.date === selectedScheduleDate
    );
    const nextWeekEnd = addDays(today, 7);
    const upcomingEvents = calendarEvents
      .filter((event) => event.date >= today && event.date <= nextWeekEnd)
      .slice(0, 5);

    return {
      activeOrders,
      todayInbound,
      thisMonthInbound,
      thisMonthInboundVehicleCount,
      thisMonthRoIssuedCount,
      todayOutbound,
      thisMonthOutbound,
      calendarMonth: visibleScheduleMonth,
      calendarEvents,
      selectedDayEvents,
      upcomingEvents,
    };
  }, [
    koreanHolidays,
    approvedAttendanceRequests,
    homeSchedules,
    selectedScheduleDate,
    visibleScheduleMonth,
    workOrders,
  ]);

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

  const updateScheduleForm = <K extends keyof ScheduleForm>(
    key: K,
    value: ScheduleForm[K]
  ) => {
    setScheduleForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "startDate" && current.endDate < String(value)
        ? { endDate: String(value) }
        : {}),
    }));
  };

  const addManualSchedule = async () => {
    const title = scheduleForm.title.trim();
    const memo = scheduleForm.memo.trim();
    const startDate = scheduleForm.startDate;
    const endDate =
      scheduleForm.endDate && scheduleForm.endDate >= startDate
        ? scheduleForm.endDate
        : startDate;

    if (!title) {
      alert("일정 제목을 입력해주세요.");
      return;
    }

    const { error } = await supabase.from("home_schedules").insert({
      start_date: startDate,
      end_date: endDate,
      title,
      memo,
      tone: scheduleForm.tone,
      visibility: scheduleForm.visibility,
      created_by: scheduleUserId,
      created_name: scheduleUserName,
    });

    if (error) {
      alert(
        "일정 저장 실패: home_schedules 테이블이 필요합니다. SQL 파일을 먼저 적용해주세요.\n" +
          error.message
      );
      return;
    }

    setHomeSchedules([
      ...homeSchedules,
      {
        id: Date.now(),
        start_date: startDate,
        end_date: endDate,
        title,
        memo,
        tone: scheduleForm.tone,
        visibility: scheduleForm.visibility,
        created_by: scheduleUserId,
        created_name: scheduleUserName,
      },
    ]);
    setScheduleForm(defaultScheduleForm(selectedScheduleDate));
    await loadDashboard();
  };

  const deleteManualSchedule = async (eventId: string) => {
    const scheduleId = Number(eventId.split("-")[1]);

    if (!Number.isFinite(scheduleId)) return;
    if (!confirm("이 일정을 삭제할까요?")) return;

    const { error } = await supabase
      .from("home_schedules")
      .delete()
      .eq("id", scheduleId);

    if (error) {
      alert("일정 삭제 실패: " + error.message);
      return;
    }

    setHomeSchedules(homeSchedules.filter((item) => item.id !== scheduleId));
  };

  const changeScheduleMonth = (month: string) => {
    setVisibleScheduleMonth(month);
    setSelectedScheduleDate(`${month}-01`);
    setSchedulePopupOpen(false);
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
          onClose={() => {
            noticePopupClosedIdRef.current = homeNotice.id;
            setNoticePopupOpen(false);
          }}
          onCloseToday={() => {
            noticePopupClosedIdRef.current = homeNotice.id;
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

      <section className="grid grid-cols-5 gap-1.5 md:gap-3">
        <SummaryCard title="현재 입고" value={dashboard.activeOrders.length} tone="blue" />
        <SummaryCard title="오늘 입고" value={dashboard.todayInbound.length} tone="green" />
        <SummaryCard title="오늘 출고" value={dashboard.todayOutbound.length} tone="indigo" />
        <SummaryCard
          title="해당월입고/RO발행건수"
          value={`${dashboard.thisMonthInboundVehicleCount}/${dashboard.thisMonthRoIssuedCount}`}
          tone="orange"
        />
        <SummaryCard title="이번 달 출고" value={dashboard.thisMonthOutbound.length} tone="slate" />
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          업무 홈을 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <ScheduleBoard
            month={dashboard.calendarMonth}
            events={dashboard.calendarEvents}
            selectedDate={selectedScheduleDate}
            selectedEvents={dashboard.selectedDayEvents}
            upcomingEvents={dashboard.upcomingEvents}
            onSelectDate={setSelectedScheduleDate}
            onChangeMonth={changeScheduleMonth}
            popupOpen={schedulePopupOpen}
            onOpenSchedulePopup={(date) => {
              setSelectedScheduleDate(date);
              setScheduleForm((current) => ({
                ...current,
                startDate: date,
                endDate: date,
              }));
              setSchedulePopupOpen(true);
            }}
            onCloseSchedulePopup={() => setSchedulePopupOpen(false)}
            scheduleForm={scheduleForm}
            onScheduleFormChange={updateScheduleForm}
            onAddSchedule={addManualSchedule}
            onDeleteSchedule={deleteManualSchedule}
          />
        </div>
      )}
    </div>
  );
}

void _NoticePanel;

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
    <div
      className={`flex min-h-16 min-w-0 flex-col justify-between rounded-lg border px-1.5 py-2 text-center shadow-sm md:min-h-28 md:rounded-xl md:p-4 md:text-left ${toneClass}`}
    >
      <p className="min-w-0 truncate text-[10px] font-semibold leading-tight md:break-keep md:text-sm">
        {title}
      </p>
      <p className="text-xl font-bold leading-none md:text-right md:text-3xl">
        {value}
      </p>
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
  const [frame, setFrame] = useState<FloatingFrame>(() =>
    getInitialFloatingFrame(560, 500)
  );
  const [interaction, setInteraction] = useState<{
    mode: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    startFrame: FloatingFrame;
  } | null>(null);

  const startInteraction = (
    mode: "move" | "resize",
    event: ReactPointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: frame,
    });
  };

  const moveInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;

    setFrame(
      clampFloatingFrame(
        interaction.mode === "move"
          ? {
              ...interaction.startFrame,
              x: interaction.startFrame.x + dx,
              y: interaction.startFrame.y + dy,
            }
          : {
              ...interaction.startFrame,
              width: interaction.startFrame.width + dx,
              height: interaction.startFrame.height + dy,
            }
      )
    );
  };

  const stopInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteraction(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50">
      <div
        className="fixed flex min-h-80 min-w-80 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        }}
      >
        <div
          className="flex cursor-move touch-none select-none items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"
          onPointerDown={(event) => startInteraction("move", event)}
          onPointerMove={moveInteraction}
          onPointerUp={stopInteraction}
          onPointerCancel={stopInteraction}
        >
          <div>
            <p className="text-xs font-bold text-blue-600">업무 공지</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">
              {notice.title}
            </h3>
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
        <div className="m-4 min-h-0 flex-1 whitespace-pre-wrap overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          {notice.content}
        </div>
        <button
          type="button"
          onClick={onCloseToday}
          className="mx-4 mb-3 w-[calc(100%-2rem)] rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          오늘 그만보기
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          확인
        </button>
        <ResizeGrip
          onPointerDown={(event) => startInteraction("resize", event)}
          onPointerMove={moveInteraction}
          onPointerUp={stopInteraction}
          onPointerCancel={stopInteraction}
        />
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
      <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-white/70 bg-white p-5 shadow-2xl md:grid-cols-[360px_1fr]">
        <section className="min-h-0 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-3">
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

function ScheduleBoard({
  month,
  events,
  selectedDate,
  selectedEvents,
  upcomingEvents,
  onSelectDate,
  onChangeMonth,
  popupOpen,
  onOpenSchedulePopup,
  onCloseSchedulePopup,
  scheduleForm,
  onScheduleFormChange,
  onAddSchedule,
  onDeleteSchedule,
}: {
  month: string;
  events: ScheduleEvent[];
  selectedDate: string;
  selectedEvents: ScheduleEvent[];
  upcomingEvents: ScheduleEvent[];
  onSelectDate: (date: string) => void;
  onChangeMonth: (month: string) => void;
  popupOpen: boolean;
  onOpenSchedulePopup: (date: string) => void;
  onCloseSchedulePopup: () => void;
  scheduleForm: ScheduleForm;
  onScheduleFormChange: <K extends keyof ScheduleForm>(
    key: K,
    value: ScheduleForm[K]
  ) => void;
  onAddSchedule: () => void;
  onDeleteSchedule: (eventId: string) => void;
}) {
  const monthDays = buildMonthDays(month);
  const today = todayText();
  const eventsByDate = events.reduce<Record<string, ScheduleEvent[]>>(
    (result, event) => {
      result[event.date] = [...(result[event.date] ?? []), event];
      return result;
    },
    {}
  );
  const summary = { today: 0, week: 0, month: 0 };
  const summarizeDayEvents = (dayEvents: ScheduleEvent[]) => {
    const inbound = dayEvents.filter((event) => event.kind === "inbound").length;
    const released = dayEvents.filter((event) => event.kind === "released").length;
    const outboundPlan = dayEvents.filter(
      (event) => event.kind === "outboundPlan"
    ).length;
    const attendance = dayEvents.filter(
      (event) => event.kind === "attendance"
    ).length;
    const manualEvents = dayEvents.filter((event) => event.kind === "manual");
    const manual = manualEvents.length;
    const holiday = dayEvents.filter((event) => event.kind === "holiday");
    const firstManualTitle = manualEvents[0]?.detail.split(" · ")[0] ?? "주요일정";

    return [
      holiday.length > 0
        ? {
            key: "holiday",
            label: holiday[0]?.detail ?? "공휴일",
            tone: "red",
          }
        : null,
      inbound > 0
        ? { key: "inbound", label: `입고 ${inbound}대`, tone: "green" }
        : null,
      released > 0
        ? { key: "released", label: `출고 ${released}대`, tone: "indigo" }
        : null,
      outboundPlan > 0
        ? { key: "outboundPlan", label: `출고예정 ${outboundPlan}대`, tone: "blue" }
        : null,
      attendance > 0
        ? { key: "attendance", label: `근태 ${attendance}건`, tone: "amber" }
        : null,
      manual > 0
        ? {
            key: "manual",
            label: `${firstManualTitle}${manual > 1 ? ` 외 ${manual - 1}` : ""}`,
            tone: manualEvents[0]?.tone ?? "red",
          }
        : null,
    ].filter(Boolean) as Array<{
      key: string;
      label: string;
      tone: ScheduleEvent["tone"];
    }>;
  };

  return (
    <section className="order-1 overflow-visible rounded-xl border border-blue-100 bg-white shadow-sm xl:row-span-2">
      {popupOpen && (
        <SchedulePopup
          selectedDate={selectedDate}
          selectedEvents={selectedEvents}
          scheduleForm={scheduleForm}
          onScheduleFormChange={onScheduleFormChange}
          onAddSchedule={onAddSchedule}
          onDeleteSchedule={onDeleteSchedule}
          onClose={onCloseSchedulePopup}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50 px-4 py-2">
        <div>
          <h4 className="font-bold text-slate-900">중요 일정</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            입고, 출고 예정, 출고 완료를 한 달 달력으로 모아봅니다.
          </p>
        </div>
        <div className="hidden">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-semibold text-slate-500">오늘</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{summary.today}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-semibold text-slate-500">7일</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{summary.week}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="font-semibold text-slate-500">이번 달</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{summary.month}</p>
          </div>
        </div>
      </div>

      <div className="p-2 md:p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 md:p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeMonth(addMonths(month, -1))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                이전
              </button>
              <p className="min-w-20 text-center text-base font-bold text-slate-900">
                {month.replace("-", ".")}
              </p>
              <button
                type="button"
                onClick={() => onChangeMonth(addMonths(month, 1))}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => onChangeMonth(todayText().slice(0, 7))}
                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white hover:bg-slate-700"
              >
                이번달
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                입고
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                예정
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                완료
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                근태
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-500 md:text-xs">
            {calendarWeekDays.map((day, index) => (
              <div
                key={`${day}-${index}`}
                className={[
                  "py-2",
                  index === 0 || index === 6 ? "text-red-500" : "",
                ].join(" ")}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {monthDays.map((day) => {
              const dayEvents = eventsByDate[day.date] ?? [];
              const daySummary = summarizeDayEvents(dayEvents);
              const compactDaySummary = daySummary.map((event) =>
                event.key === "manual"
                  ? { ...event, label: event.label.replace(/^.*?(\d+).*$/, "중요 $1") }
                  : event.key === "outboundPlan"
                    ? { ...event, label: event.label.replace(/^.*?(\d+).*$/, "예정 $1대") }
                    : event
              );
              const isSelected = day.date === selectedDate;
              const isToday = day.date === today;
              const isHoliday =
                day.dayOfWeek === 0 ||
                day.dayOfWeek === 6 ||
                dayEvents.some((event) => event.kind === "holiday");

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => {
                    onSelectDate(day.date);
                    onOpenSchedulePopup(day.date);
                  }}
                  className={[
                    "group relative min-h-12 rounded-lg border p-1 text-left transition md:min-h-24 md:p-2",
                    day.inMonth
                      ? isHoliday
                        ? "border-red-100 bg-red-50 text-red-900 shadow-sm"
                        : "bg-white shadow-sm"
                      : "bg-slate-100 text-slate-300",
                    dayEvents.length > 0 && day.inMonth
                      ? isHoliday
                        ? "border-red-200 bg-red-50"
                        : "border-blue-200 bg-blue-50"
                      : "",
                    isSelected
                      ? "border-blue-600 bg-white ring-2 ring-blue-200"
                      : "border-slate-100 hover:border-blue-200",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                        isToday ? "bg-slate-900 text-white" : "",
                      ].join(" ")}
                    >
                      {day.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="hidden text-[11px] font-bold text-slate-400 md:inline">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {dayEvents.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
                      {compactDaySummary.slice(0, 4).map((event) => (
                        <span
                          key={`dot-${event.key}`}
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            event.tone === "green"
                              ? "bg-green-500"
                              : event.tone === "blue"
                                ? "bg-blue-500"
                                : event.tone === "red"
                                  ? "bg-red-500"
                                  : event.tone === "amber"
                                    ? "bg-amber-500"
                                    : "bg-indigo-500",
                          ].join(" ")}
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-3 hidden space-y-1 md:block">
                    {compactDaySummary.slice(0, 4).map((event) => (
                      <span
                        key={event.key}
                        className={[
                          "block truncate rounded px-1.5 py-0.5 text-[10px] font-bold",
                          event.tone === "green"
                            ? "bg-green-100 text-green-700"
                            : event.tone === "blue"
                              ? "bg-blue-100 text-blue-700"
                              : event.tone === "red"
                                ? "bg-red-100 text-red-700"
                                : event.tone === "amber"
                                  ? "bg-amber-100 text-amber-700"
                                : "bg-indigo-100 text-indigo-700",
                        ].join(" ")}
                      >
                        {event.label}
                      </span>
                    ))}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="pointer-events-none absolute left-1/2 top-8 z-30 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl group-hover:block">
                      <div className="mb-2 text-xs font-bold text-slate-900">
                        {formatKoreanDate(day.date)}
                      </div>
                      <div className="space-y-1">
                        {daySummary.map((event) => (
                          <div
                            key={`tip-${event.key}`}
                            className="truncate text-xs font-semibold text-slate-700"
                          >
                            {event.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden">
          <div className="hidden">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h5 className="text-sm font-bold text-slate-900">주요일정 추가</h5>
              <span className="text-xs font-semibold text-blue-700">
                {formatKoreanDate(selectedDate)}
              </span>
            </div>
            <div className="space-y-2">
              <input
                value={scheduleForm.title}
                onChange={(event) =>
                  onScheduleFormChange("title", event.target.value)
                }
                placeholder="일정 제목"
                className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={onAddSchedule}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                일정 추가
              </button>
            </div>
          </div>
          <ScheduleList
            title={`${formatKoreanDate(selectedDate)} 일정`}
            emptyText="선택한 날짜에 등록된 일정이 없습니다."
            events={selectedEvents}
            onDelete={onDeleteSchedule}
          />
          <ScheduleList
            title="다가오는 일정"
            emptyText="앞으로 7일 안에 표시할 일정이 없습니다."
            events={upcomingEvents}
            showDate
          />
        </div>
      </div>
    </section>
  );

  const rows: WorkOrder[] = [];
  const onOpen = (workName: string) => {
    void workName;
  };

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

function SchedulePopup({
  selectedDate,
  selectedEvents,
  scheduleForm,
  onScheduleFormChange,
  onAddSchedule,
  onDeleteSchedule,
  onClose,
}: {
  selectedDate: string;
  selectedEvents: ScheduleEvent[];
  scheduleForm: ScheduleForm;
  onScheduleFormChange: <K extends keyof ScheduleForm>(
    key: K,
    value: ScheduleForm[K]
  ) => void;
  onAddSchedule: () => void;
  onDeleteSchedule: (eventId: string) => void;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<FloatingFrame>(() =>
    getInitialFloatingFrame(920, 560)
  );
  const [interaction, setInteraction] = useState<{
    mode: "move" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    startFrame: FloatingFrame;
  } | null>(null);

  const startInteraction = (
    mode: "move" | "resize",
    event: ReactPointerEvent<HTMLElement>
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteraction({
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: frame,
    });
  };

  const moveInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    const dx = event.clientX - interaction.startX;
    const dy = event.clientY - interaction.startY;

    setFrame(
      clampFloatingFrame(
        interaction.mode === "move"
          ? {
              ...interaction.startFrame,
              x: interaction.startFrame.x + dx,
              y: interaction.startFrame.y + dy,
            }
          : {
              ...interaction.startFrame,
              width: interaction.startFrame.width + dx,
              height: interaction.startFrame.height + dy,
            }
      )
    );
  };

  const stopInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteraction(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50">
      <div
        className="fixed grid min-h-80 min-w-80 grid-cols-1 gap-4 overflow-hidden rounded-2xl border border-white/70 bg-white p-5 shadow-2xl md:grid-cols-[minmax(0,1fr)_320px]"
        style={{
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        }}
      >
        <section className="flex min-h-0 flex-col">
          <div
            className="mb-4 flex cursor-move touch-none select-none items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            onPointerDown={(event) => startInteraction("move", event)}
            onPointerMove={moveInteraction}
            onPointerUp={stopInteraction}
            onPointerCancel={stopInteraction}
          >
            <div>
              <p className="text-xs font-bold text-blue-600">주요일정</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                {formatKoreanDate(selectedDate)}
              </h3>
            </div>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ScheduleList
              title="등록된 일정"
              emptyText="등록된 일정이 없습니다."
              events={selectedEvents}
              onDelete={onDeleteSchedule}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <h4 className="mb-3 text-sm font-bold text-slate-900">일정 입력</h4>
          <div className="space-y-2 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-slate-600">
                시작일
                <input
                  type="date"
                  value={scheduleForm.startDate}
                  onChange={(event) =>
                    onScheduleFormChange("startDate", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
              <label className="text-xs font-bold text-slate-600">
                종료일
                <input
                  type="date"
                  value={scheduleForm.endDate}
                  min={scheduleForm.startDate}
                  onChange={(event) =>
                    onScheduleFormChange("endDate", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <input
              value={scheduleForm.title}
              onChange={(event) =>
                onScheduleFormChange("title", event.target.value)
              }
              placeholder="일정 제목"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <textarea
              value={scheduleForm.memo}
              onChange={(event) =>
                onScheduleFormChange("memo", event.target.value)
              }
              placeholder="간단 메모"
              className="min-h-28 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-bold text-slate-600">
                색상
                <select
                  value={scheduleForm.tone}
                  onChange={(event) =>
                    onScheduleFormChange(
                      "tone",
                      event.target.value as ScheduleEvent["tone"]
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  {scheduleToneOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">
                공개범위
                <select
                  value={scheduleForm.visibility}
                  onChange={(event) =>
                    onScheduleFormChange(
                      "visibility",
                      event.target.value as ScheduleVisibility
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="public">전체공개</option>
                  <option value="private">나만보기</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={onAddSchedule}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              일정 추가
            </button>
          </div>
        </section>
        <ResizeGrip
          onPointerDown={(event) => startInteraction("resize", event)}
          onPointerMove={moveInteraction}
          onPointerUp={stopInteraction}
          onPointerCancel={stopInteraction}
        />
      </div>
    </div>
  );
}

function ScheduleList({
  title,
  emptyText,
  events,
  showDate = false,
  onDelete,
}: {
  title: string;
  emptyText: string;
  events: ScheduleEvent[];
  showDate?: boolean;
  onDelete?: (eventId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h5 className="text-sm font-bold text-slate-900">{title}</h5>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
          {events.length}건
        </span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-slate-100 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    "rounded-full px-2 py-1 text-[11px] font-bold",
                    event.tone === "green"
                      ? "bg-green-100 text-green-700"
                      : event.tone === "blue"
                        ? "bg-blue-100 text-blue-700"
                        : event.tone === "red"
                          ? "bg-red-100 text-red-700"
                          : event.tone === "amber"
                            ? "bg-amber-100 text-amber-700"
                          : "bg-indigo-100 text-indigo-700",
                  ].join(" ")}
                >
                  {event.label}
                </span>
                {showDate && (
                  <span className="text-xs font-semibold text-slate-500">
                    {formatKoreanDate(event.date)}
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">
                {event.detail}
              </p>
              {event.manual && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(event.id)}
                  className="mt-2 rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function _NoticePanel() {
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
