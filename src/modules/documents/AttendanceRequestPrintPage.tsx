"use client";

import type { MenuItem } from "../../data/menuData";
import {
  isAdminUser,
  isChiefUser,
  isDepartmentHeadUser,
  isSameDepartment,
} from "../../lib/approval";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
  is_active: boolean;
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
    | "총괄관리 승인대기"
    | "관리부 확인대기"
    | "관리자 승인대기"
    | "승인완료"
    | "반려";
  requested_by: string;
  requested_name: string | null;
  requested_department: string | null;
  department_approved_by?: string | null;
  department_approved_name: string | null;
  department_approved_at: string | null;
  admin_dept_approved_by?: string | null;
  admin_dept_approved_name: string | null;
  admin_dept_approved_at: string | null;
  final_approved_by?: string | null;
  final_approved_name: string | null;
  final_approved_at: string | null;
  approved_by?: string | null;
  approved_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

type AttendanceRequestPrintPageProps = {
  attendanceRequest?: AttendanceRequest;
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";

  return value.slice(0, 16).replace("T", " ");
};

const formatPeriod = (row: AttendanceRequest) => {
  const dateText =
    row.end_date && row.end_date !== row.start_date
      ? `${row.start_date} ~ ${row.end_date}`
      : row.start_date;
  const timeText =
    row.start_time || row.end_time
      ? ` ${row.start_time ?? ""} ~ ${row.end_time ?? ""}`
      : "";

  return `${dateText}${timeText}`;
};

