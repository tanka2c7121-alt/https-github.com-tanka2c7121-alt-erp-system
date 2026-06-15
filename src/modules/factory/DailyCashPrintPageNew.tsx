"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type DailyCashRow = {
  id?: number;
  date: string;
  created_on?: string | null;
  account: string;
  type: string;
  category: string | null;
  content: string | null;
  income: number;
  expense: number;
  memo: string | null;
};

type DailyCashPrintPageNewProps = {
  user: {
    user_id: string;
    user_name: string;
  };
};

const firstPageRows = 34;
const nextPageRows = 41;
const emptyRow: DailyCashRow = {
  date: "",
  account: "",
  type: "",
  category: "",
  content: "",
  income: 0,
  expense: 0,
  memo: "",
};

const formatWon = (amount: number) => amount.toLocaleString();
const formatPrintAccount = (account: string) =>
  account.toUpperCase() === "BLUE POINT" ? "BLUE" : account.slice(0, 4);

function buildPages(rows: DailyCashRow[]) {
  const sourceRows = rows.length > 0 ? rows : [];
  const pages: DailyCashRow[][] = [];
  let cursor = 0;

  pages.push(sourceRows.slice(cursor, cursor + firstPageRows));
  cursor += firstPageRows;

  while (cursor < sourceRows.length) {
    pages.push(sourceRows.slice(cursor, cursor + nextPageRows));
    cursor += nextPageRows;
  }

  return pages;
}

function fillRows(rows: DailyCashRow[], count: number) {
  return [
    ...rows,
    ...Array.from({ length: Math.max(0, count - rows.length) }, () => emptyRow),
  ];
}

