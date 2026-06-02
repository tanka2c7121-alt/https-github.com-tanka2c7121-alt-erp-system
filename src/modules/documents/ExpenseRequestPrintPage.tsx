"use client";

import type { MenuItem } from "../../data/menuData";

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

type ExpenseRequestPrintPageProps = {
  expenseRequest?: ExpenseRequest;
  onSelectMenu: (menu: MenuItem) => void;
};

const formatWon = (amount?: number) =>
  `₩ ${Number(amount || 0).toLocaleString()}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return "";

  return value.slice(0, 16).replace("T", " ");
};

export default function ExpenseRequestPrintPage({
  expenseRequest,
  onSelectMenu,
}: ExpenseRequestPrintPageProps) {
  if (!expenseRequest) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        출력할 지출결의서가 선택되지 않았습니다.
      </div>
    );
  }

  return (
    <div className="print-area min-h-screen bg-slate-200 p-4 text-slate-900 print:bg-white print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            onSelectMenu({
              id: "documents-expense-request",
              title: "지출결의서",
            })
          }
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
          width: "190mm",
          minHeight: "275mm",
          padding: "7mm",
        }}
      >
        <header className="mb-6 grid grid-cols-[1fr_260px] gap-4">
          <div>
            <h1 className="text-center text-3xl font-bold tracking-[0.35em]">
              지출결의서
            </h1>
            <div className="mt-6 text-sm">
              <div>문서번호: EXP-{String(expenseRequest.id).padStart(6, "0")}</div>
              <div>작성일자: {expenseRequest.created_at?.slice(0, 10) ?? ""}</div>
            </div>
          </div>

          <table className="h-24 w-full border-collapse text-center text-sm">
            <tbody>
              <tr>
                <td className="w-16 border border-slate-900 font-bold" rowSpan={3}>
                  결재
                </td>
                <td className="border border-slate-900 font-bold">담당</td>
                <td className="border border-slate-900 font-bold">관리자</td>
              </tr>
              <tr>
                <td className="h-14 border border-slate-900">
                  {expenseRequest.requested_name ?? ""}
                </td>
                <td className="h-14 border border-slate-900">
                  {expenseRequest.approved_name ?? ""}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-900 text-xs">
                  신청
                </td>
                <td className="border border-slate-900 text-xs">
                  {expenseRequest.status}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <section className="mb-5">
          <table className="w-full border-collapse text-sm">
            <tbody>
              <PrintRow label="신청자" value={expenseRequest.requested_name ?? expenseRequest.requested_by} />
              <PrintRow label="사용일자" value={expenseRequest.request_date} />
              <PrintRow label="계정" value={expenseRequest.account} />
              <PrintRow label="구분" value={expenseRequest.expense_type} />
              <PrintRow label="분류" value={expenseRequest.category} />
              <PrintRow label="사용처" value={expenseRequest.vendor ?? ""} />
              <PrintRow label="결제수단" value={expenseRequest.payment_method ?? ""} />
              <PrintRow label="금액" value={formatWon(expenseRequest.amount)} strong />
              <PrintRow label="내용" value={expenseRequest.content} />
              <PrintRow label="비고" value={expenseRequest.memo ?? ""} />
              <PrintRow label="승인일시" value={formatDateTime(expenseRequest.approved_at)} />
              {expenseRequest.reject_reason && (
                <PrintRow label="반려사유" value={expenseRequest.reject_reason} />
              )}
            </tbody>
          </table>
        </section>

        <section>
          <div className="mb-2 border border-slate-900 bg-slate-100 px-3 py-2 text-sm font-bold">
            영수증 첨부
          </div>
          <div className="flex min-h-[360px] items-center justify-center border border-slate-900 p-4">
            {expenseRequest.receipt_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Print preview uses a user-uploaded receipt URL.
              <img
                src={expenseRequest.receipt_url}
                alt="영수증"
                className="max-h-[520px] max-w-full object-contain"
              />
            ) : (
              <div className="text-sm text-slate-500">
                첨부된 영수증이 없습니다.
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 text-center text-sm font-semibold">
          위와 같이 지출을 결의합니다.
        </footer>
      </article>
    </div>
  );
}

function PrintRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <th className="w-32 border border-slate-900 bg-slate-100 px-3 py-2 text-left">
        {label}
      </th>
      <td
        className={[
          "border border-slate-900 px-3 py-2",
          strong ? "text-lg font-bold" : "",
        ].join(" ")}
      >
        {value || "\u00A0"}
      </td>
    </tr>
  );
}
