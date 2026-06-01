"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { addLocalDaysText, localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: "ADMIN" | "STAFF";
};

type AttendanceRequestPageProps = {
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
};

type AttendanceRequest = {
  id: number;
  request_type: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string;
  memo: string | null;
  status:
    | "부서장 승인대기"
    | "관리부 확인대기"
    | "관리자 승인대기"
    | "승인완료"
    | "반려";
  requested_by: string;
  requested_name: string | null;
  requested_department: string | null;
  department_approved_by: string | null;
  department_approved_name: string | null;
  department_approved_at: string | null;
  admin_dept_approved_by: string | null;
  admin_dept_approved_name: string | null;
  admin_dept_approved_at: string | null;
  final_approved_by: string | null;
  final_approved_name: string | null;
  final_approved_at: string | null;
  approved_by: string | null;
  approved_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

type FormState = {
  requestType: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  memo: string;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";
const requestTypes = ["연차", "오전반차", "오후반차", "조퇴", "외근", "지각", "병가", "기타"];
const defaultTimeByRequestType: Record<string, { startTime: string; endTime: string }> = {
  연차: { startTime: "08:30", endTime: "18:00" },
  오전반차: { startTime: "08:30", endTime: "12:00" },
  오후반차: { startTime: "12:00", endTime: "18:00" },
};
const pendingStatuses = [
  "부서장 승인대기",
  "관리부 확인대기",
  "관리자 승인대기",
];

const todayText = localDateText;
const addDaysText = addLocalDaysText;

const formatRequesterName = (user: LoginUser) => {
  const department = user.department?.trim();

  return department ? `${department} / ${user.user_name}` : user.user_name;
};

const getApprovalRole = (user: LoginUser) =>
  user.approval_role ?? (user.role === "ADMIN" ? "관리자" : "직원");

export default function AttendanceRequestPage({
  user,
  isAdmin,
  onSelectMenu,
}: AttendanceRequestPageProps) {
  const [rows, setRows] = useState<AttendanceRequest[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    requestType: "연차",
    startDate: todayText(),
    endDate: todayText(),
    startTime: defaultTimeByRequestType["연차"].startTime,
    endTime: defaultTimeByRequestType["연차"].endTime,
    reason: "",
    memo: "",
  });
  const approvalRole = getApprovalRole(user);
  const isDepartmentHead = approvalRole === "부서장";
  const isAdminDept = approvalRole === "관리부";
  const isFinalAdmin = approvalRole === "관리자" || isAdmin;

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("attendance_requests")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("근태신청서 조회 실패: " + error.message);
      return;
    }

    setRows((data ?? []) as AttendanceRequest[]);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (isFinalAdmin || isAdminDept) return true;
        if (isDepartmentHead) {
          return (
            row.requested_by === user.user_id ||
            row.requested_department === user.department
          );
        }

        return row.requested_by === user.user_id;
      })
      .filter((row) => !statusFilter || row.status === statusFilter)
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.request_type,
          row.start_date,
          row.end_date ?? "",
          row.reason,
          row.requested_name ?? "",
          row.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [
    isAdminDept,
    isDepartmentHead,
    isFinalAdmin,
    rows,
    searchText,
    statusFilter,
    user.department,
    user.user_id,
  ]);

  const pendingCount = visibleRows.filter((row) =>
    pendingStatuses.includes(row.status)
  ).length;
  const approvedCount = visibleRows.filter((row) => row.status === "승인완료").length;

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      requestType: "연차",
      startDate: todayText(),
      endDate: todayText(),
      startTime: defaultTimeByRequestType["연차"].startTime,
      endTime: defaultTimeByRequestType["연차"].endTime,
      reason: "",
      memo: "",
    });
  };

  const handleSubmit = async () => {
    if (!form.requestType || !form.startDate || !form.reason.trim()) {
      alert("근태종류, 시작일, 사유를 입력하세요.");
      return;
    }

    if (form.endDate && form.endDate < form.startDate) {
      alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("attendance_requests").insert({
      request_type: form.requestType,
      start_date: form.startDate,
      end_date: form.endDate || form.startDate,
      start_time: form.startTime || null,
      end_time: form.endTime || null,
      reason: form.reason,
      memo: form.memo,
      status: "부서장 승인대기",
      requested_by: user.user_id,
      requested_name: formatRequesterName(user),
      requested_department: user.department ?? "",
    });

    setSaving(false);

    if (error) {
      alert("근태신청 실패: " + error.message);
      return;
    }

    alert("근태신청서가 제출되었습니다.");
    resetForm();
    void loadRows();
  };

  const canApproveRequest = (row: AttendanceRequest) => {
    if (row.status === "부서장 승인대기") {
      return (
        isFinalAdmin ||
        (isDepartmentHead && row.requested_department === user.department)
      );
    }

    if (row.status === "관리부 확인대기") {
      return isFinalAdmin || isAdminDept;
    }

    if (row.status === "관리자 승인대기") {
      return isFinalAdmin;
    }

    return false;
  };

  const nextApprovalStatus = (
    status: AttendanceRequest["status"]
  ): AttendanceRequest["status"] => {
    if (status === "부서장 승인대기") return "관리부 확인대기";
    if (status === "관리부 확인대기") return "관리자 승인대기";
    return "승인완료";
  };

  const approveRequest = async (row: AttendanceRequest) => {
    if (!canApproveRequest(row)) {
      alert("현재 단계의 승인 권한이 없습니다.");
      return;
    }

    if (!confirm("이 근태신청서를 다음 단계로 승인할까요?")) {
      return;
    }

    const nextStatus = nextApprovalStatus(row.status);
    const stagePayload =
      row.status === "부서장 승인대기"
        ? {
            department_approved_by: user.user_id,
            department_approved_name: user.user_name,
            department_approved_at: new Date().toISOString(),
          }
        : row.status === "관리부 확인대기"
          ? {
              admin_dept_approved_by: user.user_id,
              admin_dept_approved_name: user.user_name,
              admin_dept_approved_at: new Date().toISOString(),
            }
          : {
              final_approved_by: user.user_id,
              final_approved_name: user.user_name,
              final_approved_at: new Date().toISOString(),
            };

    const { error } = await supabase
      .from("attendance_requests")
      .update({
        status: nextStatus,
        ...(nextStatus === "승인완료"
          ? {
              approved_by: user.user_id,
              approved_name: user.user_name,
              approved_at: new Date().toISOString(),
            }
          : {}),
        ...stagePayload,
        reject_reason: null,
      })
      .eq("id", row.id);

    if (error) {
      alert("승인 처리 실패: " + error.message);
      return;
    }

    alert(nextStatus === "승인완료" ? "최종 승인되었습니다." : "다음 단계로 승인되었습니다.");
    void loadRows();
  };

  const rejectRequest = async (row: AttendanceRequest) => {
    if (!canApproveRequest(row)) {
      alert("현재 단계의 반려 권한이 없습니다.");
      return;
    }

    const reason = prompt("반려 사유를 입력하세요.");

    if (reason === null) {
      return;
    }

    const { error } = await supabase
      .from("attendance_requests")
      .update({
        status: "반려",
        approved_by: user.user_id,
        approved_name: user.user_name,
        approved_at: new Date().toISOString(),
        reject_reason: reason,
      })
      .eq("id", row.id);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    alert("반려되었습니다.");
    void loadRows();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-bold">근태신청서</h3>
          <p className="text-sm text-slate-600">
            휴가, 반차, 조퇴, 외근 등 근태 신청과 승인 내역을 관리합니다.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Badge label="승인대기" value={pendingCount} tone="orange" />
          <Badge label="승인완료" value={approvedCount} tone="blue" />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-1">
          <h4 className="font-bold text-slate-900">신청 작성</h4>
          <p className="text-sm font-semibold text-orange-600">
            근태신청서는 원칙적으로 최소 7일 전에 작성해야 하며, 7일 이내 신청은 긴급/예외 신청으로 표시됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="근태종류">
            <select
              className={inputClass}
              value={form.requestType}
              onChange={(event) => {
                const requestType = event.target.value;
                const defaultTime = defaultTimeByRequestType[requestType];

                handleChange("requestType", requestType);

                if (defaultTime) {
                  handleChange("startTime", defaultTime.startTime);
                  handleChange("endTime", defaultTime.endTime);
                }
              }}
            >
              {requestTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>

          <Field label="시작일">
            <input
              type="date"
              className={inputClass}
              value={form.startDate}
              onChange={(event) => handleChange("startDate", event.target.value)}
            />
          </Field>

          <Field label="종료일">
            <input
              type="date"
              className={inputClass}
              value={form.endDate}
              onChange={(event) => handleChange("endDate", event.target.value)}
            />
          </Field>

          <Field label="시간">
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                value={form.startTime}
                onChange={(event) => handleChange("startTime", event.target.value)}
              />
              <span className="text-sm text-slate-500">~</span>
              <input
                type="time"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                value={form.endTime}
                onChange={(event) => handleChange("endTime", event.target.value)}
              />
            </div>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="신청사유">
            <input
              className={inputClass}
              placeholder="신청 사유를 입력하세요"
              value={form.reason}
              onChange={(event) => handleChange("reason", event.target.value)}
            />
          </Field>

          <Field label="비고">
            <input
              className={inputClass}
              placeholder="필요 시 입력"
              value={form.memo}
              onChange={(event) => handleChange("memo", event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "신청 중..." : "신청"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h4 className="font-bold text-slate-900">
            {isAdmin ? "근태신청서 목록" : "내 신청 목록"}
          </h4>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">전체 상태</option>
              <option>부서장 승인대기</option>
              <option>관리부 확인대기</option>
              <option>관리자 승인대기</option>
              <option>승인완료</option>
              <option>반려</option>
            </select>

            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="종류 / 사유 / 작성자 검색"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <AttendanceTable
            rows={visibleRows}
            isAdmin={isAdmin}
            onApprove={approveRequest}
            onReject={rejectRequest}
            canApprove={canApproveRequest}
            onPrint={(row) =>
              onSelectMenu({
                id: "documents-attendance-request-print",
                title: "근태신청서 출력",
                data: { attendanceRequest: row },
              })
            }
          />
        </div>

        <MobileAttendanceCards
          rows={visibleRows}
          isAdmin={isAdmin}
          onApprove={approveRequest}
          onReject={rejectRequest}
          canApprove={canApproveRequest}
          onPrint={(row) =>
            onSelectMenu({
              id: "documents-attendance-request-print",
              title: "근태신청서 출력",
              data: { attendanceRequest: row },
            })
          }
        />
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={labelClass}>
      {label}
      {children}
    </label>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "orange" | "blue";
}) {
  const toneClass =
    tone === "orange"
      ? "bg-orange-50 text-orange-700"
      : "bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-lg px-3 py-2 font-bold ${toneClass}`}>
      {label}: {value}
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceRequest["status"] }) {
  const className =
    status === "승인완료"
      ? "bg-green-100 text-green-700"
      : status === "반려"
        ? "bg-red-100 text-red-700"
        : "bg-orange-100 text-orange-700";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}

function UrgentBadge({ startDate }: { startDate: string }) {
  if (startDate >= addDaysText(7)) {
    return null;
  }

  return (
    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
      긴급/예외
    </span>
  );
}

function formatPeriod(row: AttendanceRequest) {
  const dateText =
    row.end_date && row.end_date !== row.start_date
      ? `${row.start_date} ~ ${row.end_date}`
      : row.start_date;
  const timeText =
    row.start_time || row.end_time
      ? ` ${row.start_time ?? ""} ~ ${row.end_time ?? ""}`
      : "";

  return `${dateText}${timeText}`;
}

function AttendanceTable({
  rows,
  isAdmin,
  onApprove,
  onReject,
  canApprove,
  onPrint,
}: {
  rows: AttendanceRequest[];
  isAdmin: boolean;
  onApprove: (row: AttendanceRequest) => void;
  onReject: (row: AttendanceRequest) => void;
  canApprove: (row: AttendanceRequest) => boolean;
  onPrint: (row: AttendanceRequest) => void;
}) {
  const showManageColumn = isAdmin || rows.some(canApprove);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-slate-100 text-left text-slate-700">
          <th className="border border-slate-200 px-3 py-2">상태</th>
          <th className="border border-slate-200 px-3 py-2">작성자</th>
          <th className="border border-slate-200 px-3 py-2">종류</th>
          <th className="border border-slate-200 px-3 py-2">기간</th>
          <th className="border border-slate-200 px-3 py-2">사유</th>
          <th className="border border-slate-200 px-3 py-2">승인자</th>
          <th className="border border-slate-200 px-3 py-2">현재단계</th>
          <th className="border border-slate-200 px-3 py-2 text-center">출력</th>
          {showManageColumn && (
            <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
          )}
        </tr>
      </thead>

      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={showManageColumn ? 9 : 8}
              className="border border-slate-200 px-3 py-8 text-center text-slate-500"
            >
              등록된 근태신청서가 없습니다.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="border border-slate-200 px-3 py-2">
                <StatusBadge status={row.status} />
              </td>
              <td className="border border-slate-200 px-3 py-2">
                {row.requested_name ?? row.requested_by}
              </td>
              <td className="border border-slate-200 px-3 py-2 font-semibold">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{row.request_type}</span>
                  <UrgentBadge startDate={row.start_date} />
                </div>
              </td>
              <td className="border border-slate-200 px-3 py-2">
                {formatPeriod(row)}
              </td>
              <td className="border border-slate-200 px-3 py-2">
                <div>{row.reason}</div>
                {row.memo && (
                  <div className="text-xs text-slate-500">{row.memo}</div>
                )}
                {row.reject_reason && (
                  <div className="text-xs text-red-500">
                    반려사유: {row.reject_reason}
                  </div>
                )}
              </td>
              <td className="border border-slate-200 px-3 py-2">
                {row.approved_name ?? "-"}
              </td>
              <td className="border border-slate-200 px-3 py-2 text-xs text-slate-600">
                <ApprovalTrail row={row} />
              </td>
              <td className="border border-slate-200 px-3 py-2 text-center">
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  출력
                </button>
              </td>
              {showManageColumn && (
                <td className="border border-slate-200 px-3 py-2 text-center">
                  {canApprove(row) ? (
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApprove(row)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(row)}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        반려
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">권한없음</span>
                  )}
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ApprovalTrail({ row }: { row: AttendanceRequest }) {
  const items = [
    {
      label: "부서장",
      name: row.department_approved_name,
      at: row.department_approved_at,
    },
    {
      label: "관리부",
      name: row.admin_dept_approved_name,
      at: row.admin_dept_approved_at,
    },
    {
      label: "관리자",
      name: row.final_approved_name,
      at: row.final_approved_at,
    },
  ];

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.label}>
          <span className="font-semibold">{item.label}</span>:{" "}
          {item.name ? `${item.name} (${item.at?.slice(0, 10) ?? ""})` : "-"}
        </div>
      ))}
    </div>
  );
}

