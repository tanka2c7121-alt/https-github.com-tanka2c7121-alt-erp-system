"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import {
  getApprovalRole,
  isAdminUser,
  isChiefUser,
  isDepartmentHeadUser,
  isSameDepartment,
} from "../../lib/approval";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
};

type ExpenseRequestPageProps = {
  user: LoginUser;
  isAdmin: boolean;
  onSelectMenu: (menu: MenuItem) => void;
};

type ExpenseRequest = {
  id: number;
  request_date: string;
  account: string;
  expense_type: string;
  category: string;
  vendor: string | null;
  amount: number;
  content: string;
  payment_method: string | null;
  receipt_url: string;
  memo: string | null;
  status:
    | "승인대기"
    | "부서장 승인대기"
    | "총괄관리 승인대기"
    | "관리자 승인대기"
    | "승인완료"
    | "반려";
  requested_by: string;
  requested_name: string | null;
  requested_department: string | null;
  approved_by: string | null;
  approved_name: string | null;
  approved_at: string | null;
  department_approved_by: string | null;
  department_approved_name: string | null;
  department_approved_at: string | null;
  chief_approved_by: string | null;
  chief_approved_name: string | null;
  chief_approved_at: string | null;
  final_approved_by: string | null;
  final_approved_name: string | null;
  final_approved_at: string | null;
  reject_reason: string | null;
  created_at: string | null;
};

type FormState = {
  requestDate: string;
  account: string;
  expenseType: string;
  category: string;
  vendor: string;
  amount: string;
  content: string;
  paymentMethod: string;
  memo: string;
};

type ExpenseLine = Pick<
  FormState,
  "category" | "vendor" | "amount" | "content" | "memo"
>;

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";
const receiptBucket = "expense-receipts";

const todayText = localDateText;

const normalizeAccountName = (value: string) =>
  value.trim().toUpperCase().includes("BLUE") || value.includes("블루")
    ? "BLUE POINT"
    : value;

const isPartnerSupportExpense = (
  row: Pick<ExpenseRequest, "category" | "content">
) =>
  [row.category, row.content]
    .map((value) => String(value ?? "").replace(/\s+/g, ""))
    .some((value) => value.includes("입고지원"));

const isFullUrl = (value: string) => /^https?:\/\//.test(value);

const formatRequesterName = (user: LoginUser) => {
  const department = user.department?.trim();

  return department ? `${department} / ${user.user_name}` : user.user_name;
};

const expensePendingStatuses: ExpenseRequest["status"][] = [
  "승인대기",
  "부서장 승인대기",
  "총괄관리 승인대기",
  "관리자 승인대기",
];

const defaultCategoryOptions: Record<string, string[]> = {
  고정비: [
    "임대료",
    "관리비",
    "전기료",
    "수도료",
    "인터넷",
    "직원급여",
    "4대보험",
    "직원식대",
    "세금",
    "상표료",
    "AOS프로그램사용료",
  ],
  변동비: [
    "부품대",
    "외주",
    "현장부관리비",
    "자금부관리비",
    "소모품",
    "유류비",
    "식사비",
    "식대",
    "운송비",
    "인차비",
    "공구구입비",
    "기타지출",
  ],
};

