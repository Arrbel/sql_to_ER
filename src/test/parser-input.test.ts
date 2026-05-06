import { describe, expect, it } from "vitest";
import { buildParseDiagnosticMessage, parseInputText } from "../parser/input";

describe("parseInputText", () => {
  it("classifies empty input without falling through to DBML", () => {
    const result = parseInputText("  \n -- only a comment");

    expect(result.source).toBe("none");
    expect(result.tables).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["empty-input"]);
    expect(result.shouldPreservePreviousGraph).toBe(true);
  });

  it("keeps SQL diagnostics when SQL partially parses", () => {
    const result = parseInputText(`
      CREATE TABLE users (id INT PRIMARY KEY);
      CREATE INDEX idx_users_id ON users (id);
    `);

    expect(result.source).toBe("sql");
    expect(result.tables.map((t) => t.name)).toEqual(["users"]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["unsupported-statement"]);
    expect(result.shouldPreservePreviousGraph).toBe(false);
  });

  it("falls back to DBML when SQL has no tables and DBML parses", () => {
    const result = parseInputText(`
      Table users {
        id int [pk]
      }
    `);

    expect(result.source).toBe("dbml");
    expect(result.tables.map((t) => t.name)).toEqual(["users"]);
    expect(result.shouldPreservePreviousGraph).toBe(false);
  });

  it("combines SQL and DBML diagnostics when neither parser finds tables", () => {
    const result = parseInputText("CREATE INDEX idx_x ON x (id);");

    expect(result.source).toBe("none");
    expect(result.tables).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toContain("unsupported-statement");
    expect(result.diagnostics.map((d) => d.code)).toContain("no-supported-table");
    expect(result.shouldPreservePreviousGraph).toBe(true);
  });
});

describe("buildParseDiagnosticMessage", () => {
  it("uses the first warning or error as the user-facing parse message", () => {
    const parsed = parseInputText("CREATE INDEX idx_x ON x (id);");

    expect(buildParseDiagnosticMessage(parsed, "No valid table.")).toBe(
      "Statement was skipped because it is not a supported table, foreign key, or comment statement.",
    );
  });

  it("falls back when there are no diagnostics", () => {
    expect(
      buildParseDiagnosticMessage(
        {
          source: "none",
          tables: [],
          relationships: [],
          diagnostics: [],
          shouldPreservePreviousGraph: true,
        },
        "No valid table.",
      ),
    ).toBe("No valid table.");
  });
});
