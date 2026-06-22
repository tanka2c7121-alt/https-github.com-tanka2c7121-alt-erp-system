"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type FactoryDashboardPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrder = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  category: string;
  insurance_company: string;
  manager_name: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
};

const todayText = localDateText;
const currentWorkMonth = (orders: WorkOrder[]) => {
  const calendarMonth = todayText().slice(0, 7);
  const workMonths = orders
    .map((item) => item.work_name?.slice(0, 7) ?? "")
    .filter((month) => /^\d{4}-\d{2}$/.test(month));

  if (workMonths.includes(calendarMonth)) {
    return calendarMonth;
  }

  return [...workMonths].sort().pop() ?? calendarMonth;
};

const daysBetween = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(
    0,
    Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  );
};

const daysInMonth = (monthText: string) => {
  const [year, month] = monthText.split("-").map(Number);

  if (!year || !month) {
    return 31;
  }

  return new Date(year, month, 0).getDate();
};

const getVehicleKey = (
  order: Pick<WorkOrder, "work_name" | "car_number" | "car_model">
) => {
  const carNumber = String(order.car_number ?? "").trim();
  const carModel = String(order.car_model ?? "").trim();

  return carNumber || [order.work_name, carModel].filter(Boolean).join("|");
};

export default function FactoryDashboardPage({
  onSelectMenu,
}: FactoryDashboardPageProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const { data: orders, error: ordersError } = await supabase
      .from("work_orders")
      .select(
        "id, work_name, car_number, car_model, category, insurance_company, manager_name, inbound_date, outbound_date, release_date"
      )
      .order("id", { ascending: false });

    setLoading(false);

    if (ordersError) {
      alert("공장현황 조회 실패: " + ordersError.message);
      return;
    }

    setWorkOrders(
      (orders ?? []).map((item) => ({
        id: item.id,
        work_name: item.work_name ?? "",
        car_number: item.car_number ?? "",
        car_model: item.car_model ?? "",
        category: item.category ?? "",
        insurance_company: item.insurance_company ?? "",
        manager_name: item.manager_name ?? "",
        inbound_date: item.inbound_date ?? "",
        outbound_date: item.outbound_date ?? "",
        release_date: item.release_date ?? "",
      }))
    );
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const dashboard = useMemo(() => {
    const today = todayText();
    const thisMonth = currentWorkMonth(workOrders);
    const monthDays = daysInMonth(thisMonth);

    const activeOrders = workOrders.filter((item) => !item.release_date);
    const todayInbound = workOrders.filter((item) => item.inbound_date === today);
    const thisMonthInbound = workOrders.filter((item) =>
      item.inbound_date?.startsWith(thisMonth)
    );
    const thisMonthInboundVehicleCount = new Set(
      thisMonthInbound.map(getVehicleKey).filter(Boolean)
    ).size;
    const thisMonthRoIssuedCount = workOrders.filter((item) =>
      item.work_name?.startsWith(thisMonth)
    ).length;
    const todayOutbound = workOrders.filter((item) => item.release_date === today);
    const thisMonthOutbound = workOrders.filter((item) =>
      item.release_date?.startsWith(thisMonth)
    );
    const delayedOrders = activeOrders.filter(
      (item) => item.outbound_date && item.outbound_date < today
    );
    const dueTodayOrders = activeOrders.filter(
      (item) => item.outbound_date === today
    );
    const dailyFlowRows = Array.from({ length: monthDays }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const date = `${thisMonth}-${day}`;

      return {
        date,
        day,
        inbound: workOrders.filter((item) => item.inbound_date === date).length,
        outbound: workOrders.filter((item) => item.release_date === date).length,
      };
    });

    return {
      today,
      thisMonth,
      activeOrders,
      todayInbound,
      thisMonthInbound,
      thisMonthInboundVehicleCount,
      thisMonthRoIssuedCount,
      todayOutbound,
      thisMonthOutbound,
      delayedOrders,
      dueTodayOrders,
      dailyFlowRows,
    };
  }, [workOrders]);

  const openWork = (workName: string) => {
    onSelectMenu({
      id: "factory-work-register",
      title: "작업등록",
      data: { workName },
    });
  };

  const handleReleaseToday = async (row: WorkOrder) => {
    const ok = window.confirm(`${row.car_number} 차량을 오늘 출고 처리할까요?`);

    if (!ok) {
      return;
    }

    const { error } = await supabase
      .from("work_orders")
      .update({ release_date: todayText() })
      .eq("id", row.id);

    if (error) {
      alert("출고 처리 실패: " + error.message);
      return;
    }

    await loadDashboard();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">공장현황</h3>
          <p className="text-sm text-slate-700">
            현재 입고, 오늘 출고 예정, 지연 차량을 한눈에 확인합니다.
          </p>
        </div>

      </div>

      <section className="grid grid-cols-6 gap-1.5 md:grid-cols-3 md:gap-3 xl:grid-cols-6">
        <SummaryCard title="현재 입고" value={dashboard.activeOrders.length} tone="blue" />
        <SummaryCard title="오늘 입고" value={dashboard.todayInbound.length} tone="slate" />
        <SummaryCard title="오늘 출고" value={dashboard.todayOutbound.length} tone="green" />
        <SummaryCard title="출고 지연" value={dashboard.delayedOrders.length} tone="red" />
        <SummaryCard title="이번 달 출고" value={dashboard.thisMonthOutbound.length} tone="indigo" />
        <SummaryCard
          title="해당월입고/RO발행건수"
          value={`${dashboard.thisMonthInboundVehicleCount}/${dashboard.thisMonthRoIssuedCount}`}
          tone="orange"
        />
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          공장현황을 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <DashboardTable
            title="오늘 출고 예정 차량"
            rows={dashboard.dueTodayOrders}
            emptyText="오늘 출고 예정 차량이 없습니다."
            badgeText="출고"
            badgeClass="bg-green-600 text-white hover:bg-green-700"
            onOpen={openWork}
            onBadgeClick={handleReleaseToday}
          />

          <DashboardTable
            title="출고 지연 차량"
            rows={dashboard.delayedOrders}
            emptyText="출고 지연 차량이 없습니다."
            badgeText={(row) =>
              `${daysBetween(row.outbound_date, dashboard.today)}일 지연`
            }
            badgeClass="bg-red-100 text-red-700"
            onOpen={openWork}
          />

          <DailyFlowChart
            month={dashboard.thisMonth}
            rows={dashboard.dailyFlowRows}
          />
        </div>
      )}
    </div>
  );
}