export default function ExpenseRequestPage({
  user,
  isAdmin,
  onSelectMenu,
}: ExpenseRequestPageProps) {
  const currentYear = todayText().slice(0, 4);
  const currentMonth = todayText().slice(5, 7);
  const [rows, setRows] = useState<ExpenseRequest[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listYear, setListYear] = useState(currentYear);
  const [listMonth, setListMonth] = useState(currentMonth);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<number | null>(null);
  const [categoryOptions, setCategoryOptions] = useState(defaultCategoryOptions);
  const [expenseLines, setExpenseLines] = useState<ExpenseLine[]>([]);
  const approvalRole = getApprovalRole(user);
  const [form, setForm] = useState<FormState>({
    requestDate: todayText(),
    account: "",
    expenseType: "변동비",
    category: "",
    vendor: "",
    amount: "",
    content: "",
    paymentMethod: "",
    memo: "",
  });

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("expense_requests")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("지출결의서 조회 실패: " + error.message);
      return;
    }

    const nextRows = ((data ?? []) as ExpenseRequest[]).map((row) => ({ ...row }));
    const receiptPaths = nextRows
      .map((row) => row.receipt_url)
      .filter((url) => url && !isFullUrl(url));

    if (receiptPaths.length > 0) {
      const { data: signedUrls } = await supabase.storage
        .from(receiptBucket)
        .createSignedUrls(receiptPaths, 60 * 60);

      receiptPaths.forEach((path, index) => {
        const target = nextRows.find((row) => row.receipt_url === path);

        if (target && signedUrls?.[index]?.signedUrl) {
          target.receipt_url = signedUrls[index].signedUrl;
        }
      });
    }

    setRows(nextRows);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const loadCategoryOptions = async () => {
      const { data, error } = await supabase
        .from("daily_cash_categories")
        .select("type, name")
        .eq("is_active", true)
        .in("type", ["고정비", "변동비"])
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error || !data || data.length === 0) {
        setCategoryOptions(defaultCategoryOptions);
        return;
      }

      const nextOptions: Record<string, string[]> = {
        고정비: [],
        변동비: [],
      };

      data.forEach((row: any) => {
        const type = String(row.type ?? "").trim();
        const name = String(row.name ?? "").trim();

        if (!name || !(type in nextOptions)) return;
        nextOptions[type] = [...nextOptions[type], name];
      });

      setCategoryOptions({
        고정비: nextOptions.고정비.length
          ? nextOptions.고정비
          : defaultCategoryOptions.고정비,
        변동비: nextOptions.변동비.length
          ? nextOptions.변동비
          : defaultCategoryOptions.변동비,
      });
    };

    void loadCategoryOptions();
  }, []);

  const selectedCategoryOptions = useMemo(() => {
    const options = categoryOptions[form.expenseType] || [];

    if (form.category && !options.includes(form.category)) {
      return [form.category, ...options];
    }

    return options;
  }, [categoryOptions, form.category, form.expenseType]);

  const yearOptions = useMemo(() => {
    const years = new Set([currentYear]);

    rows.forEach((row) => {
      const year = row.request_date?.slice(0, 4);

      if (/^\d{4}$/.test(year)) {
        years.add(year);
      }
    });

    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [currentYear, rows]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const selectedMonthPrefix = `${listYear}-${listMonth}`;

    return rows
      .filter((row) => {
        if (approvalRole === "관리자") return true;
        if (
          approvalRole === "총괄관리" &&
          (row.status === "총괄관리 승인대기" ||
            (row.status === "부서장 승인대기" &&
              row.requested_department === "관리부"))
        ) {
          return true;
        }
        if (
          approvalRole === "부서장" &&
          row.status === "부서장 승인대기" &&
          row.requested_department === user.department
        ) {
          return true;
        }

        return row.requested_by === user.user_id;
      })
      .filter((row) => row.request_date?.startsWith(selectedMonthPrefix))
      .filter((row) => !statusFilter || row.status === statusFilter)
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.request_date,
          row.account,
          row.expense_type,
          row.category,
          row.vendor ?? "",
          row.content,
          row.requested_name ?? "",
          row.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [approvalRole, listMonth, listYear, rows, searchText, statusFilter, user]);

  const pendingCount = rows.filter((row) =>
    expensePendingStatuses.includes(row.status)
  ).length;
  const approvedTotal = visibleRows
    .filter((row) => row.status === "승인완료")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      requestDate: todayText(),
      account: "",
      expenseType: "변동비",
      category: "",
      vendor: "",
      amount: "",
      content: "",
      paymentMethod: "",
      memo: "",
    });
    setExpenseLines([]);
    setReceiptFile(null);
    setEditingRequestId(null);
  };

  const clearLineFields = () => {
    setForm((prev) => ({
      ...prev,
      category: "",
      vendor: "",
      amount: "",
      content: "",
      memo: "",
    }));
  };

  const addExpenseLine = () => {
    const amount = Number(form.amount.replaceAll(",", "") || 0);

    if (!form.category || !form.content || amount <= 0) {
      alert("분류, 내용, 금액을 입력한 뒤 목록에 추가해주세요.");
      return;
    }

    setExpenseLines((prev) => [
      ...prev,
      {
        category: form.category,
        vendor: form.vendor,
        amount: form.amount,
        content: form.content,
        memo: form.memo,
      },
    ]);
    clearLineFields();
  };

  const removeExpenseLine = (index: number) => {
    setExpenseLines((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const uploadReceipt = async (requestId: number) => {
    if (!receiptFile) {
      throw new Error("영수증 사진을 첨부하세요.");
    }

    const extension = receiptFile.name.split(".").pop() || "jpg";
    const filePath = `${requestId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from(receiptBucket)
      .upload(filePath, receiptFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw new Error(error.message);
    }

    return filePath;
  };

  const handleSubmit = async () => {
    const amount = Number(form.amount.replaceAll(",", "") || 0);
    const nextStatus: ExpenseRequest["status"] =
      approvalRole === "관리자" || approvalRole === "총괄관리"
        ? "관리자 승인대기"
        : approvalRole === "부서장"
          ? "총괄관리 승인대기"
          : "부서장 승인대기";

    if (editingRequestId !== null) {
      if (!form.requestDate || !form.account || !form.expenseType || !form.category) {
        alert("사용일자, 계정, 구분, 분류를 입력해주세요.");
        return;
      }

      if (!form.content || amount <= 0) {
        alert("내용과 금액을 입력해주세요.");
        return;
      }

      setSaving(true);

      const updatePayload: Partial<ExpenseRequest> = {
        request_date: form.requestDate,
        account: normalizeAccountName(form.account),
        expense_type: form.expenseType,
        category: form.category,
        vendor: form.vendor,
        amount,
        content: form.content,
        payment_method: form.paymentMethod,
        memo: form.memo,
        status: nextStatus,
        requested_name: formatRequesterName(user),
        requested_department: user.department ?? "",
        approved_by: null,
        approved_name: null,
        approved_at: null,
        department_approved_by: null,
        department_approved_name: null,
        department_approved_at: null,
        chief_approved_by: null,
        chief_approved_name: null,
        chief_approved_at: null,
        final_approved_by: null,
        final_approved_name: null,
        final_approved_at: null,
        reject_reason: null,
      };

      const { error } = await supabase
        .from("expense_requests")
        .update(updatePayload)
        .eq("id", editingRequestId)
        .eq("requested_by", user.user_id)
        .eq("status", "반려");

      if (error) {
        setSaving(false);
        alert("지출결의서 수정 신청 실패: " + error.message);
        return;
      }

      if (receiptFile) {
        try {
          const receiptUrl = await uploadReceipt(editingRequestId);
          const { error: updateError } = await supabase
            .from("expense_requests")
            .update({ receipt_url: receiptUrl })
            .eq("id", editingRequestId);

          if (updateError) {
            throw new Error(updateError.message);
          }
        } catch (uploadError) {
          setSaving(false);
          alert(
            "영수증 저장 실패: " +
              (uploadError instanceof Error ? uploadError.message : "업로드 오류")
          );
          return;
        }
      }

      setSaving(false);
      alert("지출결의서가 수정되어 다시 신청되었습니다.");
      resetForm();
      void loadRows();
      return;
    }

    if (expenseLines.length > 0) {
      if (!form.requestDate || !form.account || !form.expenseType) {
        alert("사용일자, 계정, 구분을 입력해주세요.");
        return;
      }

      setSaving(true);

      const { data, error } = await supabase
        .from("expense_requests")
        .insert(
          expenseLines.map((line) => ({
            request_date: form.requestDate,
            account: normalizeAccountName(form.account),
            expense_type: form.expenseType,
            category: line.category,
            vendor: line.vendor,
            amount: Number(line.amount.replaceAll(",", "") || 0),
            content: line.content,
            payment_method: form.paymentMethod,
            receipt_url: "",
            memo: line.memo,
            status: nextStatus,
            requested_by: user.user_id,
            requested_name: formatRequesterName(user),
            requested_department: user.department ?? "",
          }))
        )
        .select("id");

      if (error || !data || data.length === 0) {
        setSaving(false);
        alert("지출결의서 신청 실패: " + (error?.message ?? "저장 오류"));
        return;
      }

      if (receiptFile) {
        try {
          const receiptUrl = await uploadReceipt(data[0].id);
          const { error: updateError } = await supabase
            .from("expense_requests")
            .update({ receipt_url: receiptUrl })
            .in(
              "id",
              data.map((row) => row.id)
            );

          if (updateError) {
            throw new Error(updateError.message);
          }
        } catch (uploadError) {
          setSaving(false);
          alert(
            "영수증 저장 실패: " +
              (uploadError instanceof Error ? uploadError.message : "업로드 오류")
          );
          return;
        }
      }

      setSaving(false);
      alert(`지출결의서 ${data.length}건이 신청되었습니다.`);
      resetForm();
      void loadRows();
      return;
    }

    if (!form.requestDate || !form.account || !form.expenseType || !form.category) {
      alert("사용일자, 계정, 구분, 분류를 입력해주세요.");
      return;
    }

    if (!form.content || amount <= 0) {
      alert("내용과 금액을 입력해주세요.");
      return;
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("expense_requests")
      .insert({
        request_date: form.requestDate,
        account: normalizeAccountName(form.account),
        expense_type: form.expenseType,
        category: form.category,
        vendor: form.vendor,
        amount,
        content: form.content,
        payment_method: form.paymentMethod,
        receipt_url: "",
        memo: form.memo,
        status: nextStatus,
        requested_by: user.user_id,
        requested_name: formatRequesterName(user),
        requested_department: user.department ?? "",
      })
      .select("id")
      .single();

    if (error || !data) {
      setSaving(false);
      alert("지출결의서 신청 실패: " + (error?.message ?? "저장 오류"));
      return;
    }

    if (receiptFile) {
      try {
        const receiptUrl = await uploadReceipt(data.id);
        const { error: updateError } = await supabase
          .from("expense_requests")
          .update({ receipt_url: receiptUrl })
          .eq("id", data.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      } catch (uploadError) {
        setSaving(false);
        alert(
          "영수증 저장 실패: " +
            (uploadError instanceof Error ? uploadError.message : "업로드 오류")
        );
        return;
      }
    }

    setSaving(false);
    alert("지출결의서가 신청되었습니다.");
    resetForm();
    void loadRows();
  };

  const canApproveRequest = (row: ExpenseRequest) => {
    if (isAdminUser(user)) {
      return ["승인대기", "관리자 승인대기"].includes(row.status);
    }

    if (isChiefUser(user)) {
      return (
        row.requested_by !== user.user_id &&
        (row.status === "총괄관리 승인대기" ||
          (row.status === "부서장 승인대기" &&
            row.requested_department === "관리부"))
      );
    }

    return (
      isDepartmentHeadUser(user) &&
      row.status === "부서장 승인대기" &&
      row.requested_by !== user.user_id &&
      isSameDepartment(user, row.requested_department)
    );
  };

  const approveRequest = async (row: ExpenseRequest) => {
    if (!canApproveRequest(row)) {
      alert("현재 단계의 승인 권한이 없습니다.");
      return;
    }

    const isFinalApproval = isAdminUser(user);
    const approvedAt = new Date().toISOString();

    if (
      !confirm(
        isFinalApproval
          ? "이 지출결의서를 승인하고 일일입출금에 반영할까요?"
          : "이 지출결의서를 총괄관리 승인 후 관리자 단계로 넘길까요?"
      )
    ) {
      return;
    }

    if (!isFinalApproval) {
      const nextStatus =
        row.status === "부서장 승인대기"
          ? "총괄관리 승인대기"
          : "관리자 승인대기";
      const stagePayload =
        row.status === "부서장 승인대기"
          ? {
              department_approved_by: user.user_id,
              department_approved_name: user.user_name,
              department_approved_at: approvedAt,
            }
          : {
              chief_approved_by: user.user_id,
              chief_approved_name: user.user_name,
              chief_approved_at: approvedAt,
            };
      const { error } = await supabase
        .from("expense_requests")
        .update({
          status: nextStatus,
          ...stagePayload,
          reject_reason: null,
        })
        .eq("id", row.id);

      if (error) {
        alert("승인 처리 실패: " + error.message);
        return;
      }

      alert("다음 단계로 승인하였습니다.");
      void loadRows();
      return;
    }

    const sourceName = `expense-request-${row.id}`;
    const today = localDateText();

    const { data: existingCashRows, error: existingCashError } = await supabase
      .from("daily_cash")
      .select("id, created_on")
      .eq("source_type", "expense_request")
      .eq("source_work_name", sourceName);

    if (existingCashError) {
      alert("기존 일일입출금 확인 실패: " + existingCashError.message);
      return;
    }

    const hasPastCashRows = (existingCashRows ?? []).some(
      (cashRow: any) => cashRow.created_on !== today
    );
    const hasTodayCashRows = (existingCashRows ?? []).some(
      (cashRow: any) => cashRow.created_on === today
    );

    if (hasPastCashRows) {
      alert(
        "이미 이전 입력일에 일일입출금으로 반영된 지출결의서입니다. 금일 일일입출금에 다시 반영하지 않습니다."
      );
      return;
    }

    if (hasTodayCashRows) {
      const confirmed = confirm(
        "오늘 일일입출금에 이미 반영된 지출결의서입니다. 기존 오늘 반영분을 삭제하고 다시 반영할까요?"
      );

      if (!confirmed) return;
    }

    const { error: cleanupCashError } = await supabase
      .from("daily_cash")
      .delete()
      .eq("source_type", "expense_request")
      .eq("source_work_name", sourceName)
      .eq("created_on", today);

    if (cleanupCashError) {
      alert("기존 일일입출금 정리 실패: " + cleanupCashError.message);
      return;
    }

    if (!isPartnerSupportExpense(row)) {
      const { error: cashError } = await supabase.from("daily_cash").insert({
        date: row.request_date,
        created_on: today,
        account: normalizeAccountName(row.account),
        type: row.expense_type,
        category: row.category,
        content: row.vendor ? `${row.vendor} - ${row.content}` : row.content,
        income: 0,
        expense: Number(row.amount || 0),
        memo: row.memo,
        source_type: "expense_request",
        source_work_name: sourceName,
      });

      if (cashError) {
        alert("일일입출금 반영 실패: " + cashError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("expense_requests")
      .update({
        status: "승인완료",
        approved_by: user.user_id,
        approved_name: user.user_name,
        approved_at: approvedAt,
        final_approved_by: user.user_id,
        final_approved_name: user.user_name,
        final_approved_at: approvedAt,
        reject_reason: null,
      })
      .eq("id", row.id);

    if (error) {
      alert("승인 처리 실패: " + error.message);
      return;
    }

    alert("승인하였습니다.");
    void loadRows();
  };

  const rejectRequest = async (row: ExpenseRequest) => {
    if (!canApproveRequest(row)) {
      alert("현재 단계의 반려 권한이 없습니다.");
      return;
    }

    const reason = prompt("반려 사유를 입력하세요.");

    if (reason === null) {
      return;
    }

    const { error } = await supabase
      .from("expense_requests")
      .update({
        status: "반려",
        approved_by: user.user_id,
        approved_name: user.user_name,
        approved_at: new Date().toISOString(),
        reject_reason: reason,
      })
      .eq("id", row.id);

    if (error) {
      alert("반려 처리 실패: " + error.message);
      return;
    }

    alert("반려하였습니다.");
    void loadRows();
  };

  const canDeleteRequest = (row: ExpenseRequest) =>
    isAdmin || (row.requested_by === user.user_id && row.status !== "승인완료");

  const canEditRequest = (row: ExpenseRequest) =>
    row.requested_by === user.user_id && row.status === "반려";

  const editRequest = (row: ExpenseRequest) => {
    if (!canEditRequest(row)) {
      alert("반려된 본인 신청만 수정할 수 있습니다.");
      return;
    }

    setEditingRequestId(row.id);
    setExpenseLines([]);
    setReceiptFile(null);
    setForm({
      requestDate: row.request_date,
      account: row.account,
      expenseType: row.expense_type,
      category: row.category,
      vendor: row.vendor ?? "",
      amount: String(row.amount ?? ""),
      content: row.content,
      paymentMethod: row.payment_method ?? "",
      memo: row.memo ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRequest = async (row: ExpenseRequest) => {
    if (!canDeleteRequest(row)) {
      alert("삭제 권한이 없습니다.");
      return;
    }

    if (!confirm("이 지출결의서를 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) {
      return;
    }

    if (row.status === "승인완료") {
      const { error: cashError } = await supabase
        .from("daily_cash")
        .delete()
        .eq("source_type", "expense_request")
        .eq("source_work_name", `expense-request-${row.id}`);

      if (cashError) {
        alert("연결된 일일입출금 삭제 실패: " + cashError.message);
        return;
      }
    }

    const { data, error } = await supabase
      .from("expense_requests")
      .delete()
      .eq("id", row.id)
      .select("id")
      .maybeSingle();

    if (error) {
      alert("지출결의서 삭제 실패: " + error.message);
      return;
    }

    if (!data) {
      alert("삭제 권한이 없거나 이미 삭제된 지출결의서입니다.");
      return;
    }

    alert("삭제되었습니다.");
    void loadRows();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-bold">지출결의서</h3>
          <p className="text-sm text-slate-600">
            직원이 영수증을 첨부해 신청하고, 관리자가 승인하는 화면입니다.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Badge label="승인대기" value={pendingCount} tone="orange" />
          <Badge label="승인합계" value={`₩${approvedTotal.toLocaleString()}`} tone="blue" />
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-4 font-bold text-slate-900">
          {editingRequestId === null ? "신청 작성" : "반려 건 수정"}
        </h4>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="사용일자">
            <input
              type="date"
              className={inputClass}
              value={form.requestDate}
              onChange={(event) => handleChange("requestDate", event.target.value)}
            />
          </Field>

          <Field label="계정">
            <select
              className={inputClass}
              value={form.account}
              onChange={(event) => handleChange("account", event.target.value)}
            >
              <option value="">선택</option>
              <option>국민은행</option>
              <option>부산은행</option>
              <option>법인1층</option>
              <option>현금</option>
              <option>카드</option>
              <option>BLUE POINT</option>
            </select>
          </Field>

          <Field label="구분">
            <select
              className={inputClass}
              value={form.expenseType}
              onChange={(event) => {
                handleChange("expenseType", event.target.value);
                handleChange("category", "");
              }}
            >
              <option>고정비</option>
              <option>변동비</option>
            </select>
          </Field>

          <Field label="분류">
            <select
              className={inputClass}
              value={form.category}
              onChange={(event) => handleChange("category", event.target.value)}
            >
              <option value="">선택</option>
              {selectedCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="사용처">
            <input
              className={inputClass}
              placeholder="예: 부품상사"
              value={form.vendor}
              onChange={(event) => handleChange("vendor", event.target.value)}
            />
          </Field>

          <Field label="금액">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="0"
              value={form.amount}
              onChange={(event) => {
                const rawValue = event.target.value.replaceAll(",", "");

                if (!/^\d*$/.test(rawValue)) {
                  return;
                }

                handleChange(
                  "amount",
                  rawValue ? Number(rawValue).toLocaleString() : ""
                );
              }}
            />
          </Field>

          <Field label="결제수단">
            <input
              className={inputClass}
              placeholder="예: 카드 / 현금 / 계좌"
              value={form.paymentMethod}
              onChange={(event) =>
                handleChange("paymentMethod", event.target.value)
              }
            />
          </Field>

          <Field label="영수증 사진">
            <input
              className={inputClass}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="내용">
            <input
              className={inputClass}
              placeholder="지출 내용을 입력하세요"
              value={form.content}
              onChange={(event) => handleChange("content", event.target.value)}
            />
          </Field>

          <Field label="비고">
            <input
              className={inputClass}
              placeholder="필요 시 입력"
              value={form.memo}
              onChange={(event) => handleChange("memo", event.target.value)}
            />
          </Field>
        </div>

        {editingRequestId === null && expenseLines.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-200 px-2 py-2 text-left">
                    분류
                  </th>
                  <th className="border border-slate-200 px-2 py-2 text-left">
                    사용처
                  </th>
                  <th className="border border-slate-200 px-2 py-2 text-left">
                    내용
                  </th>
                  <th className="border border-slate-200 px-2 py-2 text-right">
                    금액
                  </th>
                  <th className="border border-slate-200 px-2 py-2">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenseLines.map((line, index) => (
                  <tr key={`${line.category}-${line.content}-${index}`}>
                    <td className="border border-slate-200 px-2 py-2">
                      {line.category}
                    </td>
                    <td className="border border-slate-200 px-2 py-2">
                      {line.vendor || "-"}
                    </td>
                    <td className="border border-slate-200 px-2 py-2">
                      <div className="font-semibold">{line.content}</div>
                      {line.memo && (
                        <div className="text-xs text-slate-500">{line.memo}</div>
                      )}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-right font-bold">
                      {Number(
                        line.amount.replaceAll(",", "") || 0
                      ).toLocaleString()}
                    </td>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeExpenseLine(index)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 font-bold text-blue-700">
                  <td className="border border-slate-200 px-2 py-2" colSpan={3}>
                    합계
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-right">
                    {expenseLines
                      .reduce(
                        (sum, line) =>
                          sum + Number(line.amount.replaceAll(",", "") || 0),
                        0
                      )
                      .toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={addExpenseLine}
            disabled={editingRequestId !== null}
            className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            목록에 추가
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving
              ? editingRequestId === null
                ? "신청 중..."
                : "수정 신청 중..."
              : editingRequestId === null
                ? expenseLines.length > 0
                  ? `${expenseLines.length}건 신청`
                  : "신청"
                : "수정 후 재신청"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h4 className="font-bold text-slate-900">
            {isAdmin ? "지출결의서 목록" : "내 신청 목록"}
          </h4>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={listYear}
              onChange={(event) => setListYear(event.target.value)}
              aria-label="조회 연도"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={listMonth}
              onChange={(event) => setListMonth(event.target.value)}
              aria-label="조회 월"
            >
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">전체 상태</option>
              <option>승인대기</option>
              <option>부서장 승인대기</option>
              <option>총괄관리 승인대기</option>
              <option>관리자 승인대기</option>
              <option>승인완료</option>
              <option>반려</option>
            </select>

            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              placeholder="사용처 / 내용 / 작성자 검색"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <ExpenseTable
            rows={visibleRows}
            showApprovalColumn={approvalRole !== "직원"}
            canApprove={canApproveRequest}
            onApprove={approveRequest}
            onReject={rejectRequest}
            canEdit={canEditRequest}
            onEdit={editRequest}
            canDelete={canDeleteRequest}
            onDelete={deleteRequest}
            onPrint={(row) =>
              onSelectMenu({
                id: "documents-expense-request-print",
                title: "지출결의서 출력",
                data: { expenseRequest: row },
              })
            }
          />
        </div>

        <MobileExpenseCards
          rows={visibleRows}
          canApprove={canApproveRequest}
          onApprove={approveRequest}
          onReject={rejectRequest}
          canEdit={canEditRequest}
          onEdit={editRequest}
          canDelete={canDeleteRequest}
          onDelete={deleteRequest}
          onPrint={(row) =>
            onSelectMenu({
              id: "documents-expense-request-print",
              title: "지출결의서 출력",
              data: { expenseRequest: row },
            })
          }
        />
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={labelClass}>
      {label}
      {children}
    </label>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "orange" | "blue";
}) {
  const toneClass =
    tone === "orange"
      ? "bg-orange-50 text-orange-700"
      : "bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-lg px-3 py-2 font-bold ${toneClass}`}>
      {label}: {value}
    </div>
  );
}

function StatusBadge({ status }: { status: ExpenseRequest["status"] }) {
  const className =
    status === "승인완료"
      ? "bg-green-100 text-green-700"
      : status === "반려"
        ? "bg-red-100 text-red-700"
        : "bg-orange-100 text-orange-700";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}

function ExpenseTable({
  rows,
  showApprovalColumn,
  canApprove,
  onApprove,
  onReject,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  onPrint,
}: {
  rows: ExpenseRequest[];
  showApprovalColumn: boolean;
  canApprove: (row: ExpenseRequest) => boolean;
  onApprove: (row: ExpenseRequest) => void;
  onReject: (row: ExpenseRequest) => void;
  canEdit: (row: ExpenseRequest) => boolean;
  onEdit: (row: ExpenseRequest) => void;
  canDelete: (row: ExpenseRequest) => boolean;
  onDelete: (row: ExpenseRequest) => void;
  onPrint: (row: ExpenseRequest) => void;
}) {
  const showManageColumn =
    showApprovalColumn || rows.some(canEdit) || rows.some(canDelete);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-slate-100 text-left text-slate-700">
          <th className="border border-slate-200 px-3 py-2">상태</th>
          <th className="border border-slate-200 px-3 py-2">작성자</th>
          <th className="border border-slate-200 px-3 py-2">사용일자</th>
          <th className="border border-slate-200 px-3 py-2">계정</th>
          <th className="border border-slate-200 px-3 py-2">분류</th>
          <th className="border border-slate-200 px-3 py-2">사용처/내용</th>
          <th className="border border-slate-200 px-3 py-2 text-right">금액</th>
          <th className="border border-slate-200 px-3 py-2 text-center">영수증</th>
          <th className="border border-slate-200 px-3 py-2 text-center">출력</th>
          {showManageColumn && (
            <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
          )}
        </tr>
      </thead>

      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={showManageColumn ? 10 : 9}
              className="border border-slate-200 px-3 py-8 text-center text-slate-500"
            >
              등록된 지출결의서가 없습니다.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="border border-slate-200 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-200"
                  title="지출결의서 내용 보기"
                >
                  <StatusBadge status={row.status} />
                </button>
              </td>
              <td className="border border-slate-200 px-3 py-2">
                {row.requested_name ?? row.requested_by}
              </td>
              <td className="border border-slate-200 px-3 py-2">
                {row.request_date}
              </td>
              <td className="border border-slate-200 px-3 py-2">{row.account}</td>
              <td className="border border-slate-200 px-3 py-2">
                {row.expense_type} / {row.category}
              </td>
              <td className="border border-slate-200 px-3 py-2">
                <div className="font-semibold">{row.vendor ?? "-"}</div>
                <div className="text-xs text-slate-500">{row.content}</div>
              </td>
              <td className="border border-slate-200 px-3 py-2 text-right font-semibold">
                ₩{Number(row.amount || 0).toLocaleString()}
              </td>
              <td className="border border-slate-200 px-3 py-2 text-center">
            {row.receipt_url ? (
              <a
                href={row.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                보기
              </a>
            ) : (
              <span className="text-xs text-slate-400">없음</span>
            )}
              </td>
              <td className="border border-slate-200 px-3 py-2 text-center">
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  출력
                </button>
              </td>
              {showManageColumn && (
                <td className="border border-slate-200 px-3 py-2 text-center">
                  <div className="flex justify-center gap-2">
                    {canApprove(row) && (
                      <>
                      <button
                        type="button"
                        onClick={() => onApprove(row)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(row)}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        반려
                      </button>
                      </>
                    )}
                    {canEdit(row) && (
                      <button
                        type="button"
                        onClick={() => onEdit(row)}
                        className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                      >
                        수정
                      </button>
                    )}
                    {canDelete(row) && (
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    )}
                    {!canApprove(row) && !canEdit(row) && !canDelete(row) && (
                    <span className="text-xs text-slate-400">
                      {row.approved_name ?? "-"}
                    </span>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function MobileExpenseCards({
  rows,
  canApprove,
  onApprove,
  onReject,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
  onPrint,
}: {
  rows: ExpenseRequest[];
  canApprove: (row: ExpenseRequest) => boolean;
  onApprove: (row: ExpenseRequest) => void;
  onReject: (row: ExpenseRequest) => void;
  canEdit: (row: ExpenseRequest) => boolean;
  onEdit: (row: ExpenseRequest) => void;
  canDelete: (row: ExpenseRequest) => boolean;
  onDelete: (row: ExpenseRequest) => void;
  onPrint: (row: ExpenseRequest) => void;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500">
          등록된 지출결의서가 없습니다.
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => onPrint(row)}
                  className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-200"
                  title="지출결의서 내용 보기"
                >
                  <StatusBadge status={row.status} />
                </button>
                <div className="mt-2 text-lg font-bold">
                  ₩{Number(row.amount || 0).toLocaleString()}
                </div>
                <div className="text-sm text-slate-500">
                  {row.request_date} / {row.requested_name ?? row.requested_by}
                </div>
              </div>
              {row.receipt_url ? (
                <a
                  href={row.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  영수증
                </a>
              ) : (
                <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400">
                  영수증 없음
                </span>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-bold">{row.vendor ?? "-"}</div>
              <div className="mt-1 text-slate-600">{row.content}</div>
              <div className="mt-2 text-xs text-slate-500">
                {row.account} / {row.expense_type} / {row.category}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onPrint(row)}
              className="mt-3 w-full rounded-lg border border-blue-300 py-2 text-sm font-semibold text-blue-600"
            >
              출력
            </button>

            {canEdit(row) && (
              <button
                type="button"
                onClick={() => onEdit(row)}
                className="mt-2 w-full rounded-lg border border-blue-300 py-2 text-sm font-semibold text-blue-600"
              >
                수정
              </button>
            )}

            {canDelete(row) && (
              <button
                type="button"
                onClick={() => onDelete(row)}
                className="mt-2 w-full rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600"
              >
                삭제
              </button>
            )}

            {canApprove(row) && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(row)}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white"
                >
                  승인
                </button>
                <button
                  type="button"
                  onClick={() => onReject(row)}
                  className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600"
                >
                  반려
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
