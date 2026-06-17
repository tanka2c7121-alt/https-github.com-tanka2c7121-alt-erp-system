"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type SalesRevenuePageProps = {
  kind: RevenueKind;
  title: string;
};

type RevenueKind =
  | "insurance"
  | "insurance-payment"
  | "capital"
  | "card"
  | "general"
  | "partner"
  | "blue";

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
  partner_company: string | null;
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
  partnerCompany: string;
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
  | "partnerCompany"
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
const salesRevenuePrintFirstPageRows = 34;
const salesRevenuePrintNextPageRows = 41;

const formatWon = (amount: number) => amount.toLocaleString();
const calculateSupplyAmount = (paymentAmount: number) =>
  Math.round(paymentAmount / 1.1);
const calculateVatAmount = (paymentAmount: number) =>
  paymentAmount - calculateSupplyAmount(paymentAmount);
const normalizeText = (value?: string | null) =>
  (value ?? "").replace(/\s/g, "").toUpperCase();

function buildSalesRevenuePrintPages(rows: RevenueRow[]) {
  const pages: RevenueRow[][] = [];
  let cursor = 0;

  pages.push(rows.slice(cursor, cursor + salesRevenuePrintFirstPageRows));
  cursor += salesRevenuePrintFirstPageRows;

  while (cursor < rows.length) {
    pages.push(rows.slice(cursor, cursor + salesRevenuePrintNextPageRows));
    cursor += salesRevenuePrintNextPageRows;
  }

  return pages;
}

