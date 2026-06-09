"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type ReleaseListPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type ReleaseItem = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
  insurance_company: string;
  other_insurance_company: string;
  manager_name: string;
  own_manager_name: string;
  other_manager_name: string;
  coverage_type: string;
  car_year: string;
  color_code: string;
};

type SortField =
  | keyof ReleaseItem
  | "delay_days"
  | "insurance_display"
  | "manager_display";

const dayMs = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: string) => {
  if (!from || !to) return 0;

  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T00:00:00`).getTime();

  return Math.floor((toTime - fromTime) / dayMs);
};

const displayValue = (value?: string | null) => value || "-";

const insuranceName = (item: ReleaseItem) =>
  item.insurance_company || item.other_insurance_company || "";

const managerName = (item: ReleaseItem) =>
  item.manager_name || item.own_manager_name || item.other_manager_name || "";

const delayDays = (item: ReleaseItem, today: string) =>
  item.outbound_date && item.outbound_date < today
    ? daysBetween(item.outbound_date, today)
    : 0;

const rowTone = (item: ReleaseItem, today: string) => {
  if (!item.outbound_date) return "bg-slate-50 text-slate-700";
  if (item.outbound_date < today) return "bg-red-50 text-red-900";
  if (item.outbound_date === today) return "bg-blue-50 text-blue-900";
  return "bg-white text-slate-900";
};

export default function ReleaseListPage({ onSelectMenu }: ReleaseListPageProps) {
  const today = localDateText();
  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("outbound_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const loadItems = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("work_orders")
      .select(
        [
          "id",
          "work_name",
          "car_number",
          "car_model",
          "inbound_date",
          "outbound_date",
          "release_date",
          "insurance_company",
          "other_insurance_company",
          "manager_name",
          "own_manager_name",
          "other_manager_name",
          "coverage_type",
          "car_year",
          "color_code",
        ].join(", ")
      )
      .is("release_date", null)
      .order("outbound_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: false });

    setLoading(false);

    if (error) {
      alert("출고리스트 조회 실패: " + error.message);
      return;
    }

    const rows = (data ?? []) as Array<Partial<ReleaseItem>>;

    setItems(
      rows.map((item) => ({
        id: item.id ?? 0,
        work_name: item.work_name ?? "",
        car_number: item.car_number ?? "",
        car_model: item.car_model ?? "",
        inbound_date: item.inbound_date ?? "",
        outbound_date: item.outbound_date ?? "",
        release_date: item.release_date ?? "",
        insurance_company: item.insurance_company ?? "",
        other_insurance_company: item.other_insurance_company ?? "",
        manager_name: item.manager_name ?? "",
        own_manager_name: item.own_manager_name ?? "",
        other_manager_name: item.other_manager_name ?? "",
        coverage_type: item.coverage_type ?? "",
        car_year: item.car_year ?? "",
        color_code: item.color_code ?? "",
      }))
    );
  }, []);

  useEffect(() => {
    void loadItems();

    const handleFocus = () => {
      void loadItems();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadItems]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const filteredItems = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const sortValue = (item: ReleaseItem, field: SortField) => {
      if (field === "delay_days") return delayDays(item, today);
      if (field === "insurance_display") return insuranceName(item);
      if (field === "manager_display") return managerName(item);
      return item[field] ?? "";
    };

    return items
      .filter((item) => {
        if (!keyword) return true;

        return [
          item.work_name,
          item.car_number,
          item.car_model,
          insuranceName(item),
          managerName(item),
          item.coverage_type,
          item.car_year,
          item.color_code,
          item.inbound_date,
          item.outbound_date,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        const aGroup = !a.outbound_date
          ? 3
          : a.outbound_date < today
            ? 0
            : a.outbound_date === today
              ? 1
              : 2;
        const bGroup = !b.outbound_date
          ? 3
          : b.outbound_date < today
            ? 0
            : b.outbound_date === today
              ? 1
              : 2;

        const aValue = sortValue(a, sortField);
        const bValue = sortValue(b, sortField);
        const compared =
          typeof aValue === "number" && typeof bValue === "number"
            ? aValue - bValue
            : String(aValue).localeCompare(String(bValue), "ko");

        if (compared !== 0) {
          return sortOrder === "asc" ? compared : -compared;
        }

        if (aGroup !== bGroup) return aGroup - bGroup;

        return String(a.outbound_date || "9999-99-99").localeCompare(
          String(b.outbound_date || "9999-99-99")
        );
      });
  }, [items, searchText, sortField, sortOrder, today]);

  const summary = useMemo(() => {
    const delayed = items.filter(
      (item) => item.outbound_date && item.outbound_date < today
    ).length;
    const todayRelease = items.filter((item) => item.outbound_date === today).length;
    const upcoming = items.filter(
      (item) => item.outbound_date && item.outbound_date > today
    ).length;
    const undecided = items.filter((item) => !item.outbound_date).length;

    return {
      total: items.length,
      delayed,
      todayRelease,
      upcoming,
      undecided,
    };
  }, [items, today]);

  const handleRelease = async (item: ReleaseItem) => {
    if (!confirm(`${item.work_name} 차량을 오늘 출고 처리할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("work_orders")
      .update({ release_date: today })
      .eq("id", item.id);

    if (error) {
      alert("출고 처리 실패: " + error.message);
      return;
    }

    await loadItems();
  };

  const openWorkRegister = (workName: string) => {
    onSelectMenu({
      id: "factory-work-register",
      title: "작업등록",
      data: { workName },
    });
  };

  return (
    <div className="print-area space-y-5 text-slate-900 print:space-y-2">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">출고리스트</h3>
          <p className="text-sm text-slate-600">
            현재 입고 중인 차량의 출고예정일을 기준으로 확인합니다.
          </p>
        </div>

        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            출력
          </button>
        </div>
      </div>

      <section className="no-print grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard title="전체" value={summary.total} className="border-slate-200 bg-white text-slate-900" />
        <SummaryCard title="지연" value={summary.delayed} className="border-red-100 bg-red-50 text-red-700" />
        <SummaryCard title="오늘 출고" value={summary.todayRelease} className="border-blue-100 bg-blue-50 text-blue-700" />
        <SummaryCard title="예정" value={summary.upcoming} className="border-green-100 bg-green-50 text-green-700" />
        <SummaryCard title="미정" value={summary.undecided} className="border-slate-200 bg-slate-50 text-slate-600" />
      </section>

      <section className="no-print rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="작명 / 차량번호 / 차량명 / 보험사 / 담당자 / 담보 검색"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-md"
          />
          <div className="text-sm font-semibold text-slate-500">
            {loading ? "조회 중..." : `${filteredItems.length}대 표시`}
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <ReleaseTable
            items={filteredItems}
            today={today}
            sortField={sortField}
            sortOrder={sortOrder}
            onSort={handleSort}
            onRelease={handleRelease}
            onOpenWork={openWorkRegister}
            showActions
          />
        </div>

        <div className="space-y-3 lg:hidden">
          {filteredItems.map((item) => {
            const delay = delayDays(item, today);

            return (
              <article
                key={item.id}
                className={`rounded-xl border border-slate-200 p-4 ${rowTone(item, today)}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{item.work_name}</p>
                    <p className="text-sm">
                      {item.car_number || "-"} / {item.car_model || "-"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-bold">
                    {delay > 0
                      ? `${delay}일 지연`
                      : item.outbound_date === today
                        ? "오늘 출고"
                        : item.outbound_date || "미정"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <MobileField label="입고일" value={item.inbound_date} />
                  <MobileField label="출고예정" value={item.outbound_date} />
                  <MobileField label="보험사" value={insuranceName(item)} />
                  <MobileField label="담당자" value={managerName(item)} />
                  <MobileField label="담보" value={item.coverage_type} />
                  <MobileField
                    label="연식/칼라"
                    value={`${item.car_year || "-"} / ${item.color_code || "-"}`}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRelease(item)}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                  >
                    출고
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkRegister(item.work_name)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    작업등록
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className="hidden bg-white text-slate-900 print:block"
        style={{
          width: "190mm",
          minHeight: "275mm",
          padding: "7mm",
        }}
      >
        <div className="mb-4 flex items-end justify-between border-b border-slate-900 pb-3">
          <div>
            <h1 className="text-2xl font-bold">출고리스트</h1>
            <p className="mt-1 text-xs text-slate-600">출력일: {today}</p>
          </div>
          <div className="text-right text-xs text-slate-700">
            <div>전체 {summary.total}대</div>
            <div>지연 {summary.delayed}대 / 오늘 {summary.todayRelease}대</div>
          </div>
        </div>

        <ReleaseTable
          items={filteredItems}
          today={today}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          onRelease={handleRelease}
          onOpenWork={openWorkRegister}
          showActions={false}
          printMode
        />
      </section>
    </div>
  );
}

function ReleaseTable({
  items,
  today,
  sortField,
  sortOrder,
  onSort,
  onRelease,
  onOpenWork,
  showActions,
  printMode = false,
}: {
  items: ReleaseItem[];
  today: string;
  sortField: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  onRelease: (item: ReleaseItem) => void;
  onOpenWork: (workName: string) => void;
  showActions: boolean;
  printMode?: boolean;
}) {
  return (
    <table className={`w-full border-collapse ${printMode ? "text-[10px]" : "min-w-[1180px] text-sm"}`}>
      <thead>
        <tr className="bg-slate-100 text-xs text-slate-700">
          <SortableHeader field="work_name" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>작명</SortableHeader>
          <SortableHeader field="car_number" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>차량번호</SortableHeader>
          <SortableHeader field="car_model" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>차량명</SortableHeader>
          <SortableHeader field="inbound_date" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>입고일</SortableHeader>
          <SortableHeader field="outbound_date" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>출고예정일</SortableHeader>
          <SortableHeader field="delay_days" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>지연일수</SortableHeader>
          <SortableHeader field="insurance_display" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>보험사</SortableHeader>
          <SortableHeader field="manager_display" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>담당자</SortableHeader>
          <SortableHeader field="coverage_type" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>담보</SortableHeader>
          <SortableHeader field="car_year" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>차량연식</SortableHeader>
          <SortableHeader field="color_code" sortField={sortField} sortOrder={sortOrder} onSort={onSort}>칼라코드</SortableHeader>
          {showActions && <HeaderCell>관리</HeaderCell>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const delay = delayDays(item, today);

          return (
            <tr key={item.id} className={`${rowTone(item, today)} hover:bg-yellow-50`}>
              <BodyCell className="font-semibold">{displayValue(item.work_name)}</BodyCell>
              <BodyCell>{displayValue(item.car_number)}</BodyCell>
              <BodyCell>{displayValue(item.car_model)}</BodyCell>
              <BodyCell>{displayValue(item.inbound_date)}</BodyCell>
              <BodyCell>{displayValue(item.outbound_date)}</BodyCell>
              <BodyCell>
                {delay > 0 ? `${delay}일` : item.outbound_date === today ? "오늘" : "-"}
              </BodyCell>
              <BodyCell>{displayValue(insuranceName(item))}</BodyCell>
              <BodyCell>{displayValue(managerName(item))}</BodyCell>
              <BodyCell>{displayValue(item.coverage_type)}</BodyCell>
              <BodyCell>{displayValue(item.car_year)}</BodyCell>
              <BodyCell>{displayValue(item.color_code)}</BodyCell>
              {showActions && (
                <BodyCell>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void onRelease(item)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      출고
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWork(item.work_name)}
                      className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      작업등록
                    </button>
                  </div>
                </BodyCell>
              )}
            </tr>
          );
        })}

        {items.length === 0 && (
          <tr>
            <td
              colSpan={showActions ? 12 : 11}
              className="border border-slate-200 px-3 py-10 text-center text-slate-500"
            >
              표시할 출고 예정 차량이 없습니다.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SortableHeader({
  field,
  sortField,
  sortOrder,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortOrder: "asc" | "desc";
  onSort: (field: SortField) => void;
  children: ReactNode;
}) {
  const active = sortField === field;

  return (
    <th className="border border-slate-200 px-2 py-2 text-left">
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex w-full items-center justify-between gap-1 font-semibold"
      >
        <span>{children}</span>
        <span className={active ? "text-blue-600" : "text-slate-400"}>
          {active ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function SummaryCard({
  title,
  value,
  className,
}: {
  title: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="border border-slate-200 px-2 py-2 text-left">{children}</th>;
}

function BodyCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`border border-slate-200 px-2 py-2 ${className}`}>{children}</td>;
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 p-2">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}
