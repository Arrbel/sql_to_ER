/**
 * SQL Parser - 解析 CREATE TABLE 语句
 */

import type {
  ParseDiagnostic,
  ParseResult,
  ParsedColumn,
  ParsedForeignKey,
  ParsedRelationship,
  ParsedTable,
} from "../types";

const IDENT = String.raw`(?:\`[^\`]+\`|"[^"]+"|\[[^\]]+\]|[\w\u4e00-\u9fa5]+)`;
const QUALIFIED_IDENT = String.raw`${IDENT}(?:\s*\.\s*${IDENT})*`;

const stripSqlComments = (src: string) => {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === quote && src[i + 1] === quote) {
          out += quote + quote;
          i += 2;
        } else if (src[i] === "\\" && quote === "'") {
          out += src[i] + (src[i + 1] || "");
          i += 2;
        } else if (src[i] === quote) {
          out += quote;
          i++;
          break;
        } else {
          out += src[i++];
        }
      }
    } else if (ch === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(src.length, i + 2);
    } else {
      out += ch;
      i++;
    }
  }
  return out;
};

const splitStatements = (sql: string) => {
  const statements: string[] = [];
  let part = "";
  let quote: string | null = null;
  let dollarTag: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        part += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        part += ch;
      }
      continue;
    }
    if (quote) {
      part += ch;
      if (ch === quote && sql[i + 1] === quote) {
        part += sql[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    const dollar = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/);
    if (dollar) {
      dollarTag = dollar[0];
      part += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      part += ch;
      continue;
    }
    if (ch === ";") {
      if (part.trim()) statements.push(part.trim());
      part = "";
      continue;
    }
    part += ch;
  }
  if (part.trim()) statements.push(part.trim());
  return statements;
};

// 拆解一个可能带 schema 前缀的标识符为各段裸名（去引号 / 去反引号 / 去方括号）。
const splitIdentifierParts = (raw: string) =>
  raw
    .split(".")
    .map((p) => p.trim().replace(/^[`"\[]|[`"\]]$/g, ""))
    .filter(Boolean);

// 仅取最末段的裸名（用于列名 —— 列名不会有 schema 前缀）。
const cleanIdentifier = (raw: string) => {
  const parts = splitIdentifierParts(raw);
  return parts[parts.length - 1] || raw.trim();
};

// 保留 schema 的限定名（用于表名与 FK 目标）：`"app"."customer"` -> `app.customer`。
// 不同 schema 下同名表才不会塌成同一个节点。
const qualifiedIdentifier = (raw: string) => {
  const parts = splitIdentifierParts(raw);
  return parts.length ? parts.join(".") : raw.trim();
};

// T-SQL 批处理分隔符 GO 单独成行时把它换成 `;`，让后续按 `;` 切分能识别两边。
// 必须在去掉块/行注释之后做，否则会误伤注释里的 GO。
const normalizeBatchSeparators = (sql: string) =>
  sql.replace(/^[\t ]*GO[\t ]*(?:\r?\n|$)/gim, ";\n");

const splitTopLevelComma = (body: string) => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote && body[i + 1] === quote) current += body[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const extractMainBody = (statement: string): { body: string; suffix: string } | null => {
  const openParenIndex = statement.indexOf("(");
  if (openParenIndex === -1) return null;
  let closeParenIndex = -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParenIndex + 1; i < statement.length; i++) {
    const ch = statement[i];
    if (quote) {
      if (ch === quote && statement[i + 1] === quote) i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) {
        closeParenIndex = i;
        break;
      }
      depth--;
    }
  }
  if (closeParenIndex === -1) return null;
  return {
    body: statement.substring(openParenIndex + 1, closeParenIndex),
    suffix: statement.substring(closeParenIndex + 1),
  };
};

// 解析 CREATE TABLE 末尾的表级 COMMENT。MySQL 写法 `... ) ENGINE=InnoDB COMMENT='xxx'`
// 或 `COMMENT 'xxx'`；PostgreSQL 用 COMMENT ON TABLE 单独语句，这里不处理。
const extractTableComment = (suffix: string): string | undefined => {
  const m = suffix.match(/\bCOMMENT\s*=?\s*'((?:[^'\\]|''|\\.)*)'/i);
  return m ? m[1].replace(/''/g, "'") : undefined;
};