export default function SalesRevenuePage({
  kind,
  title,
}: SalesRevenuePageProps) {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [printPortalRoot, setPrintPortalRoot] = useState<HTMLElement | null>(null);

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
        "work_name,car_number,car_model,category,insurance_company,other_insurance_company,coverage_type,partner_company"
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
      return amount > 0;
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

      if (!isInsurance || isCapitalPayment(paymentRow)) return;

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
          partnerCompany: work?.partner_company ?? "",
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

  const loadInsurancePaymentRows = useCallback(async () => {
    const paymentRows = (await loadPaymentRows()).filter((row) => {
      const amount = Number(row.payment_amount ?? 0);
      const paymentType = normalizeText(row.payment_type);
      const paymentDetail = normalizeText(row.payment_detail);
      const paymentMethod = normalizeText(row.payment_method);

      return (
        amount > 0 &&
        paymentType.includes("수리비") &&
        paymentDetail.includes("보험") &&
        (paymentMethod.includes("국민은행") || paymentMethod.includes("법인1층"))
      );
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
        saleType: paymentRow.payment_type ?? work?.category ?? "",
        coverageType: work?.coverage_type ?? "",
        carNumber: work?.car_number ?? "",
        carModel: work?.car_model ?? "",
        partnerCompany: work?.partner_company ?? "",
        paymentInfo: paymentRow.payment_method ?? "",
        paymentAmount,
        supplyAmount: calculateSupplyAmount(paymentAmount),
        vatAmount: calculateVatAmount(paymentAmount),
        approvalNumber: paymentRow.approval_number ?? "",
        merchantNumber: paymentRow.merchant_number ?? "",
        cardNumber: paymentRow.card_number ?? "",
      } satisfies RevenueRow;
    });
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
        const isCapital = isCapitalPayment(paymentRow);
        const isInsurance = isInsurancePayment(
          paymentRow,
          work,
          insuranceCompany
        );
        const isGeneral =
          detail.includes("일반") ||
          work?.category === "일반" ||
          (!isCapital && !isInsurance);

        if (paymentAmount <= 0 || !isGeneral || isCapital || isInsurance) {
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
          partnerCompany: work?.partner_company ?? "",
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

  const loadCapitalRows = useCallback(async () => {
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
        const paymentAmount = Number(paymentRow.payment_amount ?? 0);

        if (paymentAmount <= 0 || !isCapitalPayment(paymentRow)) {
          return null;
        }

        const workName = paymentRow.work_name ?? "";
        const work = workMap.get(workName);

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
          partnerCompany: work?.partner_company ?? "",
          paymentInfo: paymentRow.payment_method ?? "",
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
        partnerCompany: work?.partner_company ?? "",
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

  const loadPartnerRows = useCallback(async () => {
    const paymentRows = (await loadPaymentRows()).filter(
      (row) => Number(row.payment_amount ?? 0) > 0
    );
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
        const partnerCompany = work?.partner_company ?? "";
        const paymentAmount = Number(paymentRow.payment_amount ?? 0);

        if (!partnerCompany) return null;

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
          partnerCompany,
          paymentInfo: paymentRow.payment_method ?? "",
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

  const loadBlueRows = useCallback(async () => {
    const paymentRows = (await loadPaymentRows()).filter((row) => {
      const amount = Number(row.payment_amount ?? 0);
      const text = [row.payment_method, row.payment_detail, row.payment_type].join(" ");

      return amount > 0 && text.includes("BLUE");
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
        partnerCompany: work?.partner_company ?? "",
        paymentInfo: paymentRow.payment_method ?? "BLUE POINT",
        paymentAmount,
        supplyAmount: calculateSupplyAmount(paymentAmount),
        vatAmount: calculateVatAmount(paymentAmount),
        approvalNumber: paymentRow.approval_number ?? "",
        merchantNumber: paymentRow.merchant_number ?? "",
        cardNumber: paymentRow.card_number ?? "",
      } satisfies RevenueRow;
    });
  }, [loadPaymentRows, loadWorkMap]);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const nextRows =
        kind === "insurance"
          ? await loadInsuranceRows()
          : kind === "insurance-payment"
            ? await loadInsurancePaymentRows()
          : kind === "capital"
            ? await loadCapitalRows()
          : kind === "general"
            ? await loadGeneralRows()
            : kind === "partner"
              ? await loadPartnerRows()
              : kind === "blue"
                ? await loadBlueRows()
              : await loadCardRows();
      setRows(nextRows);
    } catch (error) {
      alert(error instanceof Error ? error.message : `${title} 조회 실패`);
    } finally {
      setIsLoading(false);
    }
  }, [
    kind,
    loadCardRows,
    loadBlueRows,
    loadCapitalRows,
    loadGeneralRows,
    loadInsurancePaymentRows,
    loadInsuranceRows,
    loadPartnerRows,
    title,
  ]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const root = document.createElement("div");
    root.className = "sales-revenue-v2-portal";
    document.body.appendChild(root);
    setPrintPortalRoot(root);

    return () => {
      root.remove();
    };
  }, []);

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
          row.partnerCompany,
          row.paymentInfo,
          row.approvalNumber,
          row.merchantNumber,
          row.cardNumber,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .filter((row) => {
        if (kind !== "partner" || !selectedPartner) return true;
        return row.partnerCompany === selectedPartner;
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
  }, [kind, rows, searchText, selectedPartner, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const handlePrint = () => {
    document
      .querySelectorAll(".sales-revenue-v2-portal-active")
      .forEach((portal) =>
        portal.classList.remove("sales-revenue-v2-portal-active")
      );

    printPortalRoot?.classList.add("sales-revenue-v2-portal-active");
    document.body.classList.add("sales-revenue-v2-mode");

    const cleanupPrintMode = () => {
      printPortalRoot?.classList.remove("sales-revenue-v2-portal-active");
      document.body.classList.remove("sales-revenue-v2-mode");
      window.removeEventListener("afterprint", cleanupPrintMode);
    };

    window.addEventListener("afterprint", cleanupPrintMode);
    window.print();
    window.setTimeout(cleanupPrintMode, 1000);
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
  const partnerOptions = useMemo(() => {
    return Array.from(
      new Set(rows.map((row) => row.partnerCompany).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const partnerSummaries = useMemo(() => {
    const summaryMap = new Map<string, number>();

    filteredRows.forEach((row) => {
      summaryMap.set(
        row.partnerCompany,
        (summaryMap.get(row.partnerCompany) ?? 0) + row.paymentAmount
      );
    });

    return Array.from(summaryMap.entries())
      .map(([partnerCompany, amount]) => ({ partnerCompany, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  const yearOptions = useMemo(() => {
    const baseYear = Number(currentYear);
    return Array.from({ length: 5 }, (_, index) => String(baseYear - 2 + index))
      .sort((a, b) => b.localeCompare(a));
  }, []);
  const printPages = useMemo(
    () => buildSalesRevenuePrintPages(filteredRows),
    [filteredRows]
  );
  const printableSheets = (
    <div className="sales-revenue-v2-root">
      {printPages.map((pageRows, pageIndex) => (
        <SalesRevenuePrintSheet
          key={pageIndex}
          kind={kind}
          pageIndex={pageIndex}
          pageCount={printPages.length}
          rows={pageRows}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          title={title}
          totalPayment={totalPayment}
          totalRows={filteredRows.length}
          totalSupply={totalSupply}
          totalVat={totalVat}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-5 text-slate-900">
      <style>
        {`
          .sales-revenue-v2-portal {
            display: none;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }

            html,
            body.sales-revenue-v2-mode {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
            }

            body.sales-revenue-v2-mode * {
              visibility: hidden !important;
            }

            body.sales-revenue-v2-mode > :not(.sales-revenue-v2-portal-active) {
              display: none !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-portal-active,
            body.sales-revenue-v2-mode .sales-revenue-v2-portal-active * {
              visibility: visible !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-portal-active {
              position: static !important;
              left: 0 !important;
              top: 0 !important;
              display: block !important;
              width: 190mm !important;
              min-height: auto !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
            }

            body.sales-revenue-v2-mode .no-print {
              display: none !important;
              visibility: hidden !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-sheet {
              width: 190mm !important;
              height: 282mm !important;
              min-height: 282mm !important;
              margin: 7.5mm auto !important;
              padding: 12mm 5mm 2mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
              box-shadow: none !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-sheet:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-table thead {
              display: table-header-group !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-table tfoot {
              display: table-footer-group !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-table th,
            body.sales-revenue-v2-mode .sales-revenue-v2-table td,
            body.sales-revenue-v2-mode .sales-revenue-v2-total-row th,
            body.sales-revenue-v2-mode .sales-revenue-v2-total-row td {
              box-sizing: border-box !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body.sales-revenue-v2-mode .sales-revenue-v2-table tr {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
          }
        `}
      </style>

      <div className="no-print flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xl font-bold md:text-2xl">{title}</h3>
          <p className="text-sm text-slate-700">
            결제일 기준으로 확인하는 {title} 내역입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          출력
        </button>
      </div>

      <div className="no-print grid grid-cols-3 gap-1.5 md:gap-3">
        <SummaryCard label="총 건수" value={`${filteredRows.length.toLocaleString()}건`} />
        <SummaryCard label="결제금액 합계" value={`${formatWon(totalPayment)}원`} />
        {kind === "insurance" ||
        kind === "general" ||
        kind === "partner" ||
        kind === "blue" ? (
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

            {kind === "partner" && (
              <select
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                value={selectedPartner}
                onChange={(event) => setSelectedPartner(event.target.value)}
              >
                <option value="">전체 거래처</option>
                {partnerOptions.map((partnerCompany) => (
                  <option key={partnerCompany} value={partnerCompany}>
                    {partnerCompany}
                  </option>
                ))}
              </select>
            )}

          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:w-80"
            placeholder={
              kind === "card"
                ? "작명, 차량번호, 승인번호, 카드번호 검색"
                : kind === "partner"
                  ? "거래처, 작명, 차량번호 검색"
                  : kind === "blue"
                    ? "작명, 차량번호, BLUE 검색"
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

      {kind === "partner" && (
        <div className="no-print rounded-xl border border-slate-200 bg-white p-3 md:p-4">
          <div className="mb-3 text-base font-bold text-slate-900">
            거래처별 매출 집계
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {partnerSummaries.map((summary) => (
              <div
                key={summary.partnerCompany}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="font-semibold text-slate-700">
                  {summary.partnerCompany}
                </span>
                <span className="font-bold text-blue-700">
                  {formatWon(summary.amount)}원
                </span>
              </div>
            ))}
            {partnerSummaries.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                집계할 거래처 매출이 없습니다.
              </div>
            )}
          </div>
        </div>
      )}

      {printPortalRoot
        ? createPortal(printableSheets, printPortalRoot)
        : null}
    </div>
  );
}

function SalesRevenuePrintSheet({
  kind,
  pageIndex,
  pageCount,
  rows,
  selectedMonth,
  selectedYear,
  title,
  totalPayment,
  totalRows,
  totalSupply,
  totalVat,
}: {
  kind: RevenueKind;
  pageIndex: number;
  pageCount: number;
  rows: RevenueRow[];
  selectedMonth: string;
  selectedYear: string;
  title: string;
  totalPayment: number;
  totalRows: number;
  totalSupply: number;
  totalVat: number;
}) {
  const periodText = `${selectedYear}년 ${
    selectedMonth ? `${Number(selectedMonth)}월` : "전체"
  }`;
  const isFirstPage = pageIndex === 0;

  return (
    <section className="sales-revenue-v2-sheet mx-auto mb-6 h-[282mm] w-[190mm] bg-white px-[5mm] pb-[2mm] pt-[12mm] text-slate-900 shadow-lg">
      {isFirstPage ? (
        <>
          <div className="relative mb-3 text-center">
            <h1 className="text-3xl font-bold tracking-widest">{title}내역</h1>
            <p className="mt-1 text-sm font-semibold">신흥현대서비스 ERP</p>
            <p className="absolute right-0 top-1 text-xs font-semibold text-slate-600">
              1 / {pageCount}
            </p>
          </div>

          <table className="mb-4 w-full border-collapse text-[12px] font-semibold">
            <tbody>
              <tr>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  조회기간
                </th>
                <td className="border border-slate-900 px-2 py-2">{periodText}</td>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  건수
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {totalRows.toLocaleString()}건
                </td>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  결제합계
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right font-bold text-blue-700">
                  {formatWon(totalPayment)}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  공급가
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {formatWon(totalSupply)}
                </td>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  부가세
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {formatWon(totalVat)}
                </td>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  비고
                </th>
                <td className="border border-slate-900 px-2 py-2">입금일 기준</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <div className="mb-2 text-right text-xs font-semibold text-slate-600">
          {pageIndex + 1} / {pageCount}
        </div>
      )}

      <SalesRevenuePrintTable
        kind={kind}
        rows={rows}
        showTotal={pageIndex === pageCount - 1}
        title={title}
        totalPayment={totalPayment}
        totalSupply={totalSupply}
        totalVat={totalVat}
      />
    </section>
  );
}

function SalesRevenuePrintTable({
  kind,
  rows,
  showTotal,
  title,
  totalPayment,
  totalSupply,
  totalVat,
}: {
  kind: RevenueKind;
  rows: RevenueRow[];
  showTotal: boolean;
  title: string;
  totalPayment: number;
  totalSupply: number;
  totalVat: number;
}) {
  const isCard = kind === "card";
  const isPartner = kind === "partner";
  const colSpan = isCard ? 8 : isPartner ? 10 : 11;
  const totalLabelColSpan = isCard ? 4 : isPartner ? 7 : 8;

  return (
    <table className="sales-revenue-v2-table w-full table-fixed border-collapse text-[8.5px] leading-tight">
      {isCard ? (
        <colgroup>
          <col className="w-[17mm]" />
          <col className="w-[23mm]" />
          <col className="w-[20mm]" />
          <col className="w-[23mm]" />
          <col className="w-[21mm]" />
          <col className="w-[25mm]" />
          <col className="w-[23mm]" />
          <col className="w-[23mm]" />
        </colgroup>
      ) : isPartner ? (
        <colgroup>
          <col className="w-[15mm]" />
          <col className="w-[24mm]" />
          <col className="w-[19mm]" />
          <col className="w-[13mm]" />
          <col className="w-[18mm]" />
          <col className="w-[23mm]" />
          <col className="w-[15mm]" />
          <col className="w-[16mm]" />
          <col className="w-[16mm]" />
          <col className="w-[14mm]" />
        </colgroup>
      ) : (
        <colgroup>
          <col className="w-[14mm]" />
          <col className="w-[18mm]" />
          <col className="w-[21mm]" />
          <col className="w-[12mm]" />
          <col className="w-[12mm]" />
          <col className="w-[17mm]" />
          <col className="w-[20mm]" />
          <col className="w-[14mm]" />
          <col className="w-[15mm]" />
          <col className="w-[15mm]" />
          <col className="w-[14mm]" />
        </colgroup>
      )}
      <thead className="text-center">
        {isCard ? (
          <tr className="bg-slate-50">
            <PrintHeaderCell>결제일</PrintHeaderCell>
            <PrintHeaderCell>작명</PrintHeaderCell>
            <PrintHeaderCell>차량번호</PrintHeaderCell>
            <PrintHeaderCell>입금정보</PrintHeaderCell>
            <PrintHeaderCell>결제금액</PrintHeaderCell>
            <PrintHeaderCell>승인번호</PrintHeaderCell>
            <PrintHeaderCell>가맹번호</PrintHeaderCell>
            <PrintHeaderCell>카드번호</PrintHeaderCell>
          </tr>
        ) : isPartner ? (
          <tr className="bg-slate-50">
            <PrintHeaderCell>입금일</PrintHeaderCell>
            <PrintHeaderCell>거래처</PrintHeaderCell>
            <PrintHeaderCell>작명</PrintHeaderCell>
            <PrintHeaderCell>구분</PrintHeaderCell>
            <PrintHeaderCell>차량번호</PrintHeaderCell>
            <PrintHeaderCell>차량명</PrintHeaderCell>
            <PrintHeaderCell>입금</PrintHeaderCell>
            <PrintHeaderCell>결제금액</PrintHeaderCell>
            <PrintHeaderCell>공급가</PrintHeaderCell>
            <PrintHeaderCell>부가세</PrintHeaderCell>
          </tr>
        ) : (
          <tr className="bg-slate-50">
            <PrintHeaderCell>입금일</PrintHeaderCell>
            <PrintHeaderCell>작명</PrintHeaderCell>
            <PrintHeaderCell>보험사</PrintHeaderCell>
            <PrintHeaderCell>구분</PrintHeaderCell>
            <PrintHeaderCell>담보</PrintHeaderCell>
            <PrintHeaderCell>차량번호</PrintHeaderCell>
            <PrintHeaderCell>차량명</PrintHeaderCell>
            <PrintHeaderCell>입금</PrintHeaderCell>
            <PrintHeaderCell>결제금액</PrintHeaderCell>
            <PrintHeaderCell>공급가</PrintHeaderCell>
            <PrintHeaderCell>부가세</PrintHeaderCell>
          </tr>
        )}
      </thead>
      <tbody>
        {rows.map((row) =>
          isCard ? (
            <tr key={row.id} className="h-[5.8mm]">
              <SalesRevenuePrintCell center>{row.date || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell strong>{row.workName || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.carNumber || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.paymentInfo || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.paymentAmount)}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.approvalNumber || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.merchantNumber || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.cardNumber || "\u00A0"}</SalesRevenuePrintCell>
            </tr>
          ) : isPartner ? (
            <tr key={row.id} className="h-[5.8mm]">
              <SalesRevenuePrintCell center>{row.date || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell strong>{row.partnerCompany || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell strong>{row.workName || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.saleType || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.carNumber || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell>{row.carModel || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.paymentInfo || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.paymentAmount)}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.supplyAmount)}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.vatAmount)}</SalesRevenuePrintCell>
            </tr>
          ) : (
            <tr key={row.id} className="h-[5.8mm]">
              <SalesRevenuePrintCell center>{row.date || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell strong>{row.workName || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell>{row.insuranceCompany || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.saleType || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.coverageType || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.carNumber || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell>{row.carModel || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell center>{row.paymentInfo || "\u00A0"}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.paymentAmount)}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.supplyAmount)}</SalesRevenuePrintCell>
              <SalesRevenuePrintCell amount>{formatWon(row.vatAmount)}</SalesRevenuePrintCell>
            </tr>
          )
        )}

        {rows.length === 0 && (
          <tr>
            <td
              className="border border-slate-900 px-3 py-12 text-center text-slate-500"
              colSpan={colSpan}
            >
              조회된 {title} 내역이 없습니다.
            </td>
          </tr>
        )}
      </tbody>
      {showTotal && rows.length > 0 && (
        <tfoot>
          <tr className="sales-revenue-v2-total-row bg-blue-50 font-bold text-blue-900">
            <th
              className="border border-slate-900 px-1 py-2 text-right"
              colSpan={totalLabelColSpan}
            >
              합계
            </th>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totalPayment)}
            </td>
            {isCard ? (
              <td className="border border-slate-900 px-1 py-2" colSpan={3} />
            ) : (
              <>
                <td className="border border-slate-900 px-1 py-2 text-right">
                  {formatWon(totalSupply)}
                </td>
                <td className="border border-slate-900 px-1 py-2 text-right">
                  {formatWon(totalVat)}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function PrintHeaderCell({ children }: { children: ReactNode }) {
  return <th className="border border-slate-900 px-1 py-2">{children}</th>;
}

function SalesRevenuePrintCell({
  amount = false,
  center = false,
  children,
  strong = false,
}: {
  amount?: boolean;
  center?: boolean;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`overflow-hidden whitespace-nowrap border border-slate-900 px-1 py-1 ${
        amount ? "text-right" : center ? "text-center" : ""
      } ${strong ? "font-semibold" : ""}`}
    >
      {children}
    </td>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-16 min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-white px-1.5 py-2 text-center shadow-sm md:min-h-28 md:rounded-xl md:p-4 md:text-left">
      <p className="min-w-0 truncate text-[10px] font-semibold leading-tight text-slate-600 md:text-sm">
        {label}
      </p>
      <p className="min-w-0 truncate text-[11px] font-bold leading-none text-blue-700 md:mt-2 md:text-xl">
        {value}
      </p>
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
  kind: RevenueKind;
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
    ? "w-full table-fixed border-collapse text-[8px] leading-tight"
    : "min-w-[980px] w-full border-collapse text-sm";
  const cellClassName = printMode
    ? "border border-slate-400 px-[2px] py-[3px] align-middle break-words"
    : "border px-2 py-2";
  const colSpan = kind === "card" ? 8 : kind === "partner" ? 10 : 11;

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
          ) : kind === "partner" ? (
            <tr>
              <SortableHeader label="입금일" field="date" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="거래처" field="partnerCompany" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="작명" field="workName" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="구분" field="saleType" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="차량번호" field="carNumber" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="차량명" field="carModel" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="입금정보" field="paymentInfo" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="결제금액" field="paymentAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="공급가" field="supplyAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="부가세" field="vatAmount" cellClassName={cellClassName} sortField={sortField} sortOrder={sortOrder} onSort={onSort} />
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
            ) : kind === "partner" ? (
              <tr key={row.id} className={printMode ? "" : "hover:bg-slate-50"}>
                <TableCell value={row.date} className={cellClassName} />
                <TableCell value={row.partnerCompany} className={cellClassName} strong />
                <TableCell value={row.workName} className={cellClassName} strong />
                <TableCell value={row.saleType} className={cellClassName} />
                <TableCell value={row.carNumber} className={cellClassName} />
                <TableCell value={row.carModel} className={cellClassName} />
                <TableCell value={row.paymentInfo} className={cellClassName} />
                <TableCell value={formatWon(row.paymentAmount)} className={cellClassName} strong />
                <TableCell value={formatWon(row.supplyAmount)} className={cellClassName} />
                <TableCell value={formatWon(row.vatAmount)} className={cellClassName} />
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
          ) : kind === "partner" ? (
            <tr className="bg-blue-50 font-bold text-blue-900">
              <td className={`${cellClassName} text-right`} colSpan={7}>
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
  const detail = paymentRow.payment_detail ?? "";

  if (detail.includes("일반") || detail.includes("캐피탈")) {
    return false;
  }

  return (
    detail.includes("보험") ||
    work?.category === "보험" ||
    Boolean(insuranceCompany)
  );
}

function isCapitalPayment(paymentRow: SettlementPaymentRow) {
  return [paymentRow.payment_detail, paymentRow.payment_type]
    .join(" ")
    .includes("캐피탈");
}