function MobileAttendanceCards({
  rows,
  isAdmin,
  onApprove,
  onReject,
  canApprove,
  onPrint,
}: {
  rows: AttendanceRequest[];
  isAdmin: boolean;
  onApprove: (row: AttendanceRequest) => void;
  onReject: (row: AttendanceRequest) => void;
  canApprove: (row: AttendanceRequest) => boolean;
  onPrint: (row: AttendanceRequest) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          등록된 근태신청서가 없습니다.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <StatusBadge status={row.status} />
                <span className="ml-2">
                  <UrgentBadge startDate={row.start_date} />
                </span>
                <div className="mt-2 text-lg font-bold">{row.request_type}</div>
                <div className="text-sm text-slate-500">
                  {row.requested_name ?? row.requested_by}
                </div>
              </div>
              <div className="text-right text-xs font-semibold text-slate-500">
                {formatPeriod(row)}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-bold">{row.reason}</div>
              {row.memo && <div className="mt-1 text-slate-600">{row.memo}</div>}
              {row.reject_reason && (
                <div className="mt-1 text-red-500">
                  반려사유: {row.reject_reason}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onPrint(row)}
              className="mt-3 w-full rounded-lg border border-blue-300 py-2 text-sm font-semibold text-blue-600"
            >
              출력
            </button>

            {canApprove(row) && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(row)}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={() => onReject(row)}
                  className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600"
                >
                  반려
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
