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

    const activeOrders = workOrders.filter((item) => !item.release_date);
    const todayInbound = workOrders.filter((item) => item.inbound_date === today);
    const thisMonthInbound = workOrders.filter((item) =>
      item.work_name?.startsWith(thisMonth)
    );
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

    return {
      today,
      activeOrders,
      todayInbound,
      thisMonthInbound,
      todayOutbound,
      thisMonthOutbound,
      delayedOrders,
      dueTodayOrders,
      recentInbound: [...activeOrders]
        .sort((a, b) => String(b.inbound_date).localeCompare(String(a.inbound_date)))
        .slice(0, 8),
      thisMonthInboundRows: [...thisMonthInbound]
        .sort((a, b) => String(b.inbound_date).localeCompare(String(a.inbound_date)))
        .slice(0, 8),
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

        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="현재 입고" value={dashboard.activeOrders.length} tone="blue" />
        <SummaryCard title="오늘 입고" value={dashboard.todayInbound.length} tone="slate" />
        <SummaryCard title="오늘 출고" value={dashboard.todayOutbound.length} tone="green" />
        <SummaryCard title="출고 지연" value={dashboard.delayedOrders.length} tone="red" />
        <SummaryCard title="이번 달 출고" value={dashboard.thisMonthOutbound.length} tone="indigo" />
        <SummaryCard title="해당월 입고" value={dashboard.thisMonthInbound.length} tone="orange" />
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

          <DashboardTable
            title="최근 입고 차량"
            rows={dashboard.recentInbound}
            emptyText="진행중인 입고 차량이 없습니다."
            badgeText={(row) =>
              row.inbound_date
                ? `${daysBetween(row.inbound_date, dashboard.today)}일 경과`
                : "진행중"
            }
            badgeClass="bg-blue-100 text-blue-700"
            onOpen={openWork}
          />

          <DashboardTable
            title="해당월 입고 차량"
            rows={dashboard.thisMonthInboundRows}
            emptyText="해당월 입고 차량이 없습니다."
            badgeText={(row) =>
              row.work_name
                ? `${Number(row.work_name.slice(5, 7))}월 작명`
                : "입고"
            }
            badgeClass="bg-orange-100 text-orange-700"
            onOpen={openWork}
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
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
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value.toLocaleString()}</p>
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
