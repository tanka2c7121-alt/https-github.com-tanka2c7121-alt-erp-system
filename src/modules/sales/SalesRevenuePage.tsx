"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type SalesRevenuePageProps = {
  kind: "insurance" | "card";
  title: string;
};

type SettlementPaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
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
};

type RevenueRow = {
  id: string;
  date: string;
  workName: string;
  insuranceCompany: string;
  saleType: string;
  coverageType: string;
  carNumber: string;
  carModel: string;
  paymentInfo: string;
  paymentAmount: number;
  supplyAmount: number;
  vatAmount: number;
  content: string;
};

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);

const bankNames = ["국민은행", "부산은행"];
const formatWon = (amount: number) => amount.toLocaleString();
const includesText = (value: string | null | undefined, keyword: string) =>
  (value ?? "").includes(keyword);

export default function SalesRevenuePage({
  kind,
  title,
}: SalesRevenuePageProps) {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const dateRange = useMemo(() => {
    const startDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-01`
      : `${selectedYear}-01-01`;
    const endDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-${String(
          new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
        ).padStart(2, "0")}`
      : `${selectedYear}-12-31`;

    return { startDate, endDate };
  }, [selectedMonth, selectedYear]);

  const loadWorkMap = useCallback(async (workNames: string[]) => {
    if (workNames.length === 0) return new Map<string, WorkOrderRow>();

    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "work_name,car_number,car_model,category,insurance_company,other_insurance_company,coverage_type"
      )
      .in("work_name", workNames);

    if (error) {
      throw new Error(`차량정보 조회 실패: ${error.message}`);
    }

    return new Map(
      ((data ?? []) as WorkOrderRow[]).map((work) => [work.work_name, work])
    );
  }, []);

  const loadInsuranceRows = useCallback(async () => {
    const { startDate, endDate } = dateRange;
    const { data, error } = await supabase
      .from("settlement_payments")
      .select(
        "id,work_name,payment_type,payment_detail,payment_amount,payment_date,payment_method"
      )
      .not("payment_date", "is", null)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new Error(`보험매출 조회 실패: ${error.message}`);
    }

    const paymentRows = ((data ?? []) as SettlementPaymentRow[]).filter(
      (row) => {
        const amount = Number(row.payment_amount ?? 0);
        const method = row.payment_method ?? "";
        const isBank = bankNames.some((bankName) => method.includes(bankName));

        return amount > 0 && isBank;
      }
    );

    const workNames = Array.from(
      new Set(
        paymentRows
          .map((row) => row.work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );
    const workMap = await loadWorkMap(workNames);
    const groupedRows = new Map<string, RevenueRow>();

    paymentRows.forEach((paymentRow) => {
      const workName = paymentRow.work_name ?? "";
      const work = workMap.get(workName);
      const insuranceCompany =
        work?.insurance_company ?? work?.other_insurance_company ?? "";
      const isInsurance =
        includesText(paymentRow.payment_detail, "보험") ||
        work?.category === "보험" ||
        Boolean(insuranceCompany);

      if (!isInsurance) return;

      const paymentAmount = Number(paymentRow.payment_amount ?? 0);
      const paymentType = paymentRow.payment_type ?? "";
      const key = [
        paymentRow.payment_date ?? "",
        workName,
        paymentRow.payment_method ?? "",
      ].join("__");
      const current =
        groupedRows.get(key) ??
        ({
          id: key,
          date: paymentRow.payment_date ?? "",
          workName,
          insuranceCompany,
          saleType: work?.category ?? paymentRow.payment_detail ?? "",
          coverageType: work?.coverage_type ?? "",
          carNumber: work?.car_number ?? "",
          carModel: work?.car_model ?? "",
          paymentInfo: paymentRow.payment_method ?? "",
          paymentAmount: 0,
          supplyAmount: 0,
          vatAmount: 0,
          content: paymentRow.payment_detail ?? "",
        } satisfies RevenueRow);

      current.paymentAmount += paymentAmount;

      if (paymentType.includes("부가세")) {
        current.vatAmount += paymentAmount;
      } else {
        current.supplyAmount += paymentAmount;
      }

      groupedRows.set(key, current);
    });

    return Array.from(groupedRows.values()).sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }, [dateRange, loadWorkMap]);

  const loadCardRows = useCallback(async () => {
    const { startDate, endDate } = dateRange;
    const { data, error } = await supabase
      .from("daily_cash")
      .select(
        "id,date,account,type,category,content,income,memo,source_work_name"
      )
      .eq("type", "수입")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new Error(`카드매출 조회 실패: ${error.message}`);
    }

    const cashRows = ((data ?? []) as DailyCashRow[]).filter((row) => {
      const text = [row.account, row.category, row.content].join(" ");
      return Number(row.income ?? 0) > 0 && text.includes("카드");
    });
    const workNames = Array.from(
      new Set(
        cashRows
          .map((row) => row.source_work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );
    const workMap = await loadWorkMap(workNames);

    return cashRows.map((row) => {
      const workName = row.source_work_name ?? "";
      const work = workMap.get(workName);
      const paymentAmount = Number(row.income ?? 0);

      return {
        id: String(row.id),
        date: row.date ?? "",
        workName,
        insuranceCompany:
          work?.insurance_company ?? work?.other_insurance_company ?? "",
        saleType: row.category ?? "",
        coverageType: work?.coverage_type ?? "",
        carNumber: work?.car_number ?? "",
        carModel: work?.car_model ?? "",
        paymentInfo: row.account ?? "",
        paymentAmount,
        supplyAmount: paymentAmount,
        vatAmount: 0,
        content: row.content ?? "",
      };
    });
  }, [dateRange, loadWorkMap]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const nextRows =
        kind === "insurance" ? await loadInsuranceRows() : await loadCardRows();
      setRows(nextRows);
    } catch (error) {
      alert(error instanceof Error ? error.message : `${title} 조회 실패`);
    } finally {
      setIsLoading(false);
    }
  }, [kind, loadCardRows, loadInsuranceRows, title]);

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
        row.insuranceCompany,
        row.saleType,
        row.coverageType,
        row.carNumber,
        row.carModel,
        row.paymentInfo,
        row.content,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, searchText]);

  const totalPayment = filteredRows.reduce(
    (sum, row) => sum + row.paymentAmount,
    0
  );
  const totalSupply = filteredRows.reduce(
    (sum, row) => sum + row.supplyAmount,
    0
  );
  const totalVat = filteredRows.reduce((sum, row) => sum + row.vatAmount, 0);

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
        <SummaryCard label="총 건수" value={`${filteredRows.length.toLocaleString()}건`} />
        <SummaryCard label="결제금액 합계" value={`${formatWon(totalPayment)}원`} />
        <SummaryCard
          label="공급가 / 부가세"
          value={`${formatWon(totalSupply)}원 / ${formatWon(totalVat)}원`}
        />
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
            placeholder="작명, 차량번호, 보험사 검색"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <RevenueTable
          rows={filteredRows}
          isLoading={isLoading}
          totalPayment={totalPayment}
          totalSupply={totalSupply}
          totalVat={totalVat}
        />
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
            <span>결제금액 {formatWon(totalPayment)}원</span>
          </div>

          <RevenueTable
            rows={filteredRows}
            isLoading={false}
            totalPayment={totalPayment}
            totalSupply={totalSupply}
            totalVat={totalVat}
            printMode
          />
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-xl font-bold text-blue-700">{value}</p>
    </div>
  );
}