const parseIdentifierList = (text: string) =>
  splitTopLevelComma(text).map((col) => cleanIdentifier(col));

const parseQualifiedIdentifierList = (text: string) =>
  splitTopLevelComma(text).map((col) => qualifiedIdentifier(col));

const parseColumnType = (rest: string) => {
  const match = rest.match(
    /\s+(?:CONSTRAINT|PRIMARY|REFERENCES|NOT|NULL|DEFAULT|UNIQUE|CHECK|COLLATE|GENERATED|COMMENT|AUTO_INCREMENT|IDENTITY)\b/i,
  );
  return (match ? rest.slice(0, match.index) : rest).trim();
};

const unescapeSqlString = (raw: string) => raw.replace(/''/g, "'");

const buildFkLabel = (columns: string[]) => columns.join(", ");

const isSingleColumnUnique = (columns: string[], table: ParsedTable) => {
  if (columns.length !== 1) return false;
  const column = columns[0];
  const found = table.columns.find((c) => c.name === column);
  return Boolean(
    found?.isUnique || (table.primaryKeys.length === 1 && table.primaryKeys[0] === column),
  );
};

const pushRelationship = (
  relationships: ParsedRelationship[],
  table: ParsedTable,
  fk: ParsedForeignKey,
) => {
  const columns = parseIdentifierList(fk.column);
  const fkCol = columns.length === 1 ? table.columns.find((c) => c.name === columns[0]) : undefined;
  const fromCardinality: "1" | "N" = isSingleColumnUnique(columns, table) ? "1" : "N";
  relationships.push({
    from: table.name,
    to: fk.referencedTable,
    label: buildFkLabel(columns),
    fromCardinality,
    toCardinality: "1",
    ...(fkCol?.comment ? { comment: fkCol.comment } : {}),
  });
};

const parseForeignKeyConstraint = (
  text: string,
): { columns: string[]; referencedTable: string; referencedColumns: string[] } | null => {
  const match = text.match(
    new RegExp(
      String.raw`(?:CONSTRAINT\s+${IDENT}\s+)?FOREIGN\s+KEY\s*\(([\s\S]*?)\)\s+REFERENCES\s+(${QUALIFIED_IDENT})\s*\(([\s\S]*?)\)`,
      "i",
    ),
  );
  if (!match) return null;
  return {
    columns: parseIdentifierList(match[1]),
    referencedTable: qualifiedIdentifier(match[2]),
    referencedColumns: parseIdentifierList(match[3]),
  };
};