export default function DailyCashPrintPageNew({
  user,
}: DailyCashPrintPageNewProps) {
  const [printDate, setPrintDate] = useState(localDateText());
  const [rows, setRows] = useState<DailyCashRow[]>([]);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  const fetchRows = useCallback(async (dateValue = printDate) => {
    const { data, error } = await supabase
      .from("daily_cash")
      .select("*")
      .eq("created_on", dateValue)
      .order("id", { ascending: true });

    if (error) {
      alert("출력 데이터 조회 실패: " + error.message);
      return;
    }

    setRows((data ?? []) as DailyCashRow[]);
  }, [printDate]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    document.body.classList.add("daily-cash-v2-mode");
    const root = document.createElement("div");
    root.className = "daily-cash-v2-portal";
    document.body.appendChild(root);
    setPortalRoot(root);

    return () => {
      document.body.classList.remove("daily-cash-v2-mode");
      root.remove();
    };
  }, []);

  const pages = useMemo(() => buildPages(rows), [rows]);
  const totalIncome = rows.reduce((sum, row) => sum + Number(row.income || 0), 0);
  const totalExpense = rows.reduce((sum, row) => sum + Number(row.expense || 0), 0);
  const printableSheets = (
    <div className="daily-cash-v2-root print:bg-white">
      {pages.map((pageRows, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const rowsWithBlanks = fillRows(
          pageRows,
          isFirstPage ? firstPageRows : nextPageRows
        );

        return (
          <section
            key={pageIndex}
            className={`daily-cash-v2-sheet mx-auto mb-6 h-[282mm] w-[198mm] bg-white px-[7mm] pb-[2mm] pt-[12mm] text-slate-900 shadow-lg ${
              isFirstPage ? "" : "daily-cash-v2-sheet-next"
            }`}
          >
            <div className="daily-cash-v2-content h-full">
              {isFirstPage ? (
                <FirstPageHeader
                  pageCount={pages.length}
                  printDate={printDate}
                  totalExpense={totalExpense}
                  totalIncome={totalIncome}
                  userName={user.user_name || user.user_id}
                />
              ) : (
                <div className="mb-2 text-right text-xs font-semibold text-slate-600">
                  {pageIndex + 1} / {pages.length}
                </div>
              )}

              <DailyCashTable rows={rowsWithBlanks} />
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-200 p-6 text-slate-900 print:bg-white print:p-0">
      <style>
        {`
          .daily-cash-v2-portal {
            display: none;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }

            html,
            body.daily-cash-v2-mode {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
            }

            body.daily-cash-v2-mode * {
              visibility: hidden !important;
            }

            body.daily-cash-v2-mode > :not(.daily-cash-v2-portal) {
              display: none !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-portal,
            body.daily-cash-v2-mode .daily-cash-v2-portal * {
              visibility: visible !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-portal {
              position: static !important;
              left: 0 !important;
              top: 0 !important;
              display: block !important;
              width: 198mm !important;
              min-height: auto !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
            }

            body.daily-cash-v2-mode .screen-preview {
              display: none !important;
              visibility: hidden !important;
            }

            body.daily-cash-v2-mode .no-print {
              display: none !important;
              visibility: hidden !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-sheet {
              width: 198mm !important;
              height: 282mm !important;
              min-height: 282mm !important;
              margin: 0 auto !important;
              padding: 12mm 7mm 2mm !important;
              box-sizing: border-box !important;
              overflow: visible !important;
              box-shadow: none !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-sheet:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-content {
              height: 268mm !important;
              min-height: 268mm !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-sheet-next {
              padding-top: 0 !important;
              padding-bottom: 0 !important;
            }

            body.daily-cash-v2-mode .daily-cash-v2-sheet-next {
              padding: 12mm 7mm 2mm !important;
            }
          }
        `}
      </style>

      <div className="no-print mx-auto mb-4 flex max-w-[198mm] items-center justify-end gap-2">
        <input
          type="date"
          value={printDate}
          onChange={(event) => {
            setPrintDate(event.target.value);
            void fetchRows(event.target.value);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          인쇄
        </button>
      </div>

      <div className="screen-preview">{printableSheets}</div>
      {portalRoot ? createPortal(printableSheets, portalRoot) : null}
    </div>
  );
}

function FirstPageHeader({
  pageCount,
  printDate,
  totalExpense,
  totalIncome,
  userName,
}: {
  pageCount: number;
  printDate: string;
  totalExpense: number;
  totalIncome: number;
  userName: string;
}) {
  return (
    <>
      <div className="relative mb-3 text-center">
        <h1 className="text-3xl font-bold tracking-widest">일일입출금내역</h1>
        <p className="mt-1 text-sm font-semibold">신흥현대서비스 ERP</p>
        <p className="absolute right-0 top-1 text-xs font-semibold text-slate-600">
          1 / {pageCount}
        </p>
      </div>

      <table className="mb-4 w-full border-collapse text-[13px] font-semibold">
        <tbody>
          <tr>
            <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-2">
              입력일자
            </th>
            <td className="border border-slate-900 px-2 py-2">{printDate}</td>
            <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-2">
              입금합계
            </th>
            <td className="border border-slate-900 px-2 py-2 text-right font-bold text-blue-700">
              {formatWon(totalIncome)}
            </td>
            <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-2">
              출금합계
            </th>
            <td className="border border-slate-900 px-2 py-2 text-right font-bold text-red-700">
              {formatWon(totalExpense)}
            </td>
          </tr>
          <tr>
            <th className="border border-slate-900 bg-slate-50 px-2 py-2">
              작성자
            </th>
            <td className="border border-slate-900 px-2 py-2" colSpan={2}>
              {userName}
            </td>
            <th className="border border-slate-900 bg-slate-50 px-2 py-2">
              비고
            </th>
            <td className="border border-slate-900 px-2 py-2" colSpan={2}>
              일일 정산
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function DailyCashTable({ rows }: { rows: DailyCashRow[] }) {
  return (
    <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
      <colgroup>
        <col className="w-[18mm]" />
        <col className="w-[16mm]" />
        <col className="w-[10mm]" />
        <col className="w-[15mm]" />
        <col />
        <col className="w-[22mm]" />
        <col className="w-[22mm]" />
        <col className="w-[18mm]" />
      </colgroup>
      <thead className="text-center">
        <tr className="bg-slate-50">
          <th className="border border-slate-900 px-1 py-2">거래일자</th>
          <th className="border border-slate-900 px-1 py-2">계정</th>
          <th className="border border-slate-900 px-1 py-2">구분</th>
          <th className="border border-slate-900 px-1 py-2">분류</th>
          <th className="border border-slate-900 px-2 py-2">내용</th>
          <th className="border border-slate-900 px-1 py-2">입금</th>
          <th className="border border-slate-900 px-1 py-2">출금</th>
          <th className="border border-slate-900 px-1 py-2">비고</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.id ?? "empty"}-${index}`} className="h-[6.15mm]">
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-center">
              {row.date || "\u00A0"}
            </td>
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-center">
              {row.account ? formatPrintAccount(row.account) : "\u00A0"}
            </td>
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-center">
              {row.type || "\u00A0"}
            </td>
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-center">
              {row.category || "\u00A0"}
            </td>
            <td className="overflow-hidden whitespace-nowrap border border-slate-900 px-1 py-1 text-center text-[10px]">
              {row.content || "\u00A0"}
            </td>
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-right font-semibold text-blue-700">
              {row.income ? formatWon(row.income) : "\u00A0"}
            </td>
            <td className="whitespace-nowrap border border-slate-900 px-1 py-1 text-right font-semibold text-red-700">
              {row.expense ? formatWon(row.expense) : "\u00A0"}
            </td>
            <td className="overflow-hidden whitespace-nowrap border border-slate-900 px-1 py-1 text-center text-[10px]">
              {row.memo || "\u00A0"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
