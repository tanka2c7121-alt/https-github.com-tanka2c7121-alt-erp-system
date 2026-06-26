"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";
import type { UserRole } from "../../types/roles";

type CashChangeApprovalPageProps = {
  user: {
    user_id: string;
    user_name: string;
    approval_role?: string | null;
    department?: string | null;
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

const cashChangeRealtimeTables = [{ table: "cash_change_requests" }];

const requestTypeLabel: Record<string, string> = {
  settlement_refund: "?섎텋泥섎━",
  daily_cash_posting: "誘몄닔 ?낃툑 諛섏쁺",
  daily_cash_correction: "?쇱씪?낆텧湲??섏젙",
  reopen_settlement: "?꾧껐/醫낃껐 ?댁젣",
};

const formatWon = (amount: number) => Number(amount || 0).toLocaleString();

const canApproveCashChange = (user: CashChangeApprovalPageProps["user"]) => {
  const approvalRole = String(user.approval_role ?? "");

  return user.role === "ADMIN" || approvalRole.includes("관리자");
};

const isMissingSchemaError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache")
  );
};

const saveDailyCashBySourceKey = async (payload: any) => {
  const sourceKey = String(payload?.source_key ?? "");

  if (!sourceKey) {
    return supabase.from("daily_cash").insert(payload).select("id").maybeSingle();
  }

  const { data: existingRow, error: findError } = await supabase
    .from("daily_cash")
    .select("id")
    .eq("source_key", sourceKey)
    .limit(1)
    .maybeSingle();

  if (findError) return { data: null, error: findError };

  if (existingRow?.id) {
    return supabase
      .from("daily_cash")
      .update(payload)
      .eq("id", existingRow.id)
      .select("id")
      .maybeSingle();
  }

  return supabase.from("daily_cash").insert(payload).select("id").maybeSingle();
};

export default function CashChangeApprovalPage({
  user,
}: CashChangeApprovalPageProps) {
  const [rows, setRows] = useState<CashChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const canApprove = canApproveCashChange(user);

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
          ? "?낆텧湲??뱀씤?붿껌 DB ?낅뜲?댄듃媛 ?꾩쭅 ?곸슜?섏? ?딆븯?듬땲?? supabase_cash_control_workflow.sql???ㅽ뻾??二쇱꽭??"
          : `?뱀씤?붿껌 議고쉶 ?ㅽ뙣: ${error.message}`
      );
      return;
    }

    setRows((data ?? []) as CashChangeRequest[]);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useRealtimeRefresh({
    channelName: "cash-change-approval-page",
    tables: cashChangeRealtimeTables,
    onRefresh: fetchRows,
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchRows();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [fetchRows]);

  async function approveRequest(row: CashChangeRequest) {
    if (!canApprove) {
      alert("愿由ъ옄留??뱀씤?????덉뒿?덈떎.");
      return;
    }

    const confirmed = window.confirm("???붿껌???뱀씤?좉퉴??");
    if (!confirmed) return;

    setProcessingId(row.id);

    try {
      if (
        row.request_type === "settlement_refund" ||
        row.request_type === "daily_cash_posting"
      ) {
        const dailyCashPayload = row.requested_payload?.daily_cash;

        if (!dailyCashPayload) {
          throw new Error("?쇱씪?낆텧湲?諛섏쁺 payload媛 ?놁뒿?덈떎.");
        }

        const { data: cashData, error: cashError } =
          await saveDailyCashBySourceKey(dailyCashPayload);

        if (cashError) throw cashError;

        if (row.request_type === "settlement_refund") {
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
        }
      } else if (row.request_type === "daily_cash_correction") {
        const dailyCashPayload = row.requested_payload?.daily_cash;

        if (!dailyCashPayload || !row.target_id) {
          throw new Error("?쇱씪?낆텧湲??섏젙 payload媛 ?놁뒿?덈떎.");
        }

        const { error: cashError } = await supabase
          .from("daily_cash")
          .update(dailyCashPayload)
          .eq("id", row.target_id);

        if (cashError) throw cashError;
      } else if (row.request_type === "reopen_settlement") {
        if (!row.source_work_name) {
          throw new Error("?뺤궛 ?묐챸???놁뒿?덈떎.");
        }

        const { error: settlementError } = await supabase
          .from("repair_settlements")
          .update({ progress_status: "誘멸껐" })
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
      alert("?뱀씤 泥섎━?덉뒿?덈떎.");
    } catch (error: any) {
      alert("?뱀씤 泥섎━ ?ㅽ뙣: " + (error?.message ?? String(error)));
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectRequest(row: CashChangeRequest) {
    if (!canApprove) {
      alert("愿由ъ옄留?諛섎젮?????덉뒿?덈떎.");
      return;
    }

    const reason = window.prompt("諛섎젮 ?ъ쑀瑜??낅젰?섏꽭??");
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
      alert("諛섎젮 泥섎━ ?ㅽ뙣: " + error.message);
      return;
    }

    await fetchRows();
  }

  return (
    <div className="space-y-4 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">?낆텧湲??뱀씤?붿껌</h3>
        <p className="text-sm text-slate-700">
          誘몄닔 ?낃툑 諛섏쁺, ?섎텋泥섎━, ?쇱씪?낆텧湲??섏젙, ?꾧껐/醫낃껐 ?댁젣 ?붿껌???뱀씤?⑸땲??
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {setupError && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">?뱀씤?붿껌 議고쉶瑜?以鍮꾪븷 ???놁뒿?덈떎.</p>
            <p className="mt-1">{setupError}</p>
          </div>
        )}

        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-700">
            ?뱀씤?湲?{rows.length.toLocaleString()}嫄?          </div>
          <button
            type="button"
            onClick={() => void fetchRows()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            ?덈줈怨좎묠
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-3 py-2">요청일</th>
                <th className="border border-slate-300 px-3 py-2">援щ텇</th>
                <th className="border border-slate-300 px-3 py-2">?묐챸</th>
                <th className="border border-slate-300 px-3 py-2">?댁슜</th>
                <th className="border border-slate-300 px-3 py-2">湲덉븸</th>
                <th className="border border-slate-300 px-3 py-2">요청자</th>
                <th className="border border-slate-300 px-3 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-6 text-center">
                    議고쉶 以묒엯?덈떎.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-6 text-center text-slate-500">
                    ?뱀씤 ?湲??붿껌???놁뒿?덈떎.
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
                        {requestTypeLabel[row.request_type] ?? row.request_type}
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
                            disabled={!canApprove || processingId === row.id}
                            onClick={() => void approveRequest(row)}
                            className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-400"
                          >
                            ?뱀씤
                          </button>
                          <button
                            type="button"
                            disabled={!canApprove || processingId === row.id}
                            onClick={() => void rejectRequest(row)}
                            className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400"
                          >
                            諛섎젮
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

