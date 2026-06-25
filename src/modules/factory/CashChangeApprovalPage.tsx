"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type CashChangeApprovalPageProps = {
  user: {
    user_id: string;
    user_name: string;
    role: UserRole;
  };
};

type CashChangeRequest = {
  id: number;
  request_type: string;
  status: string;
  source_work_name: string | null;
  source_detail_id: number | null;
  source_key: string | null;
  target_id: number | null;
  title: string;
  reason: string | null;
  before_payload: any;
  requested_payload: any;
  requested_name: string | null;
  requested_at: string;
};

const formatWon = (amount: number) => Number(amount || 0).toLocaleString();
const isMissingSchemaError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");

  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("cash_change_requests") ||
    message.includes("ledger_effective") ||
    message.includes("source_key") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
};

export default function CashChangeApprovalPage({
  user,
}: CashChangeApprovalPageProps) {
  const [rows, setRows] = useState<CashChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const isAdmin = user.role === "ADMIN";

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setSetupError(null);
    const { data, error } = await supabase
      .from("cash_change_requests")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: false });

    setLoading(false);

    if (error) {
      setRows([]);
      setSetupError(
        isMissingSchemaError(error)
          ? "입출금 승인요청 DB 업데이트가 아직 적용되지 않았습니다. Supabase 운영 DB는 supabase_cash_control_workflow.sql, NAS DB는 nas_cash_control_workflow.sql을 먼저 실행해 주세요."
          : `승인요청 조회 실패: ${error.message}`
      );
      return;
    }

    setRows((data ?? []) as CashChangeRequest[]);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  async function approveRequest(row: CashChangeRequest) {
    if (!isAdmin) {
      alert("관리자만 승인할 수 있습니다.");
      return;
    }

    const confirmed = window.confirm("이 요청을 승인할까요?");
    if (!confirmed) return;

    setProcessingId(row.id);

    try {
      if (row.request_type === "settlement_refund") {
        const dailyCashPayload = row.requested_payload?.daily_cash;

        if (!dailyCashPayload) {
          throw new Error("환불 일일입출금 payload가 없습니다.");
        }

        const { data: cashData, error: cashError } = await supabase
          .from("daily_cash")
          .upsert(dailyCashPayload, { onConflict: "source_key" })
          .select("id")
          .maybeSingle();

        if (cashError) throw cashError;

        const { error: paymentError } = await supabase
          .from("settlement_payments")
          .update({
            refund_requested: true,
            refund_status: "approved",
            refund_approved_at: new Date().toISOString(),
            refund_approved_by: user.user_id,
            refund_approved_name: user.user_name,
            refund_daily_cash_id: cashData?.id ?? null,
          })
          .eq("id", row.target_id);

        if (paymentError) throw paymentError;
      } else if (row.request_type === "daily_cash_correction") {
        const dailyCashPayload = row.requested_payload?.daily_cash;

        if (!dailyCashPayload || !row.target_id) {
          throw new Error("일일입출금 정정 payload가 없습니다.");
        }

        const { error: cashError } = await supabase
          .from("daily_cash")
          .update(dailyCashPayload)
          .eq("id", row.target_id);

        if (cashError) throw cashError;
      } else if (row.request_type === "reopen_settlement") {
        if (!row.source_work_name) {
          throw new Error("정산 작명이 없습니다.");
        }

        const { error: settlementError } = await supabase
          .from("repair_settlements")
          .update({ progress_status: "미결" })
          .eq("work_name", row.source_work_name);

        if (settlementError) throw settlementError;
      }

      const { error: requestError } = await supabase
        .from("cash_change_requests")
        .update({
          status: "approved",
          approved_by: user.user_id,
          approved_name: user.user_name,
          approved_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (requestError) throw requestError;

      await fetchRows();
      alert("승인 처리했습니다.");
    } catch (error: any) {
      alert("승인 처리 실패: " + (error?.message ?? String(error)));
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectRequest(row: CashChangeRequest) {
    if (!isAdmin) {
      alert("관리자만 반려할 수 있습니다.");
      return;
    }

    const reason = window.prompt("반려 사유를 입력하세요.");
    if (reason === null) return;

    setProcessingId(row.id);

    const { error } = await supabase
      .from("cash_change_requests")
      .update({
        status: "rejected",
        rejected_by: user.user_id,
        rejected_name: user.user_name,
        rejected_at: new Date().toISOString(),
        reject_reason: reason,
      })
      .eq("id", row.id);

    setProcessingId(null);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    await fetchRows();
  }

  return (
    <div className="space-y-4 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">일일입출금 승인요청</h3>
        <p className="text-sm text-slate-700">
          환불, 과거 입금 정정, 완결/종결 정산 해제 요청을 승인합니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {setupError && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">승인요청 조회를 준비할 수 없습니다.</p>
            <p className="mt-1">{setupError}</p>
            <p className="mt-2">
              SQL 파일 위치:{" "}
              <span className="font-mono">
                supabase_cash_control_workflow.sql / nas_cash_control_workflow.sql
              </span>
            </p>
          </div>
        )}

        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => void fetchRows()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            새로고침
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-3 py-2">요청일</th>
                <th className="border border-slate-300 px-3 py-2">구분</th>
                <th className="border border-slate-300 px-3 py-2">작명</th>
                <th className="border border-slate-300 px-3 py-2">내용</th>
                <th className="border border-slate-300 px-3 py-2">금액</th>
                <th className="border border-slate-300 px-3 py-2">요청자</th>
                <th className="border border-slate-300 px-3 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-6 text-center">
                    조회 중입니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-6 text-center text-slate-500">
                    승인 대기 요청이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const dailyCash = row.requested_payload?.daily_cash ?? {};
                  const amount = Number(dailyCash.income || dailyCash.expense || 0);

                  return (
                    <tr key={row.id} className="hover:bg-blue-50">
                      <td className="border border-slate-300 px-3 py-2">
                        {row.requested_at?.slice(0, 10)}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {row.request_type}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {row.source_work_name ?? ""}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        <p className="font-semibold">{row.title}</p>
                        <p className="text-xs text-slate-500">{row.reason ?? ""}</p>
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-right">
                        {amount ? formatWon(amount) : ""}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        {row.requested_name ?? ""}
                      </td>
                      <td className="border border-slate-300 px-3 py-2">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            disabled={!isAdmin || processingId === row.id}
                            onClick={() => void approveRequest(row)}
                            className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-400"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            disabled={!isAdmin || processingId === row.id}
                            onClick={() => void rejectRequest(row)}
                            className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400"
                          >
                            반려
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
