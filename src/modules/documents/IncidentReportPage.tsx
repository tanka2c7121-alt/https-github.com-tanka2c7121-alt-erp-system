"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
};

type IncidentReportPageProps = {
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
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

type FormState = {
  reportDate: string;
  incidentType: string;
  title: string;
  location: string;
  content: string;
  actionTaken: string;
  memo: string;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";
const incidentTypes = ["업무", "사고", "민원", "차량", "기타"];

const formatRequesterName = (user: LoginUser) => {
  const department = user.department?.trim();
  return department ? `${department} / ${user.user_name}` : user.user_name;
};

export default function IncidentReportPage({
  user,
  isAdmin,
  onSelectMenu,
}: IncidentReportPageProps) {
  const [rows, setRows] = useState<IncidentReport[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    reportDate: localDateText(),
    incidentType: "업무",
    title: "",
    location: "",
    content: "",
    actionTaken: "",
    memo: "",
  });

  const canCheck =
    isAdmin || user.approval_role === "관리부" || user.department === "관리부";

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("incident_reports")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("경위서 조회 실패: " + error.message);
      return;
    }

    setRows((data ?? []) as IncidentReport[]);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => canCheck || row.requested_by === user.user_id)
      .filter((row) => !statusFilter || row.status === statusFilter)
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.report_date,
          row.incident_type,
          row.title,
          row.location ?? "",
          row.content,
          row.action_taken ?? "",
          row.requested_name ?? "",
          row.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [canCheck, rows, searchText, statusFilter, user.user_id]);

  const pendingCount = rows.filter((row) => row.status === "확인대기").length;
  const checkedCount = visibleRows.filter((row) => row.status === "확인완료").length;

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      reportDate: localDateText(),
      incidentType: "업무",
      title: "",
      location: "",
      content: "",
      actionTaken: "",
      memo: "",
    });
  };

  const handleSubmit = async () => {
    if (!form.reportDate || !form.title.trim() || !form.content.trim()) {
      alert("작성일, 제목, 경위 내용을 입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("incident_reports").insert({
      report_date: form.reportDate,
      incident_type: form.incidentType,
      title: form.title.trim(),
      location: form.location.trim() || null,
      content: form.content.trim(),
      action_taken: form.actionTaken.trim() || null,
      memo: form.memo.trim() || null,
      status: "확인대기",
      requested_by: user.user_id,
      requested_name: formatRequesterName(user),
      requested_department: user.department ?? null,
    });

    setSaving(false);

    if (error) {
      alert("경위서 저장 실패: " + error.message);
      return;
    }

    alert("경위서가 등록되었습니다.");
    resetForm();
    void loadRows();
  };

  const handleCheck = async (row: IncidentReport) => {
    if (!canCheck || row.status !== "확인대기") return;

    if (!confirm("이 경위서를 확인완료 처리할까요?")) return;

    const { error } = await supabase
      .from("incident_reports")
      .update({
        status: "확인완료",
        checked_by: user.user_id,
        checked_name: formatRequesterName(user),
        checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      alert("확인 처리 실패: " + error.message);
      return;
    }

    void loadRows();
  };

  const handleReject = async (row: IncidentReport) => {
    if (!canCheck || row.status !== "확인대기") return;

    if (!confirm("이 경위서를 반려 처리할까요?")) return;

    const { error } = await supabase
      .from("incident_reports")
      .update({
        status: "반려",
        checked_by: user.user_id,
        checked_name: formatRequesterName(user),
        checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    void loadRows();
  };

  const canDeleteReport = (row: IncidentReport) =>
    canCheck || row.requested_by === user.user_id;

  const handleDelete = async (row: IncidentReport) => {
    if (!canDeleteReport(row)) {
      alert("삭제 권한이 없습니다.");
      return;
    }

    if (!confirm("이 경위서를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) {
      return;
    }

    const { data, error } = await supabase
      .from("incident_reports")
      .delete()
      .eq("id", row.id)
      .select("id")
      .maybeSingle();

    if (error) {
      alert("경위서 삭제 실패: " + error.message);
      return;
    }

    if (!data) {
      alert("삭제 권한이 없거나 이미 삭제된 경위서입니다.");
      return;
    }

    alert("삭제되었습니다.");
    void loadRows();
  };

  const openPrintPage = (row: IncidentReport) => {
    onSelectMenu({
      id: "documents-incident-report-print",
      title: "경위서 출력",
      data: { incidentReport: row },
    });
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xl font-bold md:text-2xl">경위서</h3>
          <p className="text-sm text-slate-700">
            경위서는 승인이 아니라 관리자 확인으로 처리됩니다.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Badge label="확인대기" value={pendingCount} tone="orange" />
          <Badge label="확인완료" value={checkedCount} tone="blue" />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-1">
          <h4 className="font-bold text-slate-900">경위서 작성</h4>
          <p className="text-sm text-slate-600">
            발생 경위와 조치 내용을 기록하면 관리자가 확인합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="작성일" type="date" value={form.reportDate} onChange={(value) => handleChange("reportDate", value)} />
          <Field label="구분" value={form.incidentType} onChange={(value) => handleChange("incidentType", value)} options={incidentTypes} />
          <Field label="장소" value={form.location} onChange={(value) => handleChange("location", value)} placeholder="예: 공장, 사무실, 현장" />
        </div>

        <div className="mt-4">
          <Field label="제목" value={form.title} onChange={(value) => handleChange("title", value)} placeholder="경위서 제목" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextArea label="경위 내용" value={form.content} onChange={(value) => handleChange("content", value)} placeholder="발생 경위와 내용을 입력하세요" />
          <TextArea label="조치 내용" value={form.actionTaken} onChange={(value) => handleChange("actionTaken", value)} placeholder="조치했거나 조치 예정인 내용을 입력하세요" />
        </div>

        <div className="mt-4">
          <TextArea label="메모" value={form.memo} onChange={(value) => handleChange("memo", value)} placeholder="추가 메모" rows={3} />
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
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "등록"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h4 className="font-bold text-slate-900">
            {canCheck ? "경위서 목록" : "내 경위서 목록"}
          </h4>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">전체 상태</option>
              <option value="확인대기">확인대기</option>
              <option value="확인완료">확인완료</option>
              <option value="반려">반려</option>
            </select>

            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="제목 / 작성자 / 내용 검색"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <IncidentTable
            rows={visibleRows}
            canCheck={canCheck}
            canDelete={canDeleteReport}
            onCheck={handleCheck}
            onReject={handleReject}
            onDelete={handleDelete}
            onPrint={openPrintPage}
          />
        </div>

        <MobileIncidentCards
          rows={visibleRows}
          canCheck={canCheck}
          canDelete={canDeleteReport}
          onCheck={handleCheck}
          onReject={handleReject}
          onDelete={handleDelete}
          onPrint={openPrintPage}
        />
      </section>
    </div>
  );
}

function IncidentTable({
  rows,
  canCheck,
  canDelete,
  onCheck,
  onReject,
  onDelete,
  onPrint,
}: {
  rows: IncidentReport[];
  canCheck: boolean;
  canDelete: (row: IncidentReport) => boolean;
  onCheck: (row: IncidentReport) => void;
  onReject: (row: IncidentReport) => void;
  onDelete: (row: IncidentReport) => void;
  onPrint: (row: IncidentReport) => void;
}) {
  return (
    <table className="min-w-[980px] w-full border-collapse text-sm">
      <thead className="bg-slate-100 text-slate-700">
        <tr>
          <th className="border px-2 py-2">작성일</th>
          <th className="border px-2 py-2">구분</th>
          <th className="border px-2 py-2">제목</th>
          <th className="border px-2 py-2">작성자</th>
          <th className="border px-2 py-2">상태</th>
          <th className="border px-2 py-2">확인자</th>
          <th className="border px-2 py-2">내용</th>
          <th className="border px-2 py-2">처리</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="align-top hover:bg-slate-50">
            <td className="border px-2 py-2 text-center">{row.report_date}</td>
            <td className="border px-2 py-2 text-center">{row.incident_type}</td>
            <td className="border px-2 py-2 font-semibold">{row.title}</td>
            <td className="border px-2 py-2 text-center">{row.requested_name}</td>
            <td className="border px-2 py-2 text-center">
              <button
                type="button"
                onClick={() => onPrint(row)}
                className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-200"
                title="경위서 내용 보기"
              >
                <StatusBadge status={row.status} />
              </button>
            </td>
            <td className="border px-2 py-2 text-center">
              {row.checked_name ?? "-"}
            </td>
            <td className="border px-2 py-2">
              <div className="max-w-md whitespace-pre-wrap text-slate-700">
                {row.content}
              </div>
              {row.action_taken && (
                <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-600">
                  조치: {row.action_taken}
                </div>
              )}
            </td>
            <td className="border px-2 py-2 text-center">
              <ActionButtons
                row={row}
                canCheck={canCheck}
                canDelete={canDelete}
                onCheck={onCheck}
                onReject={onReject}
                onDelete={onDelete}
              />
            </td>
          </tr>
        ))}

        {rows.length === 0 && (
          <tr>
            <td className="border px-3 py-8 text-center text-slate-500" colSpan={8}>
              조회된 경위서가 없습니다.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MobileIncidentCards({
  rows,
  canCheck,
  canDelete,
  onCheck,
  onReject,
  onDelete,
  onPrint,
}: {
  rows: IncidentReport[];
  canCheck: boolean;
  canDelete: (row: IncidentReport) => boolean;
  onCheck: (row: IncidentReport) => void;
  onReject: (row: IncidentReport) => void;
  onDelete: (row: IncidentReport) => void;
  onPrint: (row: IncidentReport) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 md:hidden">
        조회된 경위서가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold text-slate-900">{row.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {row.report_date} / {row.incident_type}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onPrint(row)}
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-200"
              title="경위서 내용 보기"
            >
              <StatusBadge status={row.status} />
            </button>
          </div>

          <div className="mt-3 text-sm text-slate-700">
            <div>작성자: {row.requested_name ?? "-"}</div>
            <div>확인자: {row.checked_name ?? "-"}</div>
          </div>

          <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            {row.content}
          </div>

          {row.action_taken && (
            <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              조치: {row.action_taken}
            </div>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onPrint(row)}
              className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-600"
            >
              출력
            </button>
            <ActionButtons
              row={row}
              canCheck={canCheck}
              canDelete={canDelete}
              onCheck={onCheck}
              onReject={onReject}
              onDelete={onDelete}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionButtons({
  row,
  canCheck,
  canDelete,
  onCheck,
  onReject,
  onDelete,
}: {
  row: IncidentReport;
  canCheck: boolean;
  canDelete: (row: IncidentReport) => boolean;
  onCheck: (row: IncidentReport) => void;
  onReject: (row: IncidentReport) => void;
  onDelete: (row: IncidentReport) => void;
}) {
  const showCheckButtons = canCheck && row.status === "확인대기";
  const showDeleteButton = canDelete(row);

  if (!showCheckButtons && !showDeleteButton) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  return (
    <div className="flex justify-center gap-2">
      {showCheckButtons && (
        <>
          <button
            type="button"
            onClick={() => void onCheck(row)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => void onReject(row)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            반려
          </button>
        </>
      )}
      {showDeleteButton && (
        <button
          type="button"
          onClick={() => void onDelete(row)}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          삭제
        </button>
      )}
    </div>
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

function StatusBadge({ status }: { status: IncidentStatus }) {
  const className =
    status === "확인완료"
      ? "bg-green-100 text-green-700"
      : status === "반려"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-700";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  options?: string[];
}) {
  return (
    <label className={labelClass}>
      {label}
      {options ? (
        <select
          className={inputClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={inputClass}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 5,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        className={`${inputClass} resize-none`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
