"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type DeductibleManagementPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrderRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  coverage_type: string | null;
  insurance_company: string | null;
  partner_company: string | null;
  deductible_amount: string | null;
  outbound_date: string | null;
  release_date: string | null;
};

type PaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_detail: string | null;
  approval_number: string | null;
  merchant_number: string | null;
  card_number: string | null;
};

type DeductibleItem = {
  id: number;
  workName: string;
  carNumber: string;
  carModel: string;
  category: string;
  company: string;
  deductibleAmount: string;
  outboundDate: string;
  releaseDate: string;
  paidAmount: number;
  hasDeductiblePayment: boolean;
  paymentDate: string;
  paymentMethod: string;
  paymentDetail: string;
  approvalNumber: string;
  merchantNumber: string;
  cardNumber: string;
};

type InputState = {
  amount: string;
  date: string;
  method: string;
  detail: string;
  approvalNumber: string;
  merchantNumber: string;
  cardNumber: string;
};

const pageSize = 30;
const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const accountOptions = ["국민은행", "부산은행", "카드", "현금", "BLUE POINT", "법인1층"];
const paymentDetailOptions = ["보험", "캐피탈", "일반", "바디케어"];

const formatWon = (amount: number) => amount.toLocaleString();

const formatAmount = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers ? Number(numbers).toLocaleString() : "";
};

const toNumber = (value: string) => Number(value.replaceAll(",", "") || 0);

const parseAmount = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers ? Number(numbers) : 0;
};

const hasDeductibleValue = (value?: string | null) => {
  const normalized = String(value ?? "").trim();

  return Boolean(
    normalized &&
      normalized !== "-" &&
      normalized !== "해당없음" &&
      normalized !== "0"
  );
};
const hasDeductibleCoverage = (value?: string | null) => {
  const normalized = String(value ?? "").trim();

  return normalized === "자차" || normalized === "과실";
};


type QueryBuilder = any;

