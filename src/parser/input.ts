import type { ParseDiagnostic, ParseResult } from "../types";
import { parseDBML } from "./dbml";
import { parseSQLTables } from "./sql";

export type ParseSource = "sql" | "dbml" | "none";

export interface ParsedInput extends ParseResult {
  source: ParseSource;
  diagnostics: ParseDiagnostic[];
  shouldPreservePreviousGraph: boolean;
}

const diagnosticsOf = (result: ParseResult): ParseDiagnostic[] => result.diagnostics ?? [];

export const parseInputText = (text: string): ParsedInput => {
  const sqlResult = parseSQLTables(text);
  if (sqlResult.tables.length > 0) {
    return {
      ...sqlResult,
      source: "sql",
      diagnostics: diagnosticsOf(sqlResult),
      shouldPreservePreviousGraph: false,
    };
  }

  const sqlDiagnostics = diagnosticsOf(sqlResult);
  const hasEmptyInput = sqlDiagnostics.some((d) => d.code === "empty-input");
  if (hasEmptyInput) {
    return {
      tables: [],
      relationships: [],
      source: "none",
      diagnostics: sqlDiagnostics,
      shouldPreservePreviousGraph: true,
    };
  }

  const dbmlResult = parseDBML(text);
  if (dbmlResult.tables.length > 0) {
    return {
      ...dbmlResult,
      source: "dbml",
      diagnostics: diagnosticsOf(dbmlResult),
      shouldPreservePreviousGraph: false,
    };
  }

  return {
    tables: [],
    relationships: [],
    source: "none",
    diagnostics: [...sqlDiagnostics, ...diagnosticsOf(dbmlResult)],
    shouldPreservePreviousGraph: true,
  };
};

export const buildParseDiagnosticMessage = (result: ParsedInput, fallback: string): string => {
  const diagnostic =
    result.diagnostics.find((d) => d.severity === "error") ??
    result.diagnostics.find((d) => d.code === "unsupported-statement") ??
    result.diagnostics.find((d) => d.severity === "warning") ??
    result.diagnostics[0];
  return diagnostic?.message || fallback;
};
