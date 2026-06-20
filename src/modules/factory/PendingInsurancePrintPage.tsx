"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import {
  buildPendingInsuranceRows,
  fetchPendingInsuranceSourceRows,
  filterPendingInsuranceRows,
  formatRate,
  formatWon,
  getDaysSinceClaim,
  isLongPendingRow,
  sortPendingInsuranceRows,
  summarizePendingInsuranceRows,
  type InsuranceListRow,
  type PendingInsuranceFilters,
  type SortDirection,
  type SortKey,
} from "./pendingInsuranceListData";

export type PendingInsurancePrintMode =
  | "insurance-confirm"
  | "long-pending-card";

export type PendingInsurancePrintData = {
  printMode?: PendingInsurancePrintMode;
  filters?: PendingInsuranceFilters;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
};

type PendingInsurancePrintPageProps = {
  data?: PendingInsurancePrintData;
  onSelectMenu: (menu: MenuItem) => void;
};

const defaultFilters: PendingInsuranceFilters = {};

const printCellClass = "border border-slate-500 px-1.5 py-1 align-middle";
const todayText = localDateText();
const sheetWidth = {
  card: "188mm",
  list: "276mm",
};
const sheetMinHeight = {
  card: "270mm",
  list: "186mm",
};
const insuranceConfirmFirstPageRows = 20;
const insuranceConfirmFirstPageMaxRows = 25;
const insuranceConfirmNextPageRows = 28;

const buildInsuranceConfirmPages = (rows: InsuranceListRow[]) => {
  const firstPageRows = Math.min(
    Math.max(rows.length, insuranceConfirmFirstPageRows),
    insuranceConfirmFirstPageMaxRows
  );

  if (rows.length <= firstPageRows) {
    return [rows];
  }

  const pages = [rows.slice(0, firstPageRows)];
  let cursor = firstPageRows;

  while (cursor < rows.length) {
    pages.push(rows.slice(cursor, cursor + insuranceConfirmNextPageRows));
    cursor += insuranceConfirmNextPageRows;
  }

  return pages;
};

