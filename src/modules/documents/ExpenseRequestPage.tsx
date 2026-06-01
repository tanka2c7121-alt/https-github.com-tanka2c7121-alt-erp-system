"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  role: "ADMIN" | "STAFF";
};

type ExpenseRequestPageProps = {
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
};

type ExpenseRequest = {
  id: number;
  request_date: string;
  account: string;
  expense_type: string;
  category: string;
  vendor: string | null;
  amount: number;
  content: string;
  payment_method: string | null;
  receipt_url: string;
  memo: string | null;
  status: "승인대기" | "승인완료" | "반려";
  requested_by: string;
  requested_name: string | null;
  approved_by: string | null;
  approved_name: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

type FormState = {
  requestDate: string;
  account: string;
  expenseType: string;
  category: string;
  vendor: string;
  amount: string;
  content: string;
  paymentMethod: string;
  memo: string;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";
const receiptBucket = "expense-receipts";

const todayText = localDateText;

const isFullUrl = (value: string) => /^https?:\/\//.test(value);

const formatRequesterName = (user: LoginUser) => {
  const department = user.department?.trim();

  return department ? `${department} / ${user.user_name}` : user.user_name;
};

const categoryOptions: Record<string, string[]> = {
  고정비: [
    "임대료",
    "관리비",
    "전기세",
    "수도세",
    "인터넷",
    "직원급여",
    "4대보험",
    "직원식대",
    "세금",
    "렌트료",
    "AOS프로그램사용료",
  ],
  변동비: [
    "부품대",
    "외주",
    "도장부관리비",
    "판금부관리비",
    "소모품",
    "유류비",
    "택시비",
    "식대",
    "탁송비",
    "세차비",
    "공구구입비",
    "기타지출",
  ],
};

export default function ExpenseRequestPage({
  user,
  isAdmin,
  onSelectMenu,
}: ExpenseRequestPageProps) {
  const [rows, setRows] = useState<ExpenseRequest[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    requestDate: todayText(),
    account: "",
    expenseType: "변동비",
    category: "",
    vendor: "",
    amount: "",
    content: "",
    paymentMethod: "",
    memo: "",
  });

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("expense_requests")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("지출결의서 조회 실패: " + error.message);
      return;
    }

    const nextRows = ((data ?? []) as ExpenseRequest[]).map((row) => ({ ...row }));
    const receiptPaths = nextRows
      .map((row) => row.receipt_url)
      .filter((url) => url && !isFullUrl(url));

    if (receiptPaths.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from(receiptBucket)
        .createSignedUrls(receiptPaths, 60 * 60);

      receiptPaths.forEach((path, index) => {
        const target = nextRows.find((row) => row.receipt_url === path);

        if (target && signedUrls?.[index]?.signedUrl) {
          target.receipt_url = signedUrls[index].signedUrl;
        }
      });
    }

    setRows(nextRows);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => isAdmin || row.requested_by === user.user_id)
      .filter((row) => !statusFilter || row.status === statusFilter)
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.request_date,
          row.account,
          row.expense_type,
          row.category,
          row.vendor ?? "",
          row.content,
          row.requested_name ?? "",
          row.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [isAdmin, rows, searchText, statusFilter, user.user_id]);

  const pendingCount = rows.filter((row) => row.status === "승인대기").length;
  const approvedTotal = visibleRows
    .filter((row) => row.status === "승인완료")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      requestDate: todayText(),
      account: "",
      expenseType: "변동비",
      category: "",
      vendor: "",
      amount: "",
      content: "",
      paymentMethod: "",
      memo: "",
    });
    setReceiptFile(null);
  };

  const uploadReceipt = async (requestId: number) => {
    if (!receiptFile) {
      throw new Error("영수증 사진을 첨부하세요.");
    }

    const extension = receiptFile.name.split(".").pop() || "jpg";
    const filePath = `${requestId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from(receiptBucket)
      .upload(filePath, receiptFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    return filePath;
  };

  const handleSubmit = async () => {
    const amount = Number(form.amount.replaceAll(",", "") || 0);

    if (!form.requestDate || !form.account || !form.expenseType || !form.category) {
      alert("사용일자, 계정, 구분, 분류를 입력하세요.");
      return;
    }

    if (!form.content || amount <= 0) {
      alert("내용과 금액을 입력하세요.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("expense_requests")
      .insert({
        request_date: form.requestDate,
        account: form.account,
        expense_type: form.expenseType,
        category: form.category,
        vendor: form.vendor,
        amount,
        content: form.content,
        payment_method: form.paymentMethod,
        receipt_url: "",
        memo: form.memo,
        status: "승인대기",
        requested_by: user.user_id,
        requested_name: formatRequesterName(user),
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      alert("지출결의서 신청 실패: " + (error?.message ?? "저장 오류"));
      return;
    }

    if (receiptFile) {
      try {
        const receiptUrl = await uploadReceipt(data.id);
        const { error: updateError } = await supabase
          .from("expense_requests")
          .update({ receipt_url: receiptUrl })
          .eq("id", data.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      } catch (uploadError) {
        setSaving(false);
        alert(
          "영수증 저장 실패: " +
            (uploadError instanceof Error ? uploadError.message : "업로드 오류")
        );
        return;
      }
    }

    setSaving(false);
    alert("지출결의서가 신청되었습니다.");
    resetForm();
    void loadRows();
  };

  const approveRequest = async (row: ExpenseRequest) => {
    if (!confirm("이 지출결의서를 승인하고 일일입출금에 반영할까요?")) {
      return;
    }

    const sourceName = `expense-request-${row.id}`;

    const { error: cashError } = await supabase.from("daily_cash").insert({
      date: row.request_date,
      account: row.account,
      type: row.expense_type,
      category: row.category,
      content: row.vendor ? `${row.vendor} - ${row.content}` : row.content,
      income: 0,
      expense: Number(row.amount || 0),
      memo: row.memo,
      source_type: "expense_request",
      source_work_name: sourceName,
    });

    if (cashError) {
      alert("일일입출금 반영 실패: " + cashError.message);
      return;
    }

    const { error } = await supabase
      .from("expense_requests")
      .update({
        status: "승인완료",
        approved_by: user.user_id,
        approved_name: user.user_name,
        approved_at: new Date().toISOString(),
        reject_reason: null,
      })
      .eq("id", row.id);

    if (error) {
      alert("승인 처리 실패: " + error.message);
      return;
    }

    alert("승인되었습니다.");
    void loadRows();
  };

  const rejectRequest = async (row: ExpenseRequest) => {
    const reason = prompt("반려 사유를 입력하세요.");

    if (reason === null) {
      return;
    }

    const { error } = await supabase
      .from("expense_requests")
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
          <h3 className="text-2xl font-bold">지출결의서</h3>
          <p className="text-sm text-slate-600">
            직원이 영수증을 첨부해 신청하고, 관리자가 승인하는 화면입니다.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Badge label="승인대기" value={pendingCount} tone="orange" />
          <Badge label="승인합계" value={`₩ ${approvedTotal.toLocaleString()}`} tone="blue" />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-4 font-bold text-slate-900">신청 작성</h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="사용일자">
            <input
              type="date"
              className={inputClass}
              value={form.requestDate}
              onChange={(event) => handleChange("requestDate", event.target.value)}
            />
          </Field>

          <Field label="계정">
            <select
              className={inputClass}
              value={form.account}
              onChange={(event) => handleChange("account", event.target.value)}
            >
              <option value="">선택</option>
              <option>국민은행</option>
              <option>부산은행</option>
              <option>법인1층</option>
              <option>현금</option>
              <option>카드</option>
              <option>BLUE</option>
            </select>
          </Field>

          <Field label="구분">
            <select
              className={inputClass}
              value={form.expenseType}
              onChange={(event) => {
                handleChange("expenseType", event.target.value);
                handleChange("category", "");
              }}
            >
              <option>고정비</option>
              <option>변동비</option>
            </select>
          </Field>

          <Field label="분류">
            <select
              className={inputClass}
              value={form.category}
              onChange={(event) => handleChange("category", event.target.value)}
            >
              <option value="">선택</option>
              {(categoryOptions[form.expenseType] || []).map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="사용처">
            <input
              className={inputClass}
              placeholder="예: 부품상사"
              value={form.vendor}
              onChange={(event) => handleChange("vendor", event.target.value)}
            />
          </Field>

          <Field label="금액">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="0"
              value={form.amount}
              onChange={(event) => {
                const rawValue = event.target.value.replaceAll(",", "");

                if (!/^\d*$/.test(rawValue)) {
                  return;
                }

                handleChange(
                  "amount",
                  rawValue ? Number(rawValue).toLocaleString() : ""
                );
              }}
            />
          </Field>

          <Field label="결제수단">
            <input
              className={inputClass}
              placeholder="예: 카드 / 현금 / 계좌"
              value={form.paymentMethod}
              onChange={(event) =>
                handleChange("paymentMethod", event.target.value)
              }
            />
          </Field>

          <Field label="영수증 사진">
            <input
              className={inputClass}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="내용">
            <input
              className={inputClass}
              placeholder="지출 내용을 입력하세요"
              value={form.content}
              onChange={(event) => handleChange("content", event.target.value)}
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
            {isAdmin ? "지출결의서 목록" : "내 신청 목록"}
          </h4>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">전체 상태</option>
              <option>승인대기</option>
              <option>승인완료</option>
              <option>반려</option>
            </select>

            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="사용처 / 내용 / 작성자 검색"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <ExpenseTable
            rows={visibleRows}
            isAdmin={isAdmin}
            onApprove={approveRequest}
            onReject={rejectRequest}
            onPrint={(row) =>
              onSelectMenu({
                id: "documents-expense-request-print",
                title: "지출결의서 출력",
                data: { expenseRequest: row },
              })
            }
          />
        </div>

        <MobileExpenseCards
          rows={visibleRows}
          isAdmin={isAdmin}
          onApprove={approveRequest}
          onReject={rejectRequest}
          onPrint={(row) =>
            onSelectMenu({
              id: "documents-expense-request-print",
              title: "지출결의서 출력",
              data: { expenseRequest: row },
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

function StatusBadge({ status }: { status: ExpenseRequest["status"] }) {
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

function ExpenseTable({
  rows,
  isAdmin,
  onApprove,
  onReject,
  onPrint,
}: {
  rows: ExpenseRequest[];
  isAdmin: boolean;
  onApprove: (row: ExpenseRequest) => void;
  onReject: (row: ExpenseRequest) => void;
  onPrint: (row: ExpenseRequest) => void;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-slate-100 text-left text-slate-700">
          <th className="border border-slate-200 px-3 py-2">상태</th>
          <th className="border border-slate-200 px-3 py-2">작성자</th>
          <th className="border border-slate-200 px-3 py-2">사용일자</th>
          <th className="border border-slate-200 px-3 py-2">계정</th>
          <th className="border border-slate-200 px-3 py-2">분류</th>
          <th className="border border-slate-200 px-3 py-2">사용처/내용</th>
          <th className="border border-slate-200 px-3 py-2 text-right">금액</th>
          <th className="border border-slate-200 px-3 py-2 text-center">영수증</th>
          <th className="border border-slate-200 px-3 py-2 text-center">출력</th>
          {isAdmin && (
            <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
          )}
        </tr>
      </thead>

      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={isAdmin ? 10 : 9}
              className="border border-slate-200 px-3 py-8 text-center text-slate-500"
            >
              등록된 지출결의서가 없습니다.
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
              <td className="border border-slate-200 px-3 py-2">
                {row.request_date}
              </td>
              <td className="border border-slate-200 px-3 py-2">{row.account}</td>
              <td className="border border-slate-200 px-3 py-2">
                {row.expense_type} / {row.category}
              </td>
              <td className="border border-slate-200 px-3 py-2">
                <div className="font-semibold">{row.vendor ?? "-"}</div>
                <div className="text-xs text-slate-500">{row.content}</div>
              </td>
              <td className="border border-slate-200 px-3 py-2 text-right font-semibold">
                ₩ {Number(row.amount || 0).toLocaleString()}
              </td>
              <td className="border border-slate-200 px-3 py-2 text-center">
            {row.receipt_url ? (
              <a
                href={row.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                보기
              </a>
            ) : (
              <span className="text-xs text-slate-400">없음</span>
            )}
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
              {isAdmin && (
                <td className="border border-slate-200 px-3 py-2 text-center">
                  {row.status === "승인대기" ? (
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
                    <span className="text-xs text-slate-400">
                      {row.approved_name ?? "-"}
                    </span>
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

function MobileExpenseCards({
  rows,
  isAdmin,
  onApprove,
  onReject,
  onPrint,
}: {
  rows: ExpenseRequest[];
  isAdmin: boolean;
  onApprove: (row: ExpenseRequest) => void;
  onReject: (row: ExpenseRequest) => void;
  onPrint: (row: ExpenseRequest) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          등록된 지출결의서가 없습니다.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <StatusBadge status={row.status} />
                <div className="mt-2 text-lg font-bold">
                  ₩ {Number(row.amount || 0).toLocaleString()}
                </div>
                <div className="text-sm text-slate-500">
                  {row.request_date} / {row.requested_name ?? row.requested_by}
                </div>
              </div>
              {row.receipt_url ? (
                <a
                  href={row.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  영수증
                </a>
              ) : (
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400">
                  영수증 없음
                </span>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-bold">{row.vendor ?? "-"}</div>
              <div className="mt-1 text-slate-600">{row.content}</div>
              <div className="mt-2 text-xs text-slate-500">
                {row.account} / {row.expense_type} / {row.category}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onPrint(row)}
              className="mt-3 w-full rounded-lg border border-blue-300 py-2 text-sm font-semibold text-blue-600"
            >
              출력
            </button>

            {isAdmin && row.status === "승인대기" && (
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
