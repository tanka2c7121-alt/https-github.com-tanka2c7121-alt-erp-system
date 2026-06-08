"use client";

import { useCallback, useEffect, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type DailyCashRow = {
  id: number;
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
const formatWon = (amount: number) => amount.toLocaleString();
const rowsPerPage = 32;

type DailyCashPrintPageProps = {
  user: {
    user_id: string;
    user_name: string;
  };
};

export default function DailyCashPrintPage({
  user,
}: DailyCashPrintPageProps) {

  const today = localDateText();

const [printDate, setPrintDate] =
  useState(today);

const [dailyCashList, setDailyCashList] =
  useState<DailyCashRow[]>([]);
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

  setDailyCashList(data ?? []);
}, [printDate]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);
  const totalIncome = dailyCashList.reduce((sum, item) => sum + Number(item.income || 0), 0);
  const totalExpense = dailyCashList.reduce((sum, item) => sum + Number(item.expense || 0), 0);
  const pageRows =
    dailyCashList.length === 0
      ? [[]]
      : Array.from(
          { length: Math.ceil(dailyCashList.length / rowsPerPage) },
          (_, pageIndex) =>
            dailyCashList.slice(
              pageIndex * rowsPerPage,
              pageIndex * rowsPerPage + rowsPerPage
            )
        );

  return (
    
    <div className="daily-cash-print-root min-h-screen bg-slate-200 p-6 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[190mm] items-center justify-end gap-2">
  <input
    type="date"
    value={printDate}
    onChange={(event) => {
      setPrintDate(event.target.value);
      fetchRows(event.target.value);
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

      {pageRows.map((rows, pageIndex) => {
        const rowsWithBlanks = [
          ...rows,
          ...Array.from({ length: Math.max(0, rowsPerPage - rows.length) }).map(() => ({
            date: "",
            account: "",
            type: "",
            category: "",
            content: "",
            income: 0,
            expense: 0,
            memo: "",
          })),
        ];

        return (
      <div
        key={pageIndex}
        className="daily-cash-print-page mx-auto mb-6 bg-white text-slate-900 shadow-lg print:m-0 print:shadow-none"
        style={{
          width: "180mm",
          minHeight: "270mm",
          padding: "6mm",
        }}
      
      >
       <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
  <div className="rounded-lg border border-slate-800 p-3">
    <div className="font-semibold text-slate-600">
      입금합계
    </div>

    <div className="mt-2 text-xl font-bold text-blue-600">
      {totalIncome.toLocaleString()} 원
    </div>
  </div>

  <div className="rounded-lg border border-slate-800 p-3">
    <div className="font-semibold text-slate-600">
      출금합계
    </div>

    <div className="mt-2 text-xl font-bold text-red-600">
      {totalExpense.toLocaleString()} 원
    </div>
  </div>

</div>
        <div className="border-2 border-slate-900 p-4">
          <div className="relative mb-4 text-center">
            <h1 className="text-2xl font-bold tracking-widest">
              일일입출금내역
            </h1>
            <p className="mt-1 text-xs font-semibold">신흥현대서비스 ERP</p>
            <p className="absolute right-0 top-1 text-xs font-semibold text-slate-600">
              {pageIndex + 1} / {pageRows.length}
            </p>
          </div>

          <table className="mb-5 w-full border-collapse text-[12px] font-semibold">
            <tbody>
              <tr>
                <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-1">입력일자</th>
                <td className="border border-slate-900 px-2 py-1">{printDate}</td>
                <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-1">입금합계</th>
                <td className="border border-slate-900 px-2 py-1 text-right">{formatWon(totalIncome)}</td>
                <th className="w-24 border border-slate-900 bg-slate-50 px-2 py-1">출금합계</th>
                <td className="border border-slate-900 px-2 py-1 text-right">{formatWon(totalExpense)}</td>
              </tr>

              <tr>
                <th className="border border-slate-900 bg-slate-50 px-2 py-1">작성자</th>
                <td className="border border-slate-900 px-2 py-1" colSpan={2}>
                  {user.user_name || user.user_id}
                </td>
                <th className="border border-slate-900 bg-slate-50 px-2 py-1">비고</th>
                <td className="border border-slate-900 px-2 py-1" colSpan={2}>일일 정산</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-[10px]">
            <thead className="text-center">
              <tr className="bg-slate-50">
                <th className="w-20 border border-slate-900 px-2 py-1">거래일자</th>
                <th className="w-16 border border-slate-900 px-2 py-1">계정</th>
                <th className="w-14 border border-slate-900 px-2 py-1">구분</th>
                <th className="w-20 border border-slate-900 px-2 py-1">분류</th>
                <th className="border border-slate-900 px-2 py-1">내용</th>
                <th className="w-20 border border-slate-900 px-2 py-1">입금</th>
                <th className="w-20 border border-slate-900 px-2 py-1">출금</th>
                <th className="w-24 border border-slate-900 px-2 py-1">비고</th>
              </tr>
            </thead>

            <tbody>
              {rowsWithBlanks.map((item, index) => (
                <tr key={index}>
                  <td className="border border-slate-900 px-1 py-[2px] text-center">{item.date || "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px] text-center">{item.account || "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px] text-center">{item.type || "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px]">{item.category || "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px]">{item.content || "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px] text-right">{item.income ? formatWon(item.income) : "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px] text-right">{item.expense ? formatWon(item.expense) : "\u00A0"}</td>
                  <td className="border border-slate-900 px-1 py-[2px]">{item.memo || "\u00A0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        );
      })}
    </div>
  );
}

