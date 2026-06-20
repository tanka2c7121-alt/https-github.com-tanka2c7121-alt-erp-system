"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";
import {
  buildPendingInsuranceRows,
  fetchPendingInsuranceManagementRows,
  fetchPendingInsuranceSourceRows,
  filterPendingInsuranceRows,
  formatRate,
  formatWon,
  getDaysSinceClaim,
  isLongPendingRow,
  realtimeTables,
  sortPendingInsuranceRows,
  summarizePendingInsuranceRows,
  type InsuranceListRow,
  type PaymentRow,
  type PendingInsuranceManagementRow,
  type PendingInsuranceFilters,
  type SettlementRow,
  type SortDirection,
  type SortKey,
  type WorkOrderRow,
} from "./pendingInsuranceListData";

const todayText = localDateText();
const managementDefaultStatus = "관리중";

export default function PendingInsuranceListPage({
  onSelectMenu,
}: {
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [workOrderRows, setWorkOrderRows] = useState<WorkOrderRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [managementRows, setManagementRows] = useState<
    PendingInsuranceManagementRow[]
  >([]);
  const [managementTableMissing, setManagementTableMissing] = useState(false);
  const [insuranceFilter, setInsuranceFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [longPendingOnly, setLongPendingOnly] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("claimDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingWorkName, setEditingWorkName] = useState("");
  const [managementForm, setManagementForm] = useState({
    status: managementDefaultStatus,
    actionMemo: "",
    finalResult: "",
  });
  const [savingManagement, setSavingManagement] = useState(false);
  const [managementModalPosition, setManagementModalPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const modalDragOffsetRef = useRef({ x: 0, y: 0 });
  const modalDraggingRef = useRef(false);

  const filters = useMemo<PendingInsuranceFilters>(
    () => ({
      insuranceFilter,
      startDate,
      endDate,
      searchText,
      longPendingOnly,
    }),
    [endDate, insuranceFilter, longPendingOnly, searchText, startDate]
  );

  const fetchRows = useCallback(async () => {
    setLoadError("");

    try {
      const [rows, managementResult] = await Promise.all([
        fetchPendingInsuranceSourceRows(),
        fetchPendingInsuranceManagementRows(),
      ]);

      setSettlementRows(rows.settlementRows);
      setWorkOrderRows(rows.workOrderRows);
      setPaymentRows(rows.paymentRows);
      setManagementRows(managementResult.data);
      setManagementTableMissing(Boolean(managementResult.missingTable));

      if (managementResult.error) {
        setLoadError("장기미결 관리 조회 실패: " + managementResult.error.message);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "미결 내역 조회 실패");
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useRealtimeRefresh({
    channelName: "pending-insurance-list-page",
    tables: realtimeTables,
    onRefresh: fetchRows,
  });

  useEffect(() => {
    if (!editingWorkName) return;

    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const offsetLeft = viewport?.offsetLeft ?? 0;
    const offsetTop = viewport?.offsetTop ?? 0;

    setManagementModalPosition({
      x: offsetLeft + width / 2,
      y: offsetTop + height / 2,
    });
  }, [editingWorkName]);

  const listRows = useMemo(
    () =>
      buildPendingInsuranceRows({
        settlementRows,
        workOrderRows,
        paymentRows,
      }),
    [paymentRows, settlementRows, workOrderRows]
  );

  const insuranceOptions = useMemo(() => {
    return Array.from(new Set(listRows.map((row) => row.insuranceCompany)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"));
  }, [listRows]);

  const filteredRows = useMemo(
    () => filterPendingInsuranceRows(listRows, filters),
    [filters, listRows]
  );

  const sortedRows = useMemo(
    () => sortPendingInsuranceRows(filteredRows, sortKey, sortDirection),
    [filteredRows, sortDirection, sortKey]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const openPrintPage = (printMode: "insurance-confirm" | "long-pending-card") => {
    onSelectMenu({
      id: "factory-settlement-pending-insurance-print",
      title: printMode === "insurance-confirm" ? "보험사 확인용 출력" : "장기미결 관리카드",
      data: {
        printMode,
        filters,
        sortKey,
        sortDirection,
      },
    });
  };

  const summary = useMemo(
    () => summarizePendingInsuranceRows(sortedRows),
    [sortedRows]
  );
  const managementByWorkName = useMemo(() => {
    return new Map(
      managementRows
        .map((row) => [row.work_name, row] as const)
        .filter(([workName]) => Boolean(workName))
    );
  }, [managementRows]);
  const editingRows = useMemo(
    () => listRows.filter((row) => row.workName === editingWorkName),
    [editingWorkName, listRows]
  );
  const editingSummary = useMemo(
    () => summarizePendingInsuranceRows(editingRows),
    [editingRows]
  );

  const openManagementEditor = (row: InsuranceListRow) => {
    const management = managementByWorkName.get(row.workName);

    setEditingWorkName(row.workName);
    setManagementForm({
      status: management?.status || managementDefaultStatus,
      actionMemo: management?.action_memo || "",
      finalResult: management?.final_result || "",
    });
  };

  const closeManagementEditor = () => {
    if (savingManagement) return;
    setEditingWorkName("");
  };

  const saveManagement = async () => {
    if (!editingWorkName) return;

    if (managementTableMissing) {
      alert("장기미결 관리 테이블이 없습니다. supabase_pending_insurance_management.sql을 먼저 적용해주세요.");
      return;
    }

    setSavingManagement(true);

    const savedAt = new Date().toISOString();
    const payload = {
      work_name: editingWorkName,
      status: managementForm.status.trim() || managementDefaultStatus,
      action_memo: managementForm.actionMemo.trim() || null,
      final_result: managementForm.finalResult.trim() || null,
      updated_at: savedAt,
    };
    const { error } = await supabase
      .from("pending_insurance_management")
      .upsert(payload, { onConflict: "work_name" });

    setSavingManagement(false);

    if (error) {
      alert("장기미결 관리 저장 실패: " + error.message);
      return;
    }

    setManagementRows((prev) => {
      const next = prev.filter((row) => row.work_name !== editingWorkName);
      next.push(payload);
      return next;
    });
    setEditingWorkName("");
  };

  const startModalDrag = (event: PointerEvent<HTMLElement>) => {
    if (!managementModalPosition) return;

    modalDraggingRef.current = true;
    modalDragOffsetRef.current = {
      x: event.clientX - managementModalPosition.x,
      y: event.clientY - managementModalPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveModalDrag = (event: PointerEvent<HTMLElement>) => {
    if (!modalDraggingRef.current) return;

    const margin = 24;
    const nextX = event.clientX - modalDragOffsetRef.current.x;
    const nextY = event.clientY - modalDragOffsetRef.current.y;

    setManagementModalPosition({
      x: Math.min(Math.max(nextX, margin), window.innerWidth - margin),
      y: Math.min(Math.max(nextY, margin), window.innerHeight - margin),
    });
  };

  const stopModalDrag = (event: PointerEvent<HTMLElement>) => {
    modalDraggingRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-2xl font-bold">청구처별 미결 리스트</h3>
          <p className="text-sm text-slate-600">
            미결 차량의 청구처, 청구기간, 입금 현황을 한 화면에서 검색합니다.
          </p>
          {loadError && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {loadError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openPrintPage("insurance-confirm")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            보험사 확인용 출력
          </button>
          <button
            type="button"
            onClick={() => openPrintPage("long-pending-card")}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
          >
            장기미결 관리카드
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard label="관리건수" value={`${summary.count.toLocaleString()}건`} />
        <SummaryCard label="청구금액" value={`₩ ${formatWon(summary.claimAmount)}`} tone="blue" />
        <SummaryCard label="입금금액" value={`₩ ${formatWon(summary.paidAmount)}`} tone="green" />
        <SummaryCard label="미수금" value={`₩ ${formatWon(summary.receivableAmount)}`} tone="red" />
        <SummaryCard label="수금율" value={formatRate(summary.collectionRate)} tone="green" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            청구처
            <select
              value={insuranceFilter}
              onChange={(event) => setInsuranceFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="">전체</option>
              {insuranceOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            시작
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            종료
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
            검색
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="작명 / 차량번호 / 차량명 / 청구처 / 구분"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            구분
            <button
              type="button"
              onClick={() => setLongPendingOnly((prev) => !prev)}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-bold transition",
                longPendingOnly
                  ? "border-red-500 bg-red-600 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              장기미결건
            </button>
          </div>
        </div>
        {managementTableMissing && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            장기미결 관리 저장 테이블이 아직 없습니다. SQL 적용 전에는 관리내용 저장이 되지 않습니다.
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700">
              <SortableHeader label="작명" sortKey="workName" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="차량번호" sortKey="carNumber" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="차량명" sortKey="carModel" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구처" sortKey="insuranceCompany" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구상세" sortKey="claimSide" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
              <SortableHeader label="청구일" sortKey="claimDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구금액" sortKey="claimAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="입금금액" sortKey="paidAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="미수금" sortKey="receivableAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="수금율" sortKey="collectionRate" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <th className="border-b border-slate-200 px-3 py-2 text-center font-bold">
                상태
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  조건에 맞는 내역이 없습니다.
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => (
                <InsuranceTableRow
                  key={`${row.id}-${row.workName}-${row.insuranceCompany}-${row.claimSide}-${index}`}
                  row={row}
                  management={managementByWorkName.get(row.workName)}
                  onOpenManagement={openManagementEditor}
                  onSelectMenu={onSelectMenu}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
      {editingWorkName && (
        <div className="fixed inset-0 z-50 bg-slate-900/40">
          <section
            className="absolute max-h-[calc(100vh-3rem)] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl"
            style={{
              left: managementModalPosition
                ? `${managementModalPosition.x}px`
                : "50vw",
              top: managementModalPosition
                ? `${managementModalPosition.y}px`
                : "50vh",
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="mb-4 flex cursor-move select-none touch-none items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              onPointerDown={startModalDrag}
              onPointerMove={moveModalDrag}
              onPointerUp={stopModalDrag}
              onPointerCancel={stopModalDrag}
            >
              <div>
                <h4 className="text-xl font-black text-slate-900">
                  장기미결 관리 입력
                </h4>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {editingWorkName} / {editingRows[0]?.carNumber ?? "-"} /{" "}
                  {editingRows[0]?.carModel ?? "-"}
                </p>
              </div>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={closeManagementEditor}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-3">
              <SummaryCard
                label="청구금액"
                value={`₩ ${formatWon(editingSummary.claimAmount)}`}
                tone="blue"
              />
              <SummaryCard
                label="입금금액"
                value={`₩ ${formatWon(editingSummary.paidAmount)}`}
                tone="green"
              />
              <SummaryCard
                label="미수금"
                value={`₩ ${formatWon(editingSummary.receivableAmount)}`}
                tone="red"
              />
            </div>

            <section className="mb-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-800">
                청구정보 / 입금내역
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-white text-slate-700">
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        구분
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        청구처
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-left">
                        접수번호
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">
                        담당자
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-center">
                        청구일
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">
                        청구금액
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">
                        입금금액
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">
                        미수금
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">
                        수금율
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingRows.map((row, index) => (
                      <tr key={`${row.id}-${index}`} className="hover:bg-slate-50">
                        <td className="border-b border-slate-100 px-3 py-2 font-bold text-slate-800">
                          {row.claimSide}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {row.insuranceCompany}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          {row.receiptNumber || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-center">
                          {row.managerName || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-center">
                          {row.claimDate || "-"}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right">
                          {formatWon(row.claimAmount)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right text-blue-600">
                          {formatWon(row.paidAmount)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right font-bold text-red-600">
                          {formatWon(row.receivableAmount)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-slate-700">
                          {formatRate(row.collectionRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-800">
                비고
              </div>
              <div className="min-h-16 whitespace-pre-wrap px-3 py-2 text-sm text-slate-800">
                {editingRows.find((row) => row.memo)?.memo || "등록된 비고가 없습니다."}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
                관리상태
                <select
                  value={managementForm.status}
                  onChange={(event) =>
                    setManagementForm((prev) => ({
                      ...prev,
                      status: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                >
                  <option value="관리중">관리중</option>
                  <option value="확인요청">확인요청</option>
                  <option value="입금예정">입금예정</option>
                  <option value="보류">보류</option>
                  <option value="처리완료">처리완료</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
                확인 및 조치내용
                <textarea
                  value={managementForm.actionMemo}
                  onChange={(event) =>
                    setManagementForm((prev) => ({
                      ...prev,
                      actionMemo: event.target.value,
                    }))
                  }
                  className="h-28 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                  placeholder="확인일, 담당자, 통화내용, 재청구 여부 등을 입력"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-bold text-slate-700">
                최종 처리 결과
                <textarea
                  value={managementForm.finalResult}
                  onChange={(event) =>
                    setManagementForm((prev) => ({
                      ...prev,
                      finalResult: event.target.value,
                    }))
                  }
                  className="h-24 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                  placeholder="최종 입금, 보류, 종결 사유 등을 입력"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeManagementEditor}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={savingManagement}
                onClick={() => void saveManagement()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {savingManagement ? "저장중" : "저장"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function InsuranceTableRow({
  row,
  management,
  onOpenManagement,
  onSelectMenu,
}: {
  row: InsuranceListRow;
  management?: PendingInsuranceManagementRow;
  onOpenManagement: (row: InsuranceListRow) => void;
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const elapsedDays = getDaysSinceClaim(row.claimDate, todayText);
  const longPending = isLongPendingRow(row, todayText);

  return (
    <tr className="hover:bg-blue-50">
      <td className="border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() =>
            onSelectMenu({
              id: "factory-settlement-repair-register",
              title: "정산등록",
              data: { workName: row.workName },
            })
          }
          className="font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          {row.workName}
        </button>
      </td>
      <td className="border-b border-slate-100 px-3 py-2">{row.carNumber}</td>
      <td className="border-b border-slate-100 px-3 py-2">{row.carModel}</td>
      <td className="border-b border-slate-100 px-3 py-2">{row.insuranceCompany}</td>
      <td className="border-b border-slate-100 px-3 py-2 text-center">
        {row.claimSide}
      </td>
      <td className="border-b border-slate-100 px-3 py-2">
        {row.claimDate || "-"}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right">
        {formatWon(row.claimAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right text-blue-600">
        {formatWon(row.paidAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-red-600">
        {formatWon(row.receivableAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-slate-700">
        {formatRate(row.collectionRate)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-center">
        <button
          type="button"
          onClick={() => onOpenManagement(row)}
          className={[
            "rounded-full border px-3 py-1 text-xs font-black",
            longPending
              ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          {longPending ? "장기미결" : "미결"}
        </button>
        <div className="mt-1 text-[11px] font-semibold text-slate-500">
          {management?.status || (elapsedDays === null ? "-" : `${elapsedDays}일`)}
        </div>
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "green" | "red";
}) {
  const toneClass = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    green: "text-green-600",
    red: "text-red-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  align?: "left" | "center" | "right";
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  const alignClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left";

  return (
    <th className="border-b border-slate-200 px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 font-bold hover:text-blue-700 ${alignClass}`}
      >
        <span>{label}</span>
        <span className={isActive ? "text-blue-600" : "text-slate-400"}>
          {isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