export default function PendingInsurancePrintPage({
  data,
  onSelectMenu,
}: PendingInsurancePrintPageProps) {
  const printMode = data?.printMode ?? "insurance-confirm";
  const filters = data?.filters ?? defaultFilters;
  const sortKey = data?.sortKey ?? "claimDate";
  const sortDirection = data?.sortDirection ?? "desc";
  const [rows, setRows] = useState<InsuranceListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const sourceRows = await fetchPendingInsuranceSourceRows();
      const listRows = buildPendingInsuranceRows(sourceRows);
      const filteredRows = filterPendingInsuranceRows(listRows, filters);
      const sortedRows = sortPendingInsuranceRows(
        filteredRows,
        sortKey,
        sortDirection
      );

      setRows(sortedRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "출력 데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [filters, sortDirection, sortKey]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const printableRows = useMemo(() => {
    if (printMode === "long-pending-card") {
      return rows
        .filter((row) => isLongPendingRow(row, todayText))
        .sort((a, b) => {
          const dateCompare = a.claimDate.localeCompare(b.claimDate);
          if (dateCompare !== 0) return dateCompare;
          return b.receivableAmount - a.receivableAmount;
        });
    }

    return [...rows].sort((a, b) => {
      const companyCompare = a.insuranceCompany.localeCompare(
        b.insuranceCompany,
        "ko"
      );
      if (companyCompare !== 0) return companyCompare;
      const dateCompare = a.claimDate.localeCompare(b.claimDate);
      if (dateCompare !== 0) return dateCompare;
      return a.workName.localeCompare(b.workName, "ko");
    });
  }, [printMode, rows]);

  const insuranceGroups = useMemo(() => {
    const groups = new Map<string, InsuranceListRow[]>();

    printableRows.forEach((row) => {
      const key = row.insuranceCompany || "미지정";
      const groupRows = groups.get(key) ?? [];
      groupRows.push(row);
      groups.set(key, groupRows);
    });

    return Array.from(groups.entries());
  }, [printableRows]);

  const summary = useMemo(
    () => summarizePendingInsuranceRows(printableRows),
    [printableRows]
  );
  const isCardMode = printMode === "long-pending-card";

  return (
    <div className="min-h-screen bg-slate-200 p-4 text-slate-900 print:bg-white print:p-0">
      <style>{`
        .pending-insurance-preview {
          max-height: calc(100vh - 120px);
          overflow: auto;
          padding: 0 12px 24px;
        }

        .pending-insurance-preview .pending-insurance-print {
          width: max-content;
          max-width: none;
          transform: scale(0.88);
          transform-origin: top center;
        }

        .pending-insurance-preview .pending-insurance-sheet {
          width: ${isCardMode ? sheetWidth.card : sheetWidth.list};
          min-height: ${isCardMode ? sheetMinHeight.card : sheetMinHeight.list};
          padding: ${isCardMode ? "5mm" : "3.5mm"};
          margin: 0 auto 16px;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
        }

        @media print {
          @page {
            size: A4 ${isCardMode ? "portrait" : "landscape"};
            margin: 9mm;
          }

          .pending-insurance-preview {
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
          }

          .pending-insurance-preview .pending-insurance-print {
            transform: none !important;
          }

          body * {
            visibility: hidden !important;
          }

          .pending-insurance-print,
          .pending-insurance-print * {
            visibility: visible !important;
          }

          .pending-insurance-print {
            width: ${isCardMode ? sheetWidth.card : sheetWidth.list} !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }

          .pending-insurance-sheet {
            width: ${isCardMode ? sheetWidth.card : sheetWidth.list} !important;
            min-height: ${isCardMode ? sheetMinHeight.card : sheetMinHeight.list} !important;
            margin: 0 !important;
            padding: ${isCardMode ? "5mm" : "3.5mm"} !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
          }

          .pending-insurance-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .pending-insurance-table {
            table-layout: fixed !important;
            font-size: 9px !important;
            line-height: 1.2 !important;
          }

          .pending-insurance-table thead {
            display: table-header-group !important;
          }

          .pending-insurance-table th,
          .pending-insurance-table td {
            padding: 3px 2px !important;
            overflow-wrap: anywhere !important;
          }

          .pending-insurance-print h1 {
            font-size: 18px !important;
            line-height: 1.15 !important;
          }

          .pending-insurance-print header {
            margin-bottom: 2.5mm !important;
          }

          .pending-insurance-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            onSelectMenu({
              id: "factory-settlement-pending-insurance",
              title: "청구처별 미결 리스트",
            })
          }
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          목록으로
        </button>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
        >
          출력
        </button>
      </div>

      {loadError && (
        <p className="no-print mx-auto mb-4 max-w-6xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="no-print mx-auto max-w-6xl rounded-xl bg-white p-8 text-center text-slate-500">
          출력 데이터를 불러오는 중입니다.
        </div>
      ) : (
        <div className="pending-insurance-preview">
          <section className="pending-insurance-print mx-auto bg-white shadow-lg">
            {isCardMode ? (
              <LongPendingCards rows={printableRows} filters={filters} />
            ) : (
              <InsuranceConfirmSheets
                groups={insuranceGroups}
                summary={summary}
                filters={filters}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function InsuranceConfirmSheets({
  groups,
  summary,
  filters,
}: {
  groups: [string, InsuranceListRow[]][];
  summary: ReturnType<typeof summarizePendingInsuranceRows>;
  filters: PendingInsuranceFilters;
}) {
  if (groups.length === 0) {
    return (
      <article className="pending-insurance-sheet bg-white text-black">
        <PrintHeader
          title="미결 청구건 확인 요청서"
          subtitle="조회 조건에 맞는 미결 청구건이 없습니다."
          filters={filters}
        />
      </article>
    );
  }

  return (
    <>
      {groups.map(([company, rows]) => {
        const groupSummary = summarizePendingInsuranceRows(rows);
        const pages = buildInsuranceConfirmPages(rows);
        const firstPageRows = Math.min(
          Math.max(rows.length, insuranceConfirmFirstPageRows),
          insuranceConfirmFirstPageMaxRows
        );

        return (
          pages.map((pageRows, pageIndex) => {
            const emptyRows = Math.max(
              0,
              (pageIndex === 0
                ? firstPageRows
                : insuranceConfirmNextPageRows) - pageRows.length
            );
            const isLastPage = pageIndex === pages.length - 1;
            const isFirstPage = pageIndex === 0;

            return (
              <article
                key={`${company}-${pageIndex}`}
                className="pending-insurance-sheet flex flex-col bg-white text-black"
              >
                {isFirstPage ? (
                  <>
                    <PrintHeader
                      title="미결 청구건 확인 요청서"
                      subtitle={`${company} 청구건의 입금 및 처리 여부 확인 부탁드립니다.`}
                      filters={filters}
                      company={company}
                      pageText={`${pageIndex + 1}/${pages.length}`}
                    />

                    <div className="mb-3 grid grid-cols-5 border border-slate-900 text-center text-[11px]">
                      <SummaryBox label="건수" value={`${groupSummary.count}건`} />
                      <SummaryBox label="청구금액" value={`${formatWon(groupSummary.claimAmount)}원`} />
                      <SummaryBox label="입금금액" value={`${formatWon(groupSummary.paidAmount)}원`} />
                      <SummaryBox label="미수금" value={`${formatWon(groupSummary.receivableAmount)}원`} />
                      <SummaryBox label="전체 미수금" value={`${formatWon(summary.receivableAmount)}원`} />
                    </div>
                  </>
                ) : (
                  <div className="mb-2 flex items-end justify-between border-b-2 border-slate-900 pb-2">
                    <div>
                      <h2 className="text-lg font-black">미결 청구건 확인 요청서</h2>
                      <p className="text-xs font-semibold text-slate-700">
                        {company} 계속
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-semibold text-slate-700">
                      <div className="mb-1 text-sm font-black text-slate-900">
                        {pageIndex + 1}/{pages.length}
                      </div>
                      <div>기준일: {todayText}</div>
                      <div>출력일: {todayText}</div>
                    </div>
                  </div>
                )}

                <table className="pending-insurance-table w-full border-collapse text-[11px]">
                  <colgroup>
                    <col className="w-[28px]" />
                    <col className="w-[86px]" />
                    <col className="w-[74px]" />
                    <col className="w-[92px]" />
                    <col className="w-[72px]" />
                    <col className="w-[68px]" />
                    <col className="w-[78px]" />
                    <col className="w-[78px]" />
                    <col className="w-[78px]" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100">
                      <th className={printCellClass}>No</th>
                      <th className={printCellClass}>작명</th>
                      <th className={printCellClass}>차량번호</th>
                      <th className={printCellClass}>차량명</th>
                      <th className={printCellClass}>청구상세</th>
                      <th className={printCellClass}>청구일</th>
                      <th className={`${printCellClass} text-right`}>청구금액</th>
                      <th className={`${printCellClass} text-right`}>입금금액</th>
                      <th className={`${printCellClass} text-right`}>미수금</th>
                      <th className={printCellClass}>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => {
                      const rowNumber =
                        pageIndex === 0
                          ? index + 1
                          : firstPageRows +
                            (pageIndex - 1) * insuranceConfirmNextPageRows +
                            index +
                            1;

                      return (
                        <tr key={`${row.id}-${rowNumber}`} className="pending-insurance-avoid-break">
                          <td className={`${printCellClass} text-center`}>{rowNumber}</td>
                          <td className={printCellClass}>{row.workName}</td>
                          <td className={printCellClass}>{row.carNumber}</td>
                          <td className={printCellClass}>{row.carModel}</td>
                          <td className={`${printCellClass} text-center`}>{row.claimSide}</td>
                          <td className={`${printCellClass} text-center`}>{row.claimDate || "-"}</td>
                          <td className={`${printCellClass} text-right`}>{formatWon(row.claimAmount)}</td>
                          <td className={`${printCellClass} text-right`}>{formatWon(row.paidAmount)}</td>
                          <td className={`${printCellClass} text-right font-bold`}>{formatWon(row.receivableAmount)}</td>
                          <td className={printCellClass}>&nbsp;</td>
                        </tr>
                      );
                    })}
                    {Array.from({ length: emptyRows }, (_, index) => (
                      <tr key={`empty-${index}`} className="pending-insurance-avoid-break">
                        {Array.from({ length: 10 }, (_, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={`${printCellClass} ${cellIndex === 0 ? "text-center" : ""}`}
                          >
                            &nbsp;
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {isLastPage && (
                  <footer className="mt-auto grid grid-cols-[1fr_180px] gap-6 pt-4 text-[11px]">
                    <div className="border border-slate-900 p-2">
                      위 내역의 입금, 지급 처리, 보류 사유를 확인 후 회신 부탁드립니다.
                    </div>
                    <div className="border border-slate-900 p-2">
                      <div>확인자:</div>
                      <div className="mt-5 text-right">(서명)</div>
                    </div>
                  </footer>
                )}
              </article>
            );
          })
        );
      })}
    </>
  );
}

function LongPendingCards({
  rows,
  filters,
}: {
  rows: InsuranceListRow[];
  filters: PendingInsuranceFilters;
}) {
  if (rows.length === 0) {
    return (
      <article className="pending-insurance-sheet bg-white text-black">
        <PrintHeader
          title="장기미결 관리카드"
          subtitle="청구일 기준 90일 초과 미결건이 없습니다."
          filters={filters}
        />
      </article>
    );
  }

  return (
    <>
      {rows.map((row, index) => {
        const elapsedDays = getDaysSinceClaim(row.claimDate, todayText);

        return (
          <article
            key={`${row.id}-${index}`}
            className="pending-insurance-sheet bg-white text-black"
          >
            <PrintHeader
              title="장기미결 관리카드"
              subtitle="청구일 기준 90일 초과 미결건 별도 관리용"
              filters={filters}
            />

            <div className="mb-3 flex items-center justify-between border-y-2 border-slate-900 py-2">
              <div>
                <div className="text-xs font-bold text-slate-600">작명</div>
                <div className="text-3xl font-black">{row.workName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-600">경과일수</div>
                <div className="text-3xl font-black text-red-700">
                  {elapsedDays === null ? "-" : `${elapsedDays}일`}
                </div>
              </div>
            </div>

            <table className="mb-4 w-full border-collapse text-sm">
              <tbody>
                <CardInfoRow label="차량번호" value={row.carNumber} label2="차량명" value2={row.carModel} />
                <CardInfoRow label="청구처" value={row.insuranceCompany} label2="청구상세" value2={row.claimSide} />
                <CardInfoRow label="청구일" value={row.claimDate || "-"} label2="수금율" value2={formatRate(row.collectionRate)} />
                <CardInfoRow label="청구금액" value={`${formatWon(row.claimAmount)}원`} label2="입금금액" value2={`${formatWon(row.paidAmount)}원`} />
                <CardInfoRow label="미수금" value={`${formatWon(row.receivableAmount)}원`} label2="관리기준" value2="90일 초과" strong />
                <CardMemoRow value={row.memo} />
              </tbody>
            </table>

            <section className="mb-4">
              <div className="border border-slate-900 bg-slate-100 px-3 py-2 text-sm font-black">
                확인 및 조치 내역
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="w-[90px] border border-slate-900 px-2 py-2">확인일</th>
                    <th className="w-[110px] border border-slate-900 px-2 py-2">담당자</th>
                    <th className="border border-slate-900 px-2 py-2">조치내용</th>
                    <th className="w-[100px] border border-slate-900 px-2 py-2">다음확인일</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, rowIndex) => (
                    <tr key={rowIndex}>
                      <td className="h-12 border border-slate-900">&nbsp;</td>
                      <td className="border border-slate-900">&nbsp;</td>
                      <td className="border border-slate-900">&nbsp;</td>
                      <td className="border border-slate-900">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <div className="border border-slate-900 bg-slate-100 px-3 py-2 text-sm font-black">
                최종 처리 결과
              </div>
              <div className="h-24 border-x border-b border-slate-900">&nbsp;</div>
            </section>
          </article>
        );
      })}
    </>
  );
}

function PrintHeader({
  title,
  subtitle,
  filters,
  company,
  pageText,
}: {
  title: string;
  subtitle: string;
  filters: PendingInsuranceFilters;
  company?: string;
  pageText?: string;
}) {
  return (
    <header className="mb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-wide">{title}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-700">{subtitle}</p>
        </div>
        <div className="min-w-[190px] text-[11px]">
          {pageText && (
            <div className="mb-1 text-right text-sm font-black text-slate-900">
              {pageText}
            </div>
          )}
          <div className="border border-slate-900">
            <div className="grid grid-cols-[70px_1fr] border-b border-slate-900">
              <div className="bg-slate-100 px-2 py-1 font-bold">기준일</div>
              <div className="px-2 py-1">{todayText}</div>
            </div>
            <div className="grid grid-cols-[70px_1fr]">
              <div className="bg-slate-100 px-2 py-1 font-bold">출력일</div>
              <div className="px-2 py-1">{todayText}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 border border-slate-900 text-[11px]">
        <HeaderInfo label="청구처" value={company ?? filters.insuranceFilter ?? "전체"} />
        <HeaderInfo label="년도/월" value={`${filters.selectedYear || "전체"} / ${filters.selectedMonth || "전체"}`} />
        <HeaderInfo label="기간" value={`${filters.startDate || "전체"} ~ ${filters.endDate || "전체"}`} />
        <HeaderInfo label="검색" value={filters.searchText || "-"} />
      </div>
    </header>
  );
}

function HeaderInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[60px_1fr] border-r border-slate-900 last:border-r-0">
      <div className="bg-slate-100 px-2 py-1 font-bold">{label}</div>
      <div className="px-2 py-1">{value}</div>
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-slate-900 last:border-r-0">
      <div className="border-b border-slate-900 bg-slate-100 py-1 font-bold">
        {label}
      </div>
      <div className="py-1.5 font-black">{value}</div>
    </div>
  );
}

function CardInfoRow({
  label,
  value,
  label2,
  value2,
  strong = false,
}: {
  label: string;
  value: string;
  label2: string;
  value2: string;
  strong?: boolean;
}) {
  return (
    <tr>
      <th className="w-28 border border-slate-900 bg-slate-100 px-3 py-2 text-left">
        {label}
      </th>
      <td className={`border border-slate-900 px-3 py-2 ${strong ? "text-lg font-black text-red-700" : ""}`}>
        {value || "\u00A0"}
      </td>
      <th className="w-28 border border-slate-900 bg-slate-100 px-3 py-2 text-left">
        {label2}
      </th>
      <td className={`border border-slate-900 px-3 py-2 ${strong ? "font-black" : ""}`}>
        {value2 || "\u00A0"}
      </td>
    </tr>
  );
}

function CardMemoRow({ value }: { value: string }) {
  return (
    <tr>
      <th className="w-28 border border-slate-900 bg-slate-100 px-3 py-2 text-left">
        비고
      </th>
      <td className="h-16 border border-slate-900 px-3 py-2 align-top" colSpan={3}>
        {value || "\u00A0"}
      </td>
    </tr>
  );
}