function RevenueTable({
  rows,
  isLoading,
  totalPayment,
  totalSupply,
  totalVat,
  printMode = false,
}: {
  rows: RevenueRow[];
  isLoading: boolean;
  totalPayment: number;
  totalSupply: number;
  totalVat: number;
  printMode?: boolean;
}) {
  const tableClassName = printMode
    ? "w-full border-collapse text-[9px]"
    : "min-w-[1120px] w-full border-collapse text-sm";
  const cellClassName = printMode
    ? "border border-slate-400 px-1 py-1"
    : "border px-2 py-2";

  return (
    <div className={printMode ? "" : "overflow-x-auto"}>
      <table className={tableClassName}>
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className={cellClassName}>입금일</th>
            <th className={cellClassName}>작명</th>
            <th className={cellClassName}>보험사</th>
            <th className={cellClassName}>구분</th>
            <th className={cellClassName}>담보</th>
            <th className={cellClassName}>차량번호</th>
            <th className={cellClassName}>차량명</th>
            <th className={cellClassName}>입금정보</th>
            <th className={`${cellClassName} text-right`}>결제금액</th>
            <th className={`${cellClassName} text-right`}>공급가</th>
            <th className={`${cellClassName} text-right`}>부가세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={printMode ? "" : "hover:bg-slate-50"}>
              <td className={`${cellClassName} text-center`}>{row.date}</td>
              <td className={`${cellClassName} font-semibold`}>{row.workName}</td>
              <td className={cellClassName}>{row.insuranceCompany}</td>
              <td className={cellClassName}>{row.saleType}</td>
              <td className={cellClassName}>{row.coverageType}</td>
              <td className={cellClassName}>{row.carNumber}</td>
              <td className={cellClassName}>{row.carModel}</td>
              <td className={cellClassName}>{row.paymentInfo}</td>
              <td className={`${cellClassName} text-right font-semibold`}>
                {formatWon(row.paymentAmount)}
              </td>
              <td className={`${cellClassName} text-right`}>
                {formatWon(row.supplyAmount)}
              </td>
              <td className={`${cellClassName} text-right`}>
                {formatWon(row.vatAmount)}
              </td>
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td
                className={`${cellClassName} py-8 text-center text-slate-500`}
                colSpan={11}
              >
                {isLoading ? "조회 중입니다." : "조회된 내역이 없습니다."}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-blue-50 font-bold text-blue-900">
            <td className={`${cellClassName} text-right`} colSpan={8}>
              합계
            </td>
            <td className={`${cellClassName} text-right`}>
              {formatWon(totalPayment)}
            </td>
            <td className={`${cellClassName} text-right`}>
              {formatWon(totalSupply)}
            </td>
            <td className={`${cellClassName} text-right`}>
              {formatWon(totalVat)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
