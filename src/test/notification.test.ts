import { describe, expect, it } from "vitest";
import { buildParseNotice, NOTICE_AUTO_DISMISS_MS } from "../notifications";
import type { ParsedInput } from "../parser/input";

const parsed = (overrides: Partial<ParsedInput>): ParsedInput => ({
  source: "none",
  tables: [],
  relationships: [],
  diagnostics: [],
  shouldPreservePreviousGraph: true,
  ...overrides,
});

describe("buildParseNotice", () => {
  it("treats empty input as an auto-dismissed warning", () => {
    const notice = buildParseNotice(
      parsed({
        diagnostics: [
          {
            code: "empty-input",
            severity: "warning",
            message: "Input is empty.",
          },
        ],
      }),
      "Input is empty.",
    );

    expect(notice.kind).toBe("warning");
    expect(notice.title).toBe("解析提醒");
    expect(notice.message).toBe("Input is empty.");
    expect(notice.autoDismissMs).toBe(NOTICE_AUTO_DISMISS_MS);
  });

  it("treats partial SQL support as an auto-dismissed warning", () => {
    const notice = buildParseNotice(
      parsed({
        tables: [{ name: "users", columns: [], primaryKeys: [], foreignKeys: [] }],
        shouldPreservePreviousGraph: false,
        diagnostics: [
          {
            code: "unsupported-statement",
            severity: "info",
            message: "Statement was skipped.",
          },
        ],
      }),
      "Statement was skipped.",
    );

    expect(notice.kind).toBe("warning");
    expect(notice.title).toBe("已生成，部分语句未解析");
    expect(notice.autoDismissMs).toBe(NOTICE_AUTO_DISMISS_MS);
  });

  it("treats failed parsing with no valid tables as a persistent error", () => {
    const notice = buildParseNotice(
      parsed({
        diagnostics: [
          {
            code: "malformed-create-table",
            severity: "warning",
            message: "CREATE TABLE statement was skipped.",
          },
        ],
      }),
      "CREATE TABLE statement was skipped.",
    );

    expect(notice.kind).toBe("error");
    expect(notice.title).toBe("SQL 解析失败");
    expect(notice.autoDismissMs).toBeNull();
  });
});