async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  configure?: (query: QueryBuilder) => QueryBuilder
): Promise<{ data: T[]; error: any }> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (configure) {
      query = configure(query);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      return { data: rows, error };
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}
export default function DeductibleManagementPage({
  onSelectMenu,
}: DeductibleManagementPageProps) {
  const [items, setItems] = useState<DeductibleItem[]>([]);
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "complete">("pending");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [sortField, setSortField] = useState<keyof DeductibleItem>("releaseDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [savingWorkName, setSavingWorkName] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const { data: workOrders, error: workError } = await fetchAllRows<WorkOrderRow>(
      "work_orders",
      "id, work_name, car_number, car_model, category, coverage_type, insurance_company, partner_company, deductible_amount, outbound_date, release_date",
      (query) => query.order("id", { ascending: false })
    );

    if (workError) {
      alert("면책금 대상 조회 실패: " + workError.message);
      return;
    }

    const deductibleWorkOrders = ((workOrders ?? []) as WorkOrderRow[]).filter(
      (row) => hasDeductibleCoverage(row.coverage_type) && hasDeductibleValue(row.deductible_amount)
    );
    const workNames = deductibleWorkOrders
      .map((row) => row.work_name)
      .filter(Boolean) as string[];

    const { data: payments, error: paymentError } =
      workNames.length > 0
        ? await fetchAllRows<PaymentRow>(
            "settlement_payments",
            "id, work_name, payment_type, payment_detail, payment_amount, payment_date, payment_method, approval_number, merchant_number, card_number",
            (query) => query.eq("payment_type", "면책금").order("id", { ascending: false })
          )
        : { data: [], error: null };

    if (paymentError) {
      alert("면책금 입금내역 조회 실패: " + paymentError.message);
      return;
    }

    const paymentMap = new Map<string, PaymentRow>();
    ((payments ?? []) as PaymentRow[]).forEach((payment) => {
      if (!payment.work_name || paymentMap.has(payment.work_name)) return;
      paymentMap.set(payment.work_name, payment);
    });

    const nextItems = deductibleWorkOrders.map((row) => {
      const payment = row.work_name ? paymentMap.get(row.work_name) : undefined;

      return {
        id: row.id,
        workName: row.work_name ?? "",
        carNumber: row.car_number ?? "",
        carModel: row.car_model ?? "",
        category: row.coverage_type ?? "",
        company: row.insurance_company || row.partner_company || "",
        deductibleAmount: row.deductible_amount ?? "",
        outboundDate: row.outbound_date ?? "",
        releaseDate: row.release_date ?? "",
        paidAmount: Number(payment?.payment_amount ?? 0),
        hasDeductiblePayment: Boolean(payment),
        paymentDate: payment?.payment_date ?? "",
        paymentMethod: payment?.payment_method ?? "",
        paymentDetail: payment?.payment_detail ?? "",
        approvalNumber: payment?.approval_number ?? "",
        merchantNumber: payment?.merchant_number ?? "",
        cardNumber: payment?.card_number ?? "",
      };
    });

    setItems(nextItems);
    setInputs((prev) => {
      const next: Record<string, InputState> = {};

      nextItems.forEach((item) => {
        next[item.workName] = prev[item.workName] ?? {
          amount: formatWon(parseAmount(item.deductibleAmount)),
          date: localDateText(),
          method: "국민은행",
          detail: "보험",
          approvalNumber: "",
          merchantNumber: "",
          cardNumber: "",
        };
      });

      return next;
    });
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleSort = (field: keyof DeductibleItem) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return items
      .filter((item) => {
        if (!selectedYear) return true;
        return item.workName.startsWith(selectedYear);
      })
      .filter((item) => {
        if (!selectedMonth) return true;
        return item.workName.slice(5, 7) === selectedMonth;
      })
      .filter((item) => {
        const isComplete = item.hasDeductiblePayment;

        if (statusFilter === "pending") return !isComplete;
        if (statusFilter === "complete") return isComplete;
        return true;
      })
      .filter((item) => {
        if (!keyword) return true;

        return [
          item.workName,
          item.carNumber,
          item.carModel,
          item.category,
          item.company,
          item.deductibleAmount,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        const getValue = (item: DeductibleItem) => {
          if (sortField === "deductibleAmount") {
            return parseAmount(item.deductibleAmount);
          }

          return item[sortField];
        };
        const aValue = getValue(a);
        const bValue = getValue(b);

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
        }

        const aText = String(aValue ?? "");
        const bText = String(bValue ?? "");

        if (aText < bText) return sortOrder === "asc" ? -1 : 1;
        if (aText > bText) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [items, searchText, selectedMonth, selectedYear, sortField, sortOrder, statusFilter]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => item.workName.slice(0, 4))
          .filter(Boolean)
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const pendingCount = items.filter((item) => !item.hasDeductiblePayment).length;
  const completeCount = items.filter((item) => item.hasDeductiblePayment).length;
  const paidAmount = filteredItems.reduce((sum, item) => sum + item.paidAmount, 0);

  const headers: Array<{
    key: keyof DeductibleItem;
    label: string;
    className?: string;
  }> = [
    { key: "id", label: "번호", className: "w-12" },
    { key: "workName", label: "작명" },
    { key: "carNumber", label: "차량번호" },
    { key: "carModel", label: "차량명" },
    { key: "category", label: "담보" },
    { key: "company", label: "보험사" },
    { key: "releaseDate", label: "출고일" },
    { key: "deductibleAmount", label: "면책금(최소)" },
    { key: "paidAmount", label: "상태" },
  ];

  const updateInput = (workName: string, field: keyof InputState, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [workName]: {
        amount: prev[workName]?.amount ?? "",
        date: prev[workName]?.date ?? localDateText(),
        method: prev[workName]?.method ?? "국민은행",
        detail: prev[workName]?.detail ?? "보험",
        approvalNumber: prev[workName]?.approvalNumber ?? "",
        merchantNumber: prev[workName]?.merchantNumber ?? "",
        cardNumber: prev[workName]?.cardNumber ?? "",
        [field]: value,
      },
    }));
  };

  const handleSaveDeductible = async (item: DeductibleItem) => {
    const input = inputs[item.workName];
    const amount = toNumber(input?.amount ?? "");

    if (!amount) {
      alert("면책금 금액을 입력하세요.");
      return;
    }

    if (!input?.date) {
      alert("입금일자를 입력하세요.");
      return;
    }

    if (!input?.method) {
      alert("입금계정을 선택하세요.");
      return;
    }

    setSavingWorkName(item.workName);

    const paymentPayload = {
      work_name: item.workName,
      payment_type: "면책금",
      payment_detail: input.detail || "보험",
      claim_amount: 0,
      payment_amount: amount,
      payment_date: input.date,
      payment_method: input.method,
      approval_number: input.method === "카드" ? input.approvalNumber : "",
      merchant_number: input.method === "카드" ? input.merchantNumber : "",
      card_number: input.method === "카드" ? input.cardNumber : "",
      invoice_issued: false,
      claim_date: null,
      payment_status: "수금",
    };

    const { error: paymentError } = await supabase
      .from("settlement_payments")
      .insert(paymentPayload);

    if (paymentError) {
      setSavingWorkName(null);
      alert("면책금 입금내역 저장 실패: " + paymentError.message);
      return;
    }

    const { error: dailyCashError } = await supabase.from("daily_cash").insert({
      date: input.date,
      account: input.method,
      type: "수입",
      category: "면책금",
      content: `${item.carNumber || item.workName} 면책금`,
      income: amount,
      expense: 0,
      memo: item.workName,
      source_type: "settlement_payment",
      source_work_name: item.workName,
    });

    setSavingWorkName(null);

    if (dailyCashError) {
      alert("일일입출금 연동 실패: " + dailyCashError.message);
      return;
    }

    alert("면책금 입금내역을 저장했습니다.");
    await loadItems();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold md:text-2xl">면책금관리</h3>
        <p className="text-sm text-slate-700">
          담보가 자차 또는 과실이고 면책금(최소)이 있는 작명을 기준으로 면책금 입금 여부를 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard title="전체" value={`${items.length.toLocaleString()}건`} />
        <SummaryCard title="미수" value={`${pendingCount.toLocaleString()}건`} tone="red" />
        <SummaryCard title="완료" value={`${completeCount.toLocaleString()}건`} tone="green" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">전체 년도</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setCurrentPage(1);
              }}
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

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as "all" | "pending" | "complete");
                setCurrentPage(1);
              }}
            >
              <option value="pending">미수</option>
              <option value="complete">완료</option>
              <option value="all">전체</option>
            </select>

            <div className="text-sm font-semibold text-slate-700">
              조회 {filteredItems.length.toLocaleString()}건 / 입금 {formatWon(paidAmount)}원
            </div>
          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 lg:w-80"
            placeholder="작명 / 차량번호 / 차량명 / 보험사 검색"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-center text-sm">
            <thead>
              <tr className="bg-slate-100">
                {headers.map((header) => (
                  <th
                    key={header.key}
                    onClick={() => handleSort(header.key)}
                    className={[
                      "cursor-pointer select-none border border-slate-300 px-2 py-2",
                      header.className ?? "",
                      sortField === header.key ? "text-blue-700" : "",
                    ].join(" ")}
                  >
                    {header.label}
                    {sortField === header.key && (
                      <span className="ml-1 text-[11px]">
                        {sortOrder === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </th>
                ))}
                <th className="border border-slate-300 px-2 py-2">면책금 입력</th>
                <th className="border border-slate-300 px-2 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="border border-slate-200 px-3 py-10 text-center text-slate-500"
                  >
                    표시할 면책금 대상이 없습니다.
                  </td>
                </tr>
              ) : (
                pagedItems.map((item, index) => {
                  const input = inputs[item.workName] ?? {
                    amount: "",
                    date: localDateText(),
                    method: "국민은행",
                    detail: "보험",
                    approvalNumber: "",
                    merchantNumber: "",
                    cardNumber: "",
                  };
                  const isComplete = item.hasDeductiblePayment;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-2">
                        {(safeCurrentPage - 1) * pageSize + index + 1}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 font-semibold">
                        {item.workName}
                      </td>
                      <td className="border border-slate-200 px-2 py-2">{item.carNumber}</td>
                      <td className="border border-slate-200 px-2 py-2">{item.carModel}</td>
                      <td className="border border-slate-200 px-2 py-2">{item.category}</td>
                      <td className="border border-slate-200 px-2 py-2">{item.company}</td>
                      <td className="border border-slate-200 px-2 py-2">
                        {item.releaseDate || "-"}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-right font-semibold text-blue-700">
                        {item.deductibleAmount}
                      </td>
                      <td className="border border-slate-200 px-2 py-2">
                        <StatusBadge
                          isComplete={isComplete}
                          paidAmount={item.paidAmount}
                          paymentDate={item.paymentDate}
                          paymentMethod={item.paymentMethod}
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-2">
                        {isComplete ? (
                          <span className="text-xs font-semibold text-slate-500">
                            입력완료
                          </span>
                        ) : (
                          <div className="min-w-[720px] space-y-2">
                            <div className="grid grid-cols-[1fr_120px_120px_120px_80px] gap-2">
                              <input
                                className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-right text-sm"
                                placeholder="입금금액"
                                value={input.amount}
                                onChange={(event) =>
                                  updateInput(
                                    item.workName,
                                    "amount",
                                    formatAmount(event.target.value)
                                  )
                                }
                              />
                              <input
                                type="date"
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                value={input.date}
                                onChange={(event) =>
                                  updateInput(item.workName, "date", event.target.value)
                                }
                              />
                              <select
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                value={input.method}
                                onChange={(event) =>
                                  updateInput(item.workName, "method", event.target.value)
                                }
                              >
                                {accountOptions.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                              <select
                                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
                                value={input.detail}
                                onChange={(event) =>
                                  updateInput(item.workName, "detail", event.target.value)
                                }
                              >
                                {paymentDetailOptions.map((option) => (
                                  <option key={option}>{option}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleSaveDeductible(item)}
                                disabled={savingWorkName === item.workName}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {savingWorkName === item.workName ? "저장중" : "저장"}
                              </button>
                            </div>
                            {input.method === "카드" && (
                              <div className="grid grid-cols-3 gap-2 rounded-lg bg-blue-50 p-2">
                                <input
                                  className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                                  placeholder="승인번호"
                                  value={input.approvalNumber}
                                  onChange={(event) =>
                                    updateInput(item.workName, "approvalNumber", event.target.value)
                                  }
                                />
                                <input
                                  className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                                  placeholder="가맹번호"
                                  value={input.merchantNumber}
                                  onChange={(event) =>
                                    updateInput(item.workName, "merchantNumber", event.target.value)
                                  }
                                />
                                <input
                                  className="rounded-lg border border-blue-200 px-2 py-1 text-sm"
                                  placeholder="카드번호"
                                  value={input.cardNumber}
                                  onChange={(event) =>
                                    updateInput(item.workName, "cardNumber", event.target.value)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectMenu({
                              id: "factory-settlement-repair-register",
                              title: "정산등록",
                              data: { workName: item.workName },
                            })
                          }
                          className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                        >
                          정산열기
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {pagedItems.length === 0 ? (
            <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
              표시할 면책금 대상이 없습니다.
            </div>
          ) : (
            pagedItems.map((item) => {
              const input = inputs[item.workName] ?? {
                amount: "",
                date: localDateText(),
                method: "국민은행",
                detail: "보험",
                approvalNumber: "",
                merchantNumber: "",
                cardNumber: "",
              };
              const isComplete = item.hasDeductiblePayment;

              return (
                <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold text-slate-900">
                        {item.carNumber || "-"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {item.workName} / {item.carModel || "-"}
                      </div>
                    </div>
                    <StatusBadge
                      isComplete={isComplete}
                      paidAmount={item.paidAmount}
                      paymentDate={item.paymentDate}
                      paymentMethod={item.paymentMethod}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <MobileField label="담보" value={item.category} />
                    <MobileField label="보험사" value={item.company} />
                    <MobileField label="출고일" value={item.releaseDate} />
                    <MobileField label="면책금(최소)" value={item.deductibleAmount} />
                  </div>

                  {!isComplete && (
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <input
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-right text-sm"
                        value={input.amount}
                        onChange={(event) =>
                          updateInput(
                            item.workName,
                            "amount",
                            formatAmount(event.target.value)
                          )
                        }
                      />
                      <input
                        type="date"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={input.date}
                        onChange={(event) =>
                          updateInput(item.workName, "date", event.target.value)
                        }
                      />
                      <select
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={input.method}
                        onChange={(event) =>
                          updateInput(item.workName, "method", event.target.value)
                        }
                      >
                        {accountOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      <select
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        value={input.detail}
                        onChange={(event) =>
                          updateInput(item.workName, "detail", event.target.value)
                        }
                      >
                        {paymentDetailOptions.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      {input.method === "카드" && (
                        <div className="grid grid-cols-1 gap-2 rounded-lg bg-blue-50 p-2">
                          <input
                            className="rounded-lg border border-blue-200 px-3 py-2 text-sm"
                            placeholder="승인번호"
                            value={input.approvalNumber}
                            onChange={(event) =>
                              updateInput(item.workName, "approvalNumber", event.target.value)
                            }
                          />
                          <input
                            className="rounded-lg border border-blue-200 px-3 py-2 text-sm"
                            placeholder="가맹번호"
                            value={input.merchantNumber}
                            onChange={(event) =>
                              updateInput(item.workName, "merchantNumber", event.target.value)
                            }
                          />
                          <input
                            className="rounded-lg border border-blue-200 px-3 py-2 text-sm"
                            placeholder="카드번호"
                            value={input.cardNumber}
                            onChange={(event) =>
                              updateInput(item.workName, "cardNumber", event.target.value)
                            }
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveDeductible(item)}
                        disabled={savingWorkName === item.workName}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {savingWorkName === item.workName ? "저장중" : "면책금 저장"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <div className="flex items-center gap-2">
            <PageButton disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(1)}>
              {"<<"}
            </PageButton>
            <PageButton
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage(Math.max(safeCurrentPage - 1, 1))}
            >
              {"<"}
            </PageButton>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={
                  safeCurrentPage === page
                    ? "rounded bg-blue-600 px-3 py-1 text-white"
                    : "rounded px-3 py-1"
                }
              >
                {page}
              </button>
            ))}

            <PageButton
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(Math.min(safeCurrentPage + 1, totalPages))}
            >
              {">"}
            </PageButton>
            <PageButton
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              {">>"}
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string;
  tone?: "slate" | "red" | "green" | "blue";
}) {
  const colorClass =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-green-600"
        : tone === "blue"
          ? "text-blue-600"
          : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className={`mt-2 text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({
  isComplete,
  paidAmount,
  paymentDate,
  paymentMethod,
}: {
  isComplete: boolean;
  paidAmount: number;
  paymentDate: string;
  paymentMethod: string;
}) {
  if (!isComplete) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        미수
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
      <span>완료 {formatWon(paidAmount)}원</span>
      <span className="font-medium text-green-600">
        {paymentDate || "-"} / {paymentMethod || "-"}
      </span>
    </span>
  );
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-800">
        {value || "-"}
      </div>
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-3 py-1 disabled:opacity-40"
    >
      {children}
    </button>
  );
}














