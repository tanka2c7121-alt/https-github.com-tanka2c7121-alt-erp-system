"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";

type WorkOrderRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_maker: string | null;
  car_model: string | null;
  color_code: string | null;
  category: string | null;
  coverage_type: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  partner_company: string | null;
  manager_name: string | null;
  own_manager_name: string | null;
  other_manager_name: string | null;
  inbound_date: string | null;
  outbound_date: string | null;
  release_date: string | null;
  message: string | null;
};

type SettlementRow = {
  id: number;
  work_name: string | null;
  progress_status: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  own_claim_amount: number | null;
  other_claim_amount: number | null;
  own_claim_date: string | null;
  other_claim_date: string | null;
  total_amount: number | null;
};

type PaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  payment_amount: number | null;
  payment_date: string | null;
};

type SearchItem = {
  work: WorkOrderRow;
  settlement?: SettlementRow;
  payments: PaymentRow[];
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const toAmount = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;
const formatWon = (value: number) => `${value.toLocaleString()}원`;
const displayValue = (value: unknown) => normalizeText(value) || "-";
const isClaimPayment = (row: PaymentRow) => normalizeText(row.payment_type) === "청구";
const isDeductiblePayment = (row: PaymentRow) =>
  normalizeText(row.payment_type) === "면책금";

async function fetchAll<T>(tableName: string, selectQuery: string) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectQuery)
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function getClaimAmount(settlement: SettlementRow | undefined, payments: PaymentRow[]) {
  const settlementAmount = toAmount(settlement?.claim_amount);
  const sideAmount =
    toAmount(settlement?.own_claim_amount) + toAmount(settlement?.other_claim_amount);
  const paymentClaimAmount = payments
    .filter(isClaimPayment)
    .reduce((sum, row) => sum + toAmount(row.claim_amount), 0);

  return settlementAmount || sideAmount || paymentClaimAmount;
}

function getClaimDate(settlement: SettlementRow | undefined, payments: PaymentRow[]) {
  return (
    normalizeText(settlement?.claim_date) ||
    normalizeText(settlement?.own_claim_date) ||
    normalizeText(settlement?.other_claim_date) ||
    normalizeText(payments.find((row) => normalizeText(row.claim_date))?.claim_date)
  );
}

function getPaidAmount(payments: PaymentRow[]) {
  return payments
    .filter((row) => !isClaimPayment(row))
    .filter((row) => !isDeductiblePayment(row))
    .reduce((sum, row) => sum + toAmount(row.payment_amount), 0);
}

function getWorkStatus(work: WorkOrderRow) {
  if (normalizeText(work.release_date)) return "출고완료";
  if (normalizeText(work.inbound_date)) return "입고/진행";
  return "등록";
}

