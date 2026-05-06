import type { ParsedInput } from "./parser/input";

export type NoticeKind = "warning" | "error";

export interface NoticeDraft {
  kind: NoticeKind;
  title: string;
  message: string;
  autoDismissMs: number | null;
}

export interface AppNotice extends NoticeDraft {
  id: number;
}

export interface ParseNoticeLabels {
  emptyTitle: string;
  partialTitle: string;
  errorTitle: string;
}

export const NOTICE_AUTO_DISMISS_MS = 5200;

const DEFAULT_PARSE_NOTICE_LABELS: ParseNoticeLabels = {
  emptyTitle: "解析提醒",
  partialTitle: "已生成，部分语句未解析",
  errorTitle: "SQL 解析失败",
};

export const buildParseNotice = (
  result: ParsedInput,
  message: string,
  labels: ParseNoticeLabels = DEFAULT_PARSE_NOTICE_LABELS,
): NoticeDraft => {
  const hasTables = result.tables.length > 0;
  const isEmptyInput = result.diagnostics.some((d) => d.code === "empty-input");

  if (hasTables) {
    return {
      kind: "warning",
      title: labels.partialTitle,
      message,
      autoDismissMs: NOTICE_AUTO_DISMISS_MS,
    };
  }

  if (isEmptyInput) {
    return {
      kind: "warning",
      title: labels.emptyTitle,
      message,
      autoDismissMs: NOTICE_AUTO_DISMISS_MS,
    };
  }

  return {
    kind: "error",
    title: labels.errorTitle,
    message,
    autoDismissMs: null,
  };
};

export const buildErrorNotice = (message: string, title = "操作失败"): NoticeDraft => ({
  kind: "error",
  title,
  message,
  autoDismissMs: null,
});
