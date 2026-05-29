"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";

type HomeDashboardPageProps = {
  isAdmin: boolean;
  userName?: string;
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrder = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
};

type PendingUser = {
  id: number;
  user_id: string;
  user_name: string | null;
  department: string | null;
};

const todayText = () => new Date().toISOString().slice(0, 10);

export default function HomeDashboardPage({
  isAdmin,
  userName,
  onSelectMenu,
}: HomeDashboardPageProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const [ordersResult, userResult] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id, work_name, car_number, car_model, inbound_date, outbound_date, release_date")
        .order("id", { ascending: false }),
      isAdmin
        ? supabase
            .from("app_users")
            .select("id, user_id, user_name, department")
            .eq("is_active", false)
            .order("id", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    setLoading(false);

    if (ordersResult.error) {
      alert("업무 홈 조회 실패: " + ordersResult.error.message);
      return;
    }

    setWorkOrders((ordersResult.data ?? []) as WorkOrder[]);
    setPendingUsers((userResult.data ?? []) as PendingUser[]);
  }, [isAdmin]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const dashboard = useMemo(() => {
    const today = todayText();
    const thisMonth = today.slice(0, 7);
    const activeOrders = workOrders.filter((item) => !item.release_date);
    const todayInbound = workOrders.filter((item) => item.inbound_date === today);
    const todayOutbound = workOrders.filter((item) => item.release_date === today);
    const thisMonthOutbound = workOrders.filter((item) =>
      item.release_date?.startsWith(thisMonth)
    );

    return {
      activeOrders,
      todayInbound,
      todayOutbound,
      thisMonthOutbound,
      recentInbound: [...activeOrders]
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

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">업무 홈</h3>
          <p className="text-sm text-slate-600">
            {userName ? `${userName}님, 오늘도 안전하게 작업하세요.` : "오늘의 현장 업무를 확인합니다."}
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

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard title="현재 입고" value={dashboard.activeOrders.length} tone="blue" />
        <SummaryCard title="오늘 입고" value={dashboard.todayInbound.length} tone="green" />
        <SummaryCard title="오늘 출고" value={dashboard.todayOutbound.length} tone="indigo" />
        <SummaryCard title="이번 달 출고" value={dashboard.thisMonthOutbound.length} tone="slate" />
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          업무 홈을 불러오는 중입니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <QuickActions isAdmin={isAdmin} onSelectMenu={onSelectMenu} />

          {isAdmin && (
            <PendingUserList
              rows={pendingUsers.slice(0, 8)}
              onOpenManage={() =>
                onSelectMenu({
                  id: "employee-manage",
                  title: "직원관리",
                })
              }
            />
          )}

          <RecentInboundList rows={dashboard.recentInbound} onOpen={openWork} />

          <NoticePanel />
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
  value: number | string;
  tone: "blue" | "green" | "indigo" | "slate";
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-green-100 bg-green-50 text-green-700",
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}

function QuickActions({
  isAdmin,
  onSelectMenu,
}: {
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const actions: Array<{ id: string; title: string; description: string }> = [
    { id: "factory-work-register", title: "작업등록", description: "신규 입고 차량 등록" },
    { id: "factory-inbound", title: "입고현황", description: "진행중 차량 확인" },
    { id: "factory-outbound", title: "출고현황", description: "출고 완료 차량 확인" },
    { id: "factory-work-print", title: "작업출력", description: "작업지시서 출력" },
    { id: "employee", title: "직원현황", description: "직원 및 부서 현황" },
  ];

  if (isAdmin) {
    actions.push({ id: "employee-manage", title: "직원관리", description: "직원 승인 및 계정 관리" });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">빠른 작업</h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() =>
              onSelectMenu({
                id: action.id,
                title: action.title,
              })
            }
            className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="font-bold text-slate-900">{action.title}</div>
            <div className="mt-1 text-xs text-slate-500">{action.description}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecentInboundList({
  rows,
  onOpen,
}: {
  rows: WorkOrder[];
  onOpen: (workName: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">최근 입고 차량</h4>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-slate-200 px-3 py-8 text-center text-slate-500">
                  진행중인 입고 차량이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => onOpen(row.work_name)}
                >
                  <td className="border border-slate-200 px-2 py-2 font-semibold">{row.work_name}</td>
                  <td className="border border-slate-200 px-2 py-2">
                    <div>{row.car_number}</div>
                    <div className="text-xs text-slate-500">{row.car_model}</div>
                  </td>
                  <td className="border border-slate-200 px-2 py-2">{row.inbound_date}</td>
                  <td className="border border-slate-200 px-2 py-2">{row.outbound_date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PendingUserList({
  rows,
  onOpenManage,
}: {
  rows: PendingUser[];
  onOpenManage: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-bold text-slate-900">승인대기 직원</h4>
        <button
          type="button"
          onClick={onOpenManage}
          className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          직원관리
        </button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            승인대기 직원이 없습니다.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
            >
              <div>
                <div className="font-semibold">{row.user_name ?? row.user_id}</div>
                <div className="text-xs text-slate-500">
                  {row.department ?? "-"} / {row.user_id}
                </div>
              </div>
              <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                승인대기
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function NoticePanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">업무 안내</h4>
      <div className="space-y-3 text-sm text-slate-600">
        <div className="rounded-lg bg-slate-50 p-3">
          입고 차량은 작업등록에서 먼저 등록한 뒤 작업내용을 입력하세요.
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          출고 처리는 작업등록 또는 공장현황에서 출고일을 입력하면 반영됩니다.
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          금액과 정산 정보는 정산관리 메뉴에서만 확인합니다.
        </div>
      </div>
    </section>
  );
}
