"use client";

import type { MenuItem } from "../../data/menuData";
import { isAdminUser } from "../../lib/approval";
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

type IncidentStatus = "확인대기" | "확인완료" | "반려";

type IncidentReport = {
  id: number;
  report_date: string;
  incident_type: string;
  title: string;
  location: string | null;
  content: string;
  action_taken: string | null;
  memo: string | null;
  status: IncidentStatus;
  requested_by: string;
  requested_name: string | null;
  requested_department: string | null;
  checked_by: string | null;
  checked_name: string | null;
  checked_at: string | null;
  created_at: string | null;
};

type IncidentReportPrintPageProps = {
  incidentReport?: IncidentReport;
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "";

  return value.slice(0, 16).replace("T", " ");
};

const formatRequesterName = (user: LoginUser) => {
  const department = user.department?.trim();
  return department ? `${department} / ${user.user_name}` : user.user_name;
};

export default function IncidentReportPrintPage({
  incidentReport,
  user,
  isAdmin,
  onSelectMenu,
}: IncidentReportPrintPageProps) {
  if (!incidentReport) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        출력할 경위서가 선택되지 않았습니다.
      </div>
    );
  }

  const canCheck = isAdmin || isAdminUser(user);
  const showCheck = canCheck && incidentReport.status === "확인대기";
  const goList = () =>
    onSelectMenu({
      id: "documents-incident-report",
      title: "경위서",
    });

  const checkReport = async () => {
    if (!showCheck) {
      return;
    }

    const ok = confirm("이 경위서를 확인완료 처리할까요?");
    if (!ok) return;

    const { error } = await supabase
      .from("incident_reports")
      .update({
        status: "확인완료",
        checked_by: user.user_id,
        checked_name: formatRequesterName(user),
        checked_at: new Date().toISOString(),
      })
      .eq("id", incidentReport.id);

    if (error) {
      alert("확인 처리 실패: " + error.message);
      return;
    }

    alert("확인완료 처리되었습니다.");
    goList();
  };

  const rejectReport = async () => {
    if (!showCheck) {
      return;
    }

    const ok = confirm("이 경위서를 반려 처리할까요?");
    if (!ok) return;

    const { error } = await supabase
      .from("incident_reports")
      .update({
        status: "반려",
        checked_by: user.user_id,
        checked_name: formatRequesterName(user),
        checked_at: new Date().toISOString(),
      })
      .eq("id", incidentReport.id);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    alert("반려 처리되었습니다.");
    goList();
  };

  return (
    <div className="print-area min-h-screen bg-slate-200 p-4 text-slate-900 print:bg-white print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2">
        {showCheck && (
          <>
            <button
              type="button"
              onClick={() => void checkReport()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => void rejectReport()}
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
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
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
        <header className="mb-8 grid grid-cols-[1fr_260px] gap-4">
          <div>
            <h1 className="text-center text-3xl font-bold tracking-[0.35em]">
              경위서
            </h1>
            <div className="mt-6 text-sm">
              <div>문서번호: INC-{String(incidentReport.id).padStart(6, "0")}</div>
              <div>작성일자: {incidentReport.created_at?.slice(0, 10) ?? ""}</div>
            </div>
          </div>

          <table className="h-24 w-full border-collapse text-center text-sm">
            <tbody>
              <tr>
                <td className="w-16 border border-slate-900 font-bold" rowSpan={3}>
                  확인
                </td>
                <td className="border border-slate-900 font-bold">작성자</td>
                <td className="border border-slate-900 font-bold">확인자</td>
              </tr>
              <tr>
                <td className="h-14 border border-slate-900">
                  {incidentReport.requested_name ?? ""}
                </td>
                <td className="h-14 border border-slate-900">
                  {incidentReport.checked_name ?? ""}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-900 text-xs">작성</td>
                <td className="border border-slate-900 text-xs">
                  {incidentReport.status}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <section className="mb-6">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <PrintRow label="작성자" value={incidentReport.requested_name ?? incidentReport.requested_by} />
              <PrintRow label="부서" value={incidentReport.requested_department ?? ""} />
              <PrintRow label="작성일" value={incidentReport.report_date} />
              <PrintRow label="구분" value={incidentReport.incident_type} />
              <PrintRow label="장소" value={incidentReport.location ?? ""} />
              <PrintRow label="제목" value={incidentReport.title} />
              <PrintRow label="상태" value={incidentReport.status} />
              <PrintRow label="확인일시" value={formatDateTime(incidentReport.checked_at)} />
              <PrintRow label="메모" value={incidentReport.memo ?? ""} />
            </tbody>
          </table>
        </section>

        <PrintBlock title="경위 내용" value={incidentReport.content} />
        <PrintBlock title="조치 내용" value={incidentReport.action_taken ?? ""} />

        <footer className="mt-10 text-center text-sm font-semibold">
          위와 같이 경위를 보고합니다.
        </footer>
      </article>
    </div>
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

function PrintBlock({ title, value }: { title: string; value: string }) {
  return (
    <section className="mb-6">
      <div className="mb-2 border border-slate-900 bg-slate-100 px-3 py-2 text-sm font-bold">
        {title}
      </div>
      <div className="min-h-[120px] whitespace-pre-wrap border border-slate-900 px-3 py-3 text-sm">
        {value || "\u00A0"}
      </div>
    </section>
  );
}