export const parseSQLTables = (sql: string): ParseResult => {
  const tables: ParsedTable[] = [];
  const relationships: ParsedRelationship[] = [];
  const diagnostics: ParseDiagnostic[] = [];
  const cleanSql = normalizeBatchSeparators(stripSqlComments(sql)).trim();
  const pendingForeignKeys: Array<{
    tableName: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    statement: string;
  }> = [];
  const pendingTableComments: Array<{ tableName: string; comment: string; statement: string }> = [];
  const pendingColumnComments: Array<{
    tableName: string;
    columnName: string;
    comment: string;
    statement: string;
  }> = [];

  if (!cleanSql) {
    return {
      tables,
      relationships,
      diagnostics: [
        {
          code: "empty-input",
          severity: "warning",
          message: "Input is empty or contains only comments.",
        },
      ],
    };
  }

  splitStatements(cleanSql).forEach((statement) => {
    if (/^\s*ALTER\s+TABLE/i.test(statement)) {
      const alterMatch = statement.match(
        new RegExp(
          String.raw`^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?(${QUALIFIED_IDENT})\s+ADD\s+(?:CONSTRAINT\s+${IDENT}\s+)?FOREIGN\s+KEY\s*\(([\s\S]*?)\)\s+REFERENCES\s+(${QUALIFIED_IDENT})\s*\(([\s\S]*?)\)`,
          "i",
        ),
      );
      if (alterMatch) {
        pendingForeignKeys.push({
          tableName: qualifiedIdentifier(alterMatch[1]),
          columns: parseIdentifierList(alterMatch[2]),
          referencedTable: qualifiedIdentifier(alterMatch[3]),
          referencedColumns: parseIdentifierList(alterMatch[4]),
          statement,
        });
      } else {
        diagnostics.push({
          code: "malformed-alter-table",
          severity: "warning",
          message:
            "ALTER TABLE statement was not recognized as a supported foreign key constraint.",
          statement,
        });
      }
      return;
    }

    const commentMatch = statement.match(
      new RegExp(
        String.raw`^\s*COMMENT\s+ON\s+(TABLE|COLUMN)\s+(${QUALIFIED_IDENT})\s+IS\s+'((?:[^'\\]|''|\\.)*)'`,
        "i",
      ),
    );
    if (commentMatch) {
      const target = parseQualifiedIdentifierList(commentMatch[2])[0];
      if (commentMatch[1].toUpperCase() === "TABLE") {
        pendingTableComments.push({
          tableName: target,
          comment: unescapeSqlString(commentMatch[3]),
          statement,
        });
      } else {
        const parts = target.split(".");
        const columnName = parts.pop() || "";
        pendingColumnComments.push({
          tableName: parts.join("."),
          columnName,
          comment: unescapeSqlString(commentMatch[3]),
          statement,
        });
      }
      return;
    }

    if (!/^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE/i.test(statement)) {
      diagnostics.push({
        code: "unsupported-statement",
        severity: "info",
        message:
          "Statement was skipped because it is not a supported table, foreign key, or comment statement.",
        statement,
      });
      return;
    }

    const tableNameMatch = statement.match(
      new RegExp(
        String.raw`CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${QUALIFIED_IDENT})`,
        "i",
      ),
    );
    if (!tableNameMatch) {
      diagnostics.push({
        code: "malformed-create-table",
        severity: "warning",
        message: "CREATE TABLE statement was skipped because the table name could not be parsed.",
        statement,
      });
      return;
    }
    const tableName = qualifiedIdentifier(tableNameMatch[1]);

    // PostgreSQL 分区子表（`PARTITION OF parent ...`）不是独立实体 —— 它的列、PK、
    // FK 都继承自父表。强行解析会得到一个空节点漂在图上，干扰阅读。
    if (/\bPARTITION\s+OF\b/i.test(statement)) return;

    const extracted = extractMainBody(statement);
    if (!extracted) {
      diagnostics.push({
        code: "malformed-create-table",
        severity: "warning",
        message: "CREATE TABLE statement was skipped because its column body could not be parsed.",
        statement,
      });
      return;
    }
    const tableBody = extracted.body;
    const tableComment = extractTableComment(extracted.suffix);

    const columns: ParsedColumn[] = [];
    const primaryKeys: string[] = [];
    const foreignKeys: ParsedForeignKey[] = [];

    splitTopLevelComma(tableBody).forEach((part) => {
      const trimmedPart = part.trim().replace(/,\s*$/, "");
      if (!trimmedPart) return;

      const pkMatch = trimmedPart.match(
        new RegExp(String.raw`^(?:CONSTRAINT\s+${IDENT}\s+)?PRIMARY\s+KEY\s*\((.*)\)`, "i"),
      );
      if (pkMatch) {
        primaryKeys.push(...parseIdentifierList(pkMatch[1]));
        return;
      }

      const fkConstraint = parseForeignKeyConstraint(trimmedPart);
      if (fkConstraint) {
        foreignKeys.push({
          column: buildFkLabel(fkConstraint.columns),
          referencedTable: fkConstraint.referencedTable,
          referencedColumn: buildFkLabel(fkConstraint.referencedColumns),
        });
        return;
      }

      const uniqueMatch = trimmedPart.match(
        new RegExp(
          String.raw`^(?:CONSTRAINT\s+${IDENT}\s+)?UNIQUE(?:\s+(?:KEY|INDEX)\s+${IDENT})?\s*\(([\s\S]*?)\)`,
          "i",
        ),
      );
      if (uniqueMatch) {
        const uniqueCols = parseIdentifierList(uniqueMatch[1]);
        if (uniqueCols.length === 1) {
          const found = columns.find((c) => c.name === uniqueCols[0]);
          if (found) found.isUnique = true;
        }
        return;
      }

      if (/^(?:UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?(?:KEY|INDEX)\s+/i.test(trimmedPart)) return;
      if (/^CONSTRAINT\s+/i.test(trimmedPart)) return;
      if (/^CHECK\s*\(/i.test(trimmedPart)) return;

      const columnMatch = trimmedPart.match(new RegExp(String.raw`^(${IDENT})\s+([\s\S]+)$`, "i"));
      if (!columnMatch) return;

      const columnName = cleanIdentifier(columnMatch[1]);
      const rest = columnMatch[2].trim();
      const dataType = parseColumnType(rest);
      const isPrimaryKey = /PRIMARY\s+KEY/i.test(rest);
      if (isPrimaryKey) primaryKeys.push(columnName);
      // 内联 UNIQUE 约束（不与 PRIMARY KEY 等价 —— PK 自动唯一，但这里只看
      // 显式 UNIQUE，用于后面的 1:1 推断）。
      const isUnique = /\bUNIQUE\b/i.test(rest) && !isPrimaryKey;

      const commentMatch = rest.match(/COMMENT\s+'((?:[^'\\]|''|\\.)*)'/i);
      const comment = commentMatch ? commentMatch[1].replace(/''/g, "'") : "";

      const inlineRef = rest.match(
        new RegExp(String.raw`REFERENCES\s+(${QUALIFIED_IDENT})\s*\(\s*(${IDENT})\s*\)`, "i"),
      );
      if (inlineRef) {
        foreignKeys.push({
          column: columnName,
          referencedTable: qualifiedIdentifier(inlineRef[1]),
          referencedColumn: cleanIdentifier(inlineRef[2]),
        });
      }

      const col: ParsedColumn = {
        name: columnName,
        type: dataType,
        isPrimaryKey,
        comment,
      };
      if (isUnique) col.isUnique = true;
      columns.push(col);
    });

    tables.push({
      name: tableName,
      columns,
      primaryKeys,
      foreignKeys,
      ...(tableComment ? { comment: tableComment } : {}),
    });

    foreignKeys.forEach((fk) => pushRelationship(relationships, tables[tables.length - 1], fk));
  });

  const tableByName = new Map(tables.map((t) => [t.name, t]));

  pendingTableComments.forEach(({ tableName, comment, statement }) => {
    const table = tableByName.get(tableName);
    if (table) table.comment = comment;
    else
      diagnostics.push({
        code: "malformed-comment",
        severity: "warning",
        message: `COMMENT ON TABLE target was not found: ${tableName}.`,
        statement,
      });
  });

  pendingColumnComments.forEach(({ tableName, columnName, comment, statement }) => {
    const table = tableByName.get(tableName);
    const column = table?.columns.find((c) => c.name === columnName);
    if (column) column.comment = comment;
    else
      diagnostics.push({
        code: "malformed-comment",
        severity: "warning",
        message: `COMMENT ON COLUMN target was not found: ${tableName}.${columnName}.`,
        statement,
      });
  });

  pendingForeignKeys.forEach(
    ({ tableName, columns, referencedTable, referencedColumns, statement }) => {
      const table = tableByName.get(tableName);
      if (!table) {
        diagnostics.push({
          code: "malformed-alter-table",
          severity: "warning",
          message: `ALTER TABLE foreign key target table was not found: ${tableName}.`,
          statement,
        });
        return;
      }
      const fk: ParsedForeignKey = {
        column: buildFkLabel(columns),
        referencedTable,
        referencedColumn: buildFkLabel(referencedColumns),
      };
      table.foreignKeys.push(fk);
      pushRelationship(relationships, table, fk);
    },
  );

  if (tables.length === 0) {
    diagnostics.push({
      code: "no-supported-table",
      severity: "warning",
      message: "No supported CREATE TABLE statements were found.",
    });
  }

  return {
    tables,
    relationships,
    ...(diagnostics.length ? { diagnostics } : {}),
  };
};
