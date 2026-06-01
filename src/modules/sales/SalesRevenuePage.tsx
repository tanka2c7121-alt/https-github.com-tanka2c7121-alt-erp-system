"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type SalesRevenuePageProps = {
  kind: "insurance" | "card" | "general";
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
  approval_number: string | null;
  merchant_number: string | null;
  card_number: string | null;
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
  approvalNumber: string;
  merchantNumber: string;
  cardNumber: string;
};

type SortField =
  | "date"
  | "workName"
  | "insuranceCompany"
  | "saleType"
  | "coverageType"
  | "carNumber"
  | "carModel"
  | "paymentInfo"
  | "paymentAmount"
  | "supplyAmount"
  | "vatAmount"
  | "approvalNumber"
  | "merchantNumber"
  | "cardNumber";

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const bankNames = ["국민은행", "부산은행"];

const formatWon = (amount: number) => amount.toLocaleString();
const calculateSupplyAmount = (paymentAmount: number) =>
  Math.round(paymentAmount / 1.1);
const calculateVatAmount = (paymentAmount: number) =>
  paymentAmount - calculateSupplyAmount(paymentAmount);

export default function SalesRevenuePage({
  kind,
  title,
}: SalesRevenuePageProps) {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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

  const loadPaymentRows = useCallback(async () => {
    const { startDate, endDate } = dateRange;
    const { data, error } = await supabase
      .from("settlement_payments")
      .select(
        "id,work_name,payment_type,payment_detail,payment_amount,payment_date,payment_method,approval_number,merchant_number,card_number"
      )
      .not("payment_date", "is", null)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new Error(`${title} 조회 실패: ${error.message}`);
    }

    return (data ?? []) as SettlementPaymentRow[];
  }, [dateRange, title]);

  const loadInsuranceRows = useCallback(async () => {
    const paymentRows = (await loadPaymentRows()).filter((row) => {
      const amount = Number(row.payment_amount ?? 0);
      const method = row.payment_method ?? "";
      const isBank = bankNames.some((bankName) => method.includes(bankName));

      return amount > 0 && isBank;
    });

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
      const isInsurance = isInsurancePayment(paymentRow, work, insuranceCompany);

      if (!isInsurance) return;

      const paymentAmount = Number(paymentRow.payment_amount ?? 0);
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
          approvalNumber: "",
          merchantNumber: "",
          cardNumber: "",
        } satisfies RevenueRow);

      current.paymentAmount += paymentAmount;
      current.supplyAmount = calculateSupplyAmount(current.paymentAmount);
      current.vatAmount = calculateVatAmount(current.paymentAmount);

      groupedRows.set(key, current);
    });

    return Array.from(groupedRows.values());
  }, [loadPaymentRows, loadWorkMap]);

  const loadGeneralRows = useCallback(async () => {
    const paymentRows = await loadPaymentRows();
    const workNames = Array.from(
      new Set(
        paymentRows
          .map((row) => row.work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );
    const workMap = await loadWorkMap(workNames);

    return paymentRows
      .map((paymentRow) => {
        const workName = paymentRow.work_name ?? "";
        const work = workMap.get(workName);
        const insuranceCompany =
          work?.insurance_company ?? work?.other_insurance_company ?? "";
        const paymentAmount = Number(paymentRow.payment_amount ?? 0);
        const method = paymentRow.payment_method ?? "";
        const detail = paymentRow.payment_detail ?? "";
        const isCard = method.includes("카드");
        const isBlue = [method, detail].join(" ").includes("BLUE");
        const isInsurance = isInsurancePayment(
          paymentRow,
          work,
          insuranceCompany
        );
        const isGeneral =
          detail.includes("일반") ||
          work?.category === "일반" ||
          (!isCard && !isBlue && !isInsurance);

        if (paymentAmount <= 0 || !isGeneral || isCard || isBlue || isInsurance) {
          return null;
        }

        return {
          id: String(paymentRow.id),
          date: paymentRow.payment_date ?? "",
          workName,
          insuranceCompany,
          saleType: work?.category ?? detail,
          coverageType: work?.coverage_type ?? "",
          carNumber: work?.car_number ?? "",
          carModel: work?.car_model ?? "",
          paymentInfo: method,
          paymentAmount,
          supplyAmount: calculateSupplyAmount(paymentAmount),
          vatAmount: calculateVatAmount(paymentAmount),
          approvalNumber: paymentRow.approval_number ?? "",
          merchantNumber: paymentRow.merchant_number ?? "",
          cardNumber: paymentRow.card_number ?? "",
        } satisfies RevenueRow;
      })
      .filter((row): row is RevenueRow => Boolean(row));
  }, [loadPaymentRows, loadWorkMap]);

  const loadCardRows = useCallback(async () => {
    const paymentRows = (await loadPaymentRows()).filter((row) => {
      const amount = Number(row.payment_amount ?? 0);
      return amount > 0 && (row.payment_method ?? "").includes("카드");
    });
    const workNames = Array.from(
      new Set(
        paymentRows
          .map((row) => row.work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );
    const workMap = await loadWorkMap(workNames);

    return paymentRows.map((paymentRow) => {
      const workName = paymentRow.work_name ?? "";
      const work = workMap.get(workName);
      const paymentAmount = Number(paymentRow.payment_amount ?? 0);

      return {
        id: String(paymentRow.id),
        date: paymentRow.payment_date ?? "",
        workName,
        insuranceCompany:
          work?.insurance_company ?? work?.other_insurance_company ?? "",
        saleType: work?.category ?? paymentRow.payment_detail ?? "",
        coverageType: work?.coverage_type ?? "",
        carNumber: work?.car_number ?? "",
        carModel: work?.car_model ?? "",
        paymentInfo: paymentRow.payment_method ?? "카드",
        paymentAmount,
        supplyAmount: calculateSupplyAmount(paymentAmount),
        vatAmount: calculateVatAmount(paymentAmount),
        approvalNumber: paymentRow.approval_number ?? "",
        merchantNumber: paymentRow.merchant_number ?? "",
        cardNumber: paymentRow.card_number ?? "",
      };
    });
  }, [loadPaymentRows, loadWorkMap]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const nextRows =
        kind === "insurance"
          ? await loadInsuranceRows()
          : kind === "general"
            ? await loadGeneralRows()
            : await loadCardRows();
      setRows(nextRows);
    } catch (error) {
      alert(error instanceof Error ? error.message : `${title} 조회 실패`);
    } finally {
      setIsLoading(false);
    }
  }, [kind, loadCardRows, loadGeneralRows, loadInsuranceRows, title]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.date,
          row.workName,
          row.insuranceCompany,
          row.saleType,
          row.coverageType,
          row.carNumber,
          row.carModel,
          row.paymentInfo,
          row.approvalNumber,
          row.merchantNumber,
          row.cardNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
        }

        return sortOrder === "asc"
          ? String(aValue ?? "").localeCompare(String(bValue ?? ""))
          : String(bValue ?? "").localeCompare(String(aValue ?? ""));
      });
  }, [rows, searchText, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

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
            결제일 기준으로 확인하는 {title} 내역입니다.
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
        {kind === "insurance" ? (
          <SummaryCard
            label="공급가 / 부가세"
            value={`${formatWon(totalSupply)}원 / ${formatWon(totalVat)}원`}
          />
        ) : (
          <SummaryCard
            label="조회 기준"
            value={`${selectedYear}년 ${
              selectedMonth ? `${Number(selectedMonth)}월` : "전체"
            }`}
          />
        )}
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
            placeholder={
            kind === "card"
                ? "작명, 차량번호, 승인번호, 카드번호 검색"
                : "작명, 차량번호, 보험사 검색"
            }
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <RevenueTable
          kind={kind}
          rows={filteredRows}
          isLoading={isLoading}
          totalPayment={totalPayment}
          totalSupply={totalSupply}
          totalVat={totalVat}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
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
            kind={kind}
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
  kind,
  rows,
  isLoading,
  totalPayment,
  totalSupply,
  totalVat,
  sortField,
  sortOrder,
  onSort,
  printMode = false,
}: {
  kind: "insurance" | "card" | "general";
  rows: RevenueRow[];
  isLoading: boolean;
  totalPayment: number;
  totalSupply: number;
  totalVat: number;
  sortField?: SortField;
  sortOrder?: "asc" | "desc";
  onSort?: (field: SortField) => void;
  printMode?: boolean;
}) {
  const tableClassName = printMode
    ? "w-full border-collapse text-[9px]"
    : "min-w-[980px] w-full border-collapse text-sm";
  const cellClassName = printMode
    ? "border border-slate-400 px-1 py-1"
    : "border px-2 py-2";
  const colSpan = kind === "card" ? 8 : 11;

  return (
    <div className={printMode ? "" : "overflow-x-auto"}>
      <table className={tableClassName}>
        <thead className="bg-slate-100 text-slate-700">
          {kind === "card" ? (
            <tr>
              <SortableHeader label="결제일" field="date" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="작명" field="workName" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="차량번호" field="carNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="입금정보" field="paymentInfo" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="결제금액" field="paymentAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="승인번호" field="approvalNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="가맹번호" field="merchantNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="카드번호" field="cardNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
            </tr>
          ) : (
            <tr>
              <SortableHeader label="입금일" field="date" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="작명" field="workName" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="보험사" field="insuranceCompany" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="구분" field="saleType" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="담보" field="coverageType" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="차량번호" field="carNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="차량명" field="carModel" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="입금정보" field="paymentInfo" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="결제금액" field="paymentAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="공급가" field="supplyAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="부가세" field="vatAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row) =>
            kind === "card" ? (
              <tr key={row.id} className={printMode ? "" : "hover:bg-slate-50"}>
                <TableCell value={row.date} className={cellClassName} />
                <TableCell value={row.workName} className={cellClassName} strong />
                <TableCell value={row.carNumber} className={cellClassName} />
                <TableCell value={row.paymentInfo} className={cellClassName} />
                <TableCell value={formatWon(row.paymentAmount)} className={cellClassName} strong />
                <TableCell value={row.approvalNumber} className={cellClassName} />
                <TableCell value={row.merchantNumber} className={cellClassName} />
                <TableCell value={row.cardNumber} className={cellClassName} />
              </tr>
            ) : (
              <tr key={row.id} className={printMode ? "" : "hover:bg-slate-50"}>
                <TableCell value={row.date} className={cellClassName} />
                <TableCell value={row.workName} className={cellClassName} strong />
                <TableCell value={row.insuranceCompany} className={cellClassName} />
                <TableCell value={row.saleType} className={cellClassName} />
                <TableCell value={row.coverageType} className={cellClassName} />
                <TableCell value={row.carNumber} className={cellClassName} />
                <TableCell value={row.carModel} className={cellClassName} />
                <TableCell value={row.paymentInfo} className={cellClassName} />
                <TableCell value={formatWon(row.paymentAmount)} className={cellClassName} strong />
                <TableCell value={formatWon(row.supplyAmount)} className={cellClassName} />
                <TableCell value={formatWon(row.vatAmount)} className={cellClassName} />
              </tr>
            )
          )}

          {rows.length === 0 && (
            <tr>
              <td
                className={`${cellClassName} py-8 text-center text-slate-500`}
                colSpan={colSpan}
              >
                {isLoading ? "조회 중입니다." : "조회된 내역이 없습니다."}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          {kind === "card" ? (
            <tr className="bg-blue-50 font-bold text-blue-900">
              <td className={`${cellClassName} text-right`} colSpan={4}>
                합계
              </td>
              <td className={`${cellClassName} text-center`}>
                {formatWon(totalPayment)}
              </td>
              <td className={cellClassName} colSpan={3} />
            </tr>
          ) : (
            <tr className="bg-blue-50 font-bold text-blue-900">
              <td className={`${cellClassName} text-right`} colSpan={8}>
                합계
              </td>
              <td className={`${cellClassName} text-center`}>
                {formatWon(totalPayment)}
              </td>
              <td className={`${cellClassName} text-center`}>
                {formatWon(totalSupply)}
              </td>
              <td className={`${cellClassName} text-center`}>
                {formatWon(totalVat)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function TableCell({
  value,
  className,
  strong = false,
}: {
  value: string;
  className: string;
  strong?: boolean;
}) {
  return (
    <td className={`${className} text-center ${strong ? "font-semibold" : ""}`}>
      {value}
    </td>
  );
}

function SortableHeader({
  label,
  field,
  cellClassName,
  sortField,
  sortOrder,
  onSort,
}: {
  label: string;
  field: SortField;
  cellClassName: string;
  sortField?: SortField;
  sortOrder?: "asc" | "desc";
  onSort?: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  const mark = isActive ? (sortOrder === "asc" ? "▲" : "▼") : "↕";

  if (!onSort) {
    return <th className={`${cellClassName} text-center`}>{label}</th>;
  }

  return (
    <th className={`${cellClassName} text-center`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center justify-center gap-1 font-semibold text-slate-700 hover:text-blue-700"
      >
        <span>{label}</span>
        <span className="text-[10px]">{mark}</span>
      </button>
    </th>
  );
}

function isInsurancePayment(
  paymentRow: SettlementPaymentRow,
  work: WorkOrderRow | undefined,
  insuranceCompany: string
) {
  return (
    (paymentRow.payment_detail ?? "").includes("보험") ||
    work?.category === "보험" ||
    Boolean(insuranceCompany)
  );
}