export default function GlobalVehicleSearch({
  onSelectMenu,
}: {
  onSelectMenu?: (menu: MenuItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedWorkName, setExpandedWorkName] = useState("");
  const [workRows, setWorkRows] = useState<WorkOrderRow[]>([]);
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!isOpen || workRows.length > 0 || loading) return;

    const loadRows = async () => {
      setLoading(true);
      setLoadError("");

      try {
        const [works, settlements, payments] = await Promise.all([
          fetchAll<WorkOrderRow>(
            "work_orders",
            [
              "id",
              "work_name",
              "car_number",
              "car_maker",
              "car_model",
              "color_code",
              "category",
              "coverage_type",
              "insurance_company",
              "other_insurance_company",
              "partner_company",
              "manager_name",
              "own_manager_name",
              "other_manager_name",
              "inbound_date",
              "outbound_date",
              "release_date",
              "message",
            ].join(", ")
          ),
          fetchAll<SettlementRow>(
            "repair_settlements",
            [
              "id",
              "work_name",
              "progress_status",
              "claim_amount",
              "claim_date",
              "own_claim_amount",
              "other_claim_amount",
              "own_claim_date",
              "other_claim_date",
              "total_amount",
            ].join(", ")
          ),
          fetchAll<PaymentRow>(
            "settlement_payments",
            "id, work_name, payment_type, payment_detail, claim_amount, claim_date, payment_amount, payment_date"
          ),
        ]);

        setWorkRows(works);
        setSettlementRows(settlements);
        setPaymentRows(payments);
      } catch (error: any) {
        setLoadError("전체검색 조회 실패: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    void loadRows();
  }, [isOpen, loading, workRows.length]);

  const searchItems = useMemo(() => {
    const settlementByWorkName = new Map(
      settlementRows
        .map((row) => [normalizeText(row.work_name), row] as const)
        .filter(([workName]) => Boolean(workName))
    );
    const paymentsByWorkName = paymentRows.reduce<Map<string, PaymentRow[]>>(
      (map, row) => {
        const workName = normalizeText(row.work_name);

        if (!workName) return map;

        const rows = map.get(workName) ?? [];
        rows.push(row);
        map.set(workName, rows);
        return map;
      },
      new Map<string, PaymentRow[]>()
    );

    return workRows.map((work) => {
      const workName = normalizeText(work.work_name);

      return {
        work,
        settlement: settlementByWorkName.get(workName),
        payments: paymentsByWorkName.get(workName) ?? [],
      };
    });
  }, [paymentRows, settlementRows, workRows]);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const digitKeyword = query.replace(/\D/g, "");

    if (!keyword) return searchItems.slice(0, 10);

    return searchItems
      .filter(({ work }) => {
        const carNumber = normalizeText(work.car_number);
        const carDigits = carNumber.replace(/\D/g, "");

        return (
          normalizeText(work.work_name).toLowerCase().includes(keyword) ||
          carNumber.toLowerCase().includes(keyword) ||
          (digitKeyword.length >= 4 && carDigits.endsWith(digitKeyword)) ||
          normalizeText(work.car_model).toLowerCase().includes(keyword) ||
          normalizeText(work.insurance_company).toLowerCase().includes(keyword)
        );
      })
      .slice(0, 30);
  }, [query, searchItems]);

  const openMenu = (menu: MenuItem) => {
    onSelectMenu?.(menu);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white md:text-sm"
      >
        전체검색
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[1200] bg-slate-950/35 px-3 py-4 backdrop-blur-sm md:px-6 md:py-8">
          <div className="mx-auto flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:max-h-[calc(100vh-4rem)]">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">차량 통합조회</h2>
                  <p className="text-xs font-semibold text-slate-500">
                    차량번호 뒤 4자리 또는 작명으로 현재 상태를 확인합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                >
                  닫기
                </button>
              </div>
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setExpandedWorkName("");
                }}
                placeholder="차량번호 뒤 4자리 / 작명 검색"
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                  조회 중입니다.
                </div>
              ) : loadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {loadError}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredItems.map((item) => {
                    const workName = normalizeText(item.work.work_name);
                    const isExpanded = expandedWorkName === workName;

                    return (
                      <SearchResultCard
                        key={`${item.work.id}-${workName}`}
                        item={item}
                        expanded={isExpanded}
                        onToggle={() =>
                          setExpandedWorkName(isExpanded ? "" : workName)
                        }
                        onOpenWork={() =>
                          openMenu({
                            id: "factory-work-register",
                            title: "작업등록",
                            data: { workName },
                          })
                        }
                        onOpenSettlement={() =>
                          openMenu({
                            id: "factory-settlement-repair-register",
                            title: "정산등록",
                            data: { workName },
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchResultCard({
  item,
  expanded,
  onToggle,
  onOpenWork,
  onOpenSettlement,
}: {
  item: SearchItem;
  expanded: boolean;
  onToggle: () => void;
  onOpenWork: () => void;
  onOpenSettlement: () => void;
}) {
  const work = item.work;
  const settlement = item.settlement;
  const workName = normalizeText(work.work_name);
  const claimAmount = getClaimAmount(settlement, item.payments);
  const paidAmount = getPaidAmount(item.payments);
  const receivableAmount = Math.max(0, claimAmount - paidAmount);
  const rate = claimAmount > 0 ? (paidAmount / claimAmount) * 100 : null;
  const settlementStatus = normalizeText(settlement?.progress_status) || "정산 미등록";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-1 gap-2 p-3 text-left hover:bg-blue-50 md:grid-cols-[1.4fr_1fr_1fr_auto]"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-blue-700">{workName}</div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-500">
            {displayValue(work.car_number)} / {displayValue(work.car_maker)}{" "}
            {displayValue(work.car_model)}
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-600">
          작업 {getWorkStatus(work)}
          <br />
          정산 {settlementStatus}
        </div>
        <div className="text-xs font-semibold text-slate-600">
          청구 {formatWon(claimAmount)}
          <br />
          미수 {formatWon(receivableAmount)}
        </div>
        <div className="self-center text-xs font-bold text-slate-400">
          {expanded ? "접기" : "상세"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-3">
          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <InfoBlock
              title="작업등록"
              rows={[
                ["차량", `${displayValue(work.car_maker)} ${displayValue(work.car_model)}`],
                ["칼라코드", displayValue(work.color_code)],
                ["보험사", displayValue(work.insurance_company)],
                ["상대보험사", displayValue(work.other_insurance_company)],
                ["거래처", displayValue(work.partner_company)],
                ["담보", displayValue(work.coverage_type)],
                ["담당자", displayValue(work.manager_name || work.own_manager_name || work.other_manager_name)],
                ["입고일", displayValue(work.inbound_date)],
                ["출고예정", displayValue(work.outbound_date)],
                ["출고일", displayValue(work.release_date)],
              ]}
            />
            <InfoBlock
              title="정산정보"
              rows={[
                ["진행상태", settlementStatus],
                ["청구일", displayValue(getClaimDate(settlement, item.payments))],
                ["청구금액", formatWon(claimAmount)],
                ["입금금액", formatWon(paidAmount)],
                ["미수금", formatWon(receivableAmount)],
                ["결제율", rate === null ? "-" : `${rate.toFixed(1)}%`],
                ["합계금액", formatWon(toAmount(settlement?.total_amount))],
              ]}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenWork}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              작업등록 보기
            </button>
            <button
              type="button"
              onClick={onOpenSettlement}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              정산등록 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <h3 className="mb-2 font-bold text-slate-900">{title}</h3>
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={`${title}-${label}`} className="contents">
            <div className="font-semibold text-slate-500">{label}</div>
            <div className="min-w-0 break-words font-semibold text-slate-800">
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
