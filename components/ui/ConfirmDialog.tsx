"use client";

import { ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "danger" | "success";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  loading = false,
}: ConfirmDialogProps) {
  const iconMap = {
    primary: <HelpCircle size={24} className="text-[var(--color-primary)]" />,
    danger: <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" />,
    success: <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />,
  };

  const buttonVariant = variant === "danger" ? "danger" : "primary";

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      maxWidth="420px"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            size="sm"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            size="sm"
            variant={buttonVariant}
            onClick={onConfirm}
            disabled={loading}
            className={variant === "success" ? "bg-emerald-600 hover:bg-emerald-700 font-bold" : "font-bold"}
          >
            {loading && <Loader2 size={13} className="animate-spin mr-1" />}
            {confirmText}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 py-1">
        <div className="p-2 rounded-full bg-[var(--surface-2)] shrink-0 mt-0.5">
          {iconMap[variant]}
        </div>
        <div className="text-xs text-[var(--text)] leading-relaxed space-y-1">
          {typeof message === "string" ? <p className="m-0 font-medium">{message}</p> : message}
        </div>
      </div>
    </Modal>
  );
}