function DailyFlowChart({
  month,
  rows,
}: {
  month: string;
  rows: Array<{
    date: string;
    day: string;
    inbound: number;
    outbound: number;
  }>;
}) {
  const maxCount = Math.max(
    1,
    ...rows.map((row) => Math.max(row.inbound, row.outbound))
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold text-slate-900">일자별 입고/출고 대수</h4>
          <p className="text-xs text-slate-500">{month} 기준</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-blue-500" />
            입고
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-green-500" />
            출고
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[980px] items-end gap-2 border-b border-slate-200 pb-2">
          {rows.map((row) => {
            const inboundHeight = Math.max(4, (row.inbound / maxCount) * 150);
            const outboundHeight = Math.max(4, (row.outbound / maxCount) * 150);
            const hasCount = row.inbound > 0 || row.outbound > 0;

            return (
              <div key={row.date} className="flex min-w-7 flex-1 flex-col items-center gap-1">
                <div className="flex h-40 items-end gap-1">
                  <div
                    title={`${row.date} 입고 ${row.inbound}대`}
                    className={[
                      "w-3 rounded-t bg-blue-500",
                      row.inbound === 0 ? "opacity-20" : "",
                    ].join(" ")}
                    style={{ height: `${inboundHeight}px` }}
                  />
                  <div
                    title={`${row.date} 출고 ${row.outbound}대`}
                    className={[
                      "w-3 rounded-t bg-green-500",
                      row.outbound === 0 ? "opacity-20" : "",
                    ].join(" ")}
                    style={{ height: `${outboundHeight}px` }}
                  />
                </div>
                <div className="h-8 text-center text-[10px] leading-tight text-slate-500">
                  <div className={hasCount ? "font-bold text-slate-800" : ""}>{Number(row.day)}</div>
                  {hasCount && (
                    <div>
                      {row.inbound}/{row.outbound}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number | string;
  tone: "blue" | "green" | "red" | "orange" | "indigo" | "slate";
}) {
  const toneClass = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-green-700 bg-green-50 border-green-100",
    red: "text-red-700 bg-red-50 border-red-100",
    orange: "text-orange-700 bg-orange-50 border-orange-100",
    indigo: "text-indigo-700 bg-indigo-50 border-indigo-100",
    slate: "text-slate-700 bg-slate-50 border-slate-200",
  }[tone];

  return (
    <div className={`rounded-xl border p-2 text-center md:p-4 md:text-left ${toneClass}`}>
      <p className="break-keep text-[10px] font-semibold leading-tight md:text-sm">
        {title}
      </p>
      <p className="mt-1 text-lg font-bold md:mt-3 md:text-3xl">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function DashboardTable({
  title,
  rows,
  emptyText,
  badgeText,
  badgeClass,
  onOpen,
  onBadgeClick,
}: {
  title: string;
  rows: WorkOrder[];
  emptyText: string;
  badgeText: string | ((row: WorkOrder) => string);
  badgeClass: string;
  onOpen: (workName: string) => void;
  onBadgeClick?: (row: WorkOrder) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">{title}</h4>
        <span className="text-xs text-slate-500">{rows.length}건</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-xs text-slate-700">
              <th className="border border-slate-200 px-2 py-2 text-left">작명</th>
              <th className="border border-slate-200 px-2 py-2 text-left">차량</th>
              <th className="border border-slate-200 px-2 py-2 text-left">입고일</th>
              <th className="border border-slate-200 px-2 py-2 text-left">출고예정</th>
              <th className="border border-slate-200 px-2 py-2 text-center">상태</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border border-slate-200 px-3 py-8 text-center text-sm text-slate-500"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${title}-${row.id}`}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => onOpen(row.work_name)}
                >
                  <td className="border border-slate-200 px-2 py-2 font-semibold">
                    {row.work_name}
                  </td>
                  <td className="border border-slate-200 px-2 py-2">
                    <div>{row.car_number}</div>
                    <div className="text-xs text-slate-500">{row.car_model}</div>
                  </td>
                  <td className="border border-slate-200 px-2 py-2">
                    {row.inbound_date}
                  </td>
                  <td className="border border-slate-200 px-2 py-2">
                    {row.outbound_date}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center">
                    {onBadgeClick ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onBadgeClick(row);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}
                      >
                        {typeof badgeText === "function" ? badgeText(row) : badgeText}
                      </button>
                    ) : (
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${badgeClass}`}>
                        {typeof badgeText === "function" ? badgeText(row) : badgeText}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
