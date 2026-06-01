"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type SalesRevenuePageProps = {
  kind: "insurance" | "card";
  title: string;
};

type DailyCashRow = {
  id: number;
  date: string;
  account: string | null;
  type: string | null;
  category: string | null;
  content: string | null;
  income: number | null;
  memo: string | null;
  source_work_name: string | null;
};

type WorkOrderRow = {
  work_name: string;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  coverage_type: string | null;
  manager_name: string | null;
  own_manager_name: string | null;
  other_manager_name: string | null;
};

type RevenueRow = {
  id: number;
  date: string;
  workName: string;
  carNumber: string;
  carModel: string;
  insuranceCompany: string;
  coverageType: string;
  managerName: string;
  account: string;
  category: string;
  content: string;
  income: number;
  memo: string;
};

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);

const formatWon = (amount: number) => amount.toLocaleString();

export default function SalesRevenuePage({
  kind,
  title,
}: SalesRevenuePageProps) {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    const startDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-01`
      : `${selectedYear}-01-01`;
    const endDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-${String(
          new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
        ).padStart(2, "0")}`
      : `${selectedYear}-12-31`;

    const { data: cashData, error: cashError } = await supabase
      .from("daily_cash")
      .select(
        "id,date,account,type,category,content,income,memo,source_work_name"
      )
      .eq("type", "수입")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (cashError) {
      setIsLoading(false);
      alert(`${title} 조회 실패: ${cashError.message}`);
      return;
    }

    const cashRows = ((cashData ?? []) as DailyCashRow[]).filter(
      (row) => Number(row.income ?? 0) > 0
    );

    const workNames = Array.from(
      new Set(
        cashRows
          .map((row) => row.source_work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );

    let workMap = new Map<string, WorkOrderRow>();

    if (workNames.length > 0) {
      const { data: workData, error: workError } = await supabase
        .from("work_orders")
        .select(
          "work_name,car_number,car_model,category,insurance_company,other_insurance_company,coverage_type,manager_name,own_manager_name,other_manager_name"
        )
        .in("work_name", workNames);

      if (workError) {
        setIsLoading(false);
        alert(`차량정보 조회 실패: ${workError.message}`);
        return;
      }

      workMap = new Map(
        ((workData ?? []) as WorkOrderRow[]).map((work) => [
          work.work_name,
          work,
        ])
      );
    }

    const nextRows = cashRows
      .map((cashRow) => {
        const work = cashRow.source_work_name
          ? workMap.get(cashRow.source_work_name)
          : undefined;
        const text = [
          cashRow.account,
          cashRow.category,
          cashRow.content,
          work?.category,
          work?.insurance_company,
          work?.other_insurance_company,
        ]
          .join(" ")
          .toLowerCase();
        const isCardSale = text.includes("카드");
        const isInsuranceSale =
          !isCardSale &&
          (text.includes("보험") ||
            work?.category === "보험" ||
            Boolean(work?.insurance_company || work?.other_insurance_company));

        if (kind === "card" && !isCardSale) return null;
        if (kind === "insurance" && !isInsuranceSale) return null;

        return {
          id: cashRow.id,
          date: cashRow.date ?? "",
          workName: cashRow.source_work_name ?? "",
          carNumber: work?.car_number ?? "",
          carModel: work?.car_model ?? "",
          insuranceCompany:
            work?.insurance_company ?? work?.other_insurance_company ?? "",
          coverageType: work?.coverage_type ?? "",
          managerName:
            work?.manager_name ??
            work?.own_manager_name ??
            work?.other_manager_name ??
            "",
          account: cashRow.account ?? "",
          category: cashRow.category ?? "",
          content: cashRow.content ?? "",
          income: Number(cashRow.income ?? 0),
          memo: cashRow.memo ?? "",
        };
      })
      .filter((row): row is RevenueRow => Boolean(row));

    setRows(nextRows);
    setIsLoading(false);
  }, [kind, selectedMonth, selectedYear, title]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return rows;

    return rows.filter((row) =>
      [
        row.date,
        row.workName,
        row.carNumber,
        row.carModel,
        row.insuranceCompany,
        row.coverageType,
        row.managerName,
        row.account,
        row.category,
        row.content,
        row.memo,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, searchText]);

  const totalAmount = filteredRows.reduce((sum, row) => sum + row.income, 0);

  const yearOptions = useMemo(() => {
    const baseYear = Number(currentYear);
    return Array.from({ length: 5 }, (_, index) => String(baseYear - 2 + index))
      .sort((a, b) => b.localeCompare(a));
  }, []);

  return (
    <div className="space-y-5 text-slate-900">
      <div className="no-print flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xl font-bold md:text-2xl">{title}</h3>
          <p className="text-sm text-slate-700">
            입금일 기준으로 확인하는 {title} 내역입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          출력
        </button>
      </div>

      <div className="no-print grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-600">총 건수</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {filteredRows.length.toLocaleString()}건
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-600">매출 합계</p>
          <p className="mt-2 text-2xl font-bold text-blue-700">
            {formatWon(totalAmount)}원
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-600">조회 기준</p>
          <p className="mt-2 text-lg font-bold text-slate-900">
            {selectedYear}년 {selectedMonth ? `${Number(selectedMonth)}월` : "전체"}
          </p>
        </div>
      </div>

      <div className="no-print rounded-xl border border-slate-200 bg-white p-3 md:p-4">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              <option value="">전체 월</option>
              {Array.from({ length: 12 }, (_, index) => {
                const month = String(index + 1).padStart(2, "0");

                return (
                  <option key={month} value={month}>
                    {index + 1}월
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => void loadRows()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              새로고침
            </button>
          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:w-80"
            placeholder="작명, 차량번호, 보험사, 내용 검색"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border px-2 py-2">입금일</th>
                <th className="border px-2 py-2">작명</th>
                <th className="border px-2 py-2">차량번호</th>
                <th className="border px-2 py-2">차량명</th>
                <th className="border px-2 py-2">
                  {kind === "card" ? "보험사/거래처" : "보험사"}
                </th>
                <th className="border px-2 py-2">담보</th>
                <th className="border px-2 py-2">담당자</th>
                <th className="border px-2 py-2">입금구분</th>
                <th className="border px-2 py-2 text-right">입금액</th>
                <th className="border px-2 py-2">내용</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border px-2 py-2 text-center">{row.date}</td>
                  <td className="border px-2 py-2 font-semibold">{row.workName}</td>
                  <td className="border px-2 py-2">{row.carNumber}</td>
                  <td className="border px-2 py-2">{row.carModel}</td>
                  <td className="border px-2 py-2">{row.insuranceCompany}</td>
                  <td className="border px-2 py-2">{row.coverageType}</td>
                  <td className="border px-2 py-2">{row.managerName}</td>
                  <td className="border px-2 py-2">{row.account || row.category}</td>
                  <td className="border px-2 py-2 text-right font-semibold">
                    {formatWon(row.income)}
                  </td>
                  <td className="border px-2 py-2">{row.content}</td>
                </tr>
              ))}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    className="border px-3 py-8 text-center text-slate-500"
                    colSpan={10}
                  >
                    {isLoading ? "조회 중입니다." : "조회된 내역이 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 font-bold text-blue-900">
                <td className="border px-2 py-2 text-right" colSpan={8}>
                  합계
                </td>
                <td className="border px-2 py-2 text-right">
                  {formatWon(totalAmount)}
                </td>
                <td className="border px-2 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <section className="print-only mx-auto bg-white text-black">
        <div className="mx-auto min-h-[275mm] w-[190mm] p-[7mm]">
          <div className="mb-4 text-center">
            <h1 className="text-2xl font-bold">{title} 내역</h1>
            <p className="mt-2 text-sm">
              조회기간: {selectedYear}년{" "}
              {selectedMonth ? `${Number(selectedMonth)}월` : "전체"}
            </p>
          </div>

          <div className="mb-3 flex justify-between text-sm font-semibold">
            <span>총 {filteredRows.length.toLocaleString()}건</span>
            <span>합계 {formatWon(totalAmount)}원</span>
          </div>

          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 px-1 py-1">입금일</th>
                <th className="border border-slate-400 px-1 py-1">작명</th>
                <th className="border border-slate-400 px-1 py-1">차량번호</th>
                <th className="border border-slate-400 px-1 py-1">차량명</th>
                <th className="border border-slate-400 px-1 py-1">보험사</th>
                <th className="border border-slate-400 px-1 py-1">담당자</th>
                <th className="border border-slate-400 px-1 py-1">구분</th>
                <th className="border border-slate-400 px-1 py-1">입금액</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`print-${row.id}`}>
                  <td className="border border-slate-400 px-1 py-1">{row.date}</td>
                  <td className="border border-slate-400 px-1 py-1">{row.workName}</td>
                  <td className="border border-slate-400 px-1 py-1">{row.carNumber}</td>
                  <td className="border border-slate-400 px-1 py-1">{row.carModel}</td>
                  <td className="border border-slate-400 px-1 py-1">
                    {row.insuranceCompany}
                  </td>
                  <td className="border border-slate-400 px-1 py-1">{row.managerName}</td>
                  <td className="border border-slate-400 px-1 py-1">
                    {row.account || row.category}
                  </td>
                  <td className="border border-slate-400 px-1 py-1 text-right">
                    {formatWon(row.income)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