export default function AttendanceRequestPrintPage({
  attendanceRequest,
  user,
  isAdmin,
  onSelectMenu,
}: AttendanceRequestPrintPageProps) {
  if (!attendanceRequest) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        출력할 근태신청서가 선택되지 않았습니다.
      </div>
    );
  }

  const isFinalAdmin = isAdmin || isAdminUser(user);
  const canApprove =
    attendanceRequest.status === "부서장 승인대기"
      ? isFinalAdmin ||
        (isChiefUser(user) && attendanceRequest.requested_department === "관리부") ||
        (isDepartmentHeadUser(user) &&
          attendanceRequest.requested_by !== user.user_id &&
          isSameDepartment(user, attendanceRequest.requested_department))
      : attendanceRequest.status === "총괄관리 승인대기" ||
          attendanceRequest.status === "관리부 확인대기"
        ? isFinalAdmin ||
          (isChiefUser(user) && attendanceRequest.requested_by !== user.user_id)
        : attendanceRequest.status === "관리자 승인대기"
          ? isFinalAdmin
          : false;

  const goList = () =>
    onSelectMenu({
      id: "documents-attendance-request",
      title: "근태신청서",
    });

  const nextApprovalStatus = (): AttendanceRequest["status"] => {
    if (attendanceRequest.status === "부서장 승인대기") return "총괄관리 승인대기";
    if (
      attendanceRequest.status === "총괄관리 승인대기" ||
      attendanceRequest.status === "관리부 확인대기"
    ) {
      return "관리자 승인대기";
    }
    return "승인완료";
  };

  const approveRequest = async () => {
    if (!canApprove) {
      alert("현재 단계의 승인 권한이 없습니다.");
      return;
    }

    if (!confirm("이 근태신청서를 다음 단계로 승인할까요?")) {
      return;
    }

    const approvedAt = new Date().toISOString();
    const nextStatus = nextApprovalStatus();
    const stagePayload =
      attendanceRequest.status === "부서장 승인대기"
        ? {
            department_approved_by: user.user_id,
            department_approved_name: user.user_name,
            department_approved_at: approvedAt,
          }
        : attendanceRequest.status === "총괄관리 승인대기" ||
            attendanceRequest.status === "관리부 확인대기"
          ? {
              admin_dept_approved_by: user.user_id,
              admin_dept_approved_name: user.user_name,
              admin_dept_approved_at: approvedAt,
            }
          : {
              final_approved_by: user.user_id,
              final_approved_name: user.user_name,
              final_approved_at: approvedAt,
            };

    const { error } = await supabase
      .from("attendance_requests")
      .update({
        status: nextStatus,
        ...(nextStatus === "승인완료"
          ? {
              approved_by: user.user_id,
              approved_name: user.user_name,
              approved_at: approvedAt,
            }
          : {}),
        ...stagePayload,
        reject_reason: null,
      })
      .eq("id", attendanceRequest.id);

    if (error) {
      alert("승인 처리 실패: " + error.message);
      return;
    }

    alert(nextStatus === "승인완료" ? "최종 승인되었습니다." : "다음 단계로 승인되었습니다.");
    goList();
  };

  const rejectRequest = async () => {
    if (!canApprove) {
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
      .eq("id", attendanceRequest.id);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    alert("반려되었습니다.");
    goList();
  };

  return (
    <div className="print-area min-h-screen bg-slate-200 p-4 text-slate-900 print:bg-white print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2">
        {canApprove && (
          <>
            <button
              type="button"
              onClick={() => void approveRequest()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              승인
            </button>
            <button
              type="button"
              onClick={() => void rejectRequest()}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              반려
            </button>
          </>
        )}
        <button
          type="button"
          onClick={goList}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          목록으로
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          인쇄
        </button>
      </div>

      <article
        className="mx-auto bg-white text-slate-900 shadow-lg print:m-0 print:shadow-none"
        style={{
          width: "196mm",
          minHeight: "283mm",
          padding: "3mm",
        }}
      >
        <header className="mb-8">
          <h1 className="text-center text-3xl font-bold tracking-[0.35em]">
            근태신청서
          </h1>

          <div className="mt-6 grid grid-cols-[1fr_360px] gap-4">
            <div className="text-sm">
              <div>문서번호: ATT-{String(attendanceRequest.id).padStart(6, "0")}</div>
              <div>작성일자: {attendanceRequest.created_at?.slice(0, 10) ?? ""}</div>
            </div>

            <ApprovalTable row={attendanceRequest} />
          </div>
        </header>

        <section className="mb-6">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <PrintRow
                label="신청자"
                value={attendanceRequest.requested_name ?? attendanceRequest.requested_by}
              />
              <PrintRow
                label="부서"
                value={attendanceRequest.requested_department ?? ""}
              />
              <PrintRow label="근태종류" value={attendanceRequest.request_type} />
              <PrintRow label="기간" value={formatPeriod(attendanceRequest)} />
              <PrintRow label="신청사유" value={attendanceRequest.reason} />
              <PrintRow label="비고" value={attendanceRequest.memo ?? ""} />
              <PrintRow label="상태" value={attendanceRequest.status} />
              <PrintRow
                label="반려사유"
                value={attendanceRequest.reject_reason ?? ""}
              />
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <div className="mb-2 border border-slate-900 bg-slate-100 px-3 py-2 text-sm font-bold">
            승인 이력
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-900 px-3 py-2">단계</th>
                <th className="border border-slate-900 px-3 py-2">승인자</th>
                <th className="border border-slate-900 px-3 py-2">승인일시</th>
              </tr>
            </thead>
            <tbody>
              <ApprovalHistoryRow
                label="부서장 승인"
                name={attendanceRequest.department_approved_name}
                at={attendanceRequest.department_approved_at}
              />
              <ApprovalHistoryRow
                label="총괄관리 승인"
                name={attendanceRequest.admin_dept_approved_name}
                at={attendanceRequest.admin_dept_approved_at}
              />
              <ApprovalHistoryRow
                label="관리자 승인"
                name={attendanceRequest.final_approved_name}
                at={attendanceRequest.final_approved_at}
              />
            </tbody>
          </table>
        </section>

        <footer className="mt-10 text-center text-sm font-semibold">
          위와 같이 근태를 신청합니다.
        </footer>
      </article>
    </div>
  );
}

function ApprovalTable({ row }: { row: AttendanceRequest }) {
  return (
    <table className="h-24 w-full border-collapse text-center text-sm">
      <tbody>
        <tr>
          <td className="w-14 border border-slate-900 font-bold" rowSpan={3}>
            결재
          </td>
          <td className="border border-slate-900 font-bold">신청자</td>
          <td className="border border-slate-900 font-bold">부서장</td>
          <td className="border border-slate-900 font-bold">총괄관리</td>
          <td className="border border-slate-900 font-bold">관리자</td>
        </tr>
        <tr>
          <td className="h-14 border border-slate-900">
            {row.requested_name ?? ""}
          </td>
          <td className="h-14 border border-slate-900">
            {row.department_approved_name ?? ""}
          </td>
          <td className="h-14 border border-slate-900">
            {row.admin_dept_approved_name ?? ""}
          </td>
          <td className="h-14 border border-slate-900">
            {row.final_approved_name ?? ""}
          </td>
        </tr>
        <tr>
          <td className="border border-slate-900 text-xs">신청</td>
          <td className="border border-slate-900 text-xs">
            {row.department_approved_at ? "승인" : ""}
          </td>
          <td className="border border-slate-900 text-xs">
            {row.admin_dept_approved_at ? "승인" : ""}
          </td>
          <td className="border border-slate-900 text-xs">
            {row.final_approved_at ? "승인" : ""}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function PrintRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <tr>
      <th className="w-32 border border-slate-900 bg-slate-100 px-3 py-2 text-left">
        {label}
      </th>
      <td className="border border-slate-900 px-3 py-2">
        {value || "\u00A0"}
      </td>
    </tr>
  );
}

function ApprovalHistoryRow({
  label,
  name,
  at,
}: {
  label: string;
  name: string | null;
  at: string | null;
}) {
  return (
    <tr>
      <td className="border border-slate-900 px-3 py-2 font-semibold">{label}</td>
      <td className="border border-slate-900 px-3 py-2">{name ?? ""}</td>
      <td className="border border-slate-900 px-3 py-2">
        {formatDateTime(at)}
      </td>
    </tr>
  );
}
