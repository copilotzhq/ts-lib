/** Scalar predicates deliberately avoid string/number coercion. */
export type CollectionPredicateValue = string | number | boolean | null;
export type CollectionPredicate =
  | Readonly<{ and: readonly CollectionPredicate[] }>
  | Readonly<{ or: readonly CollectionPredicate[] }>
  | Readonly<{ not: CollectionPredicate }>
  | (
    & Readonly<{ field: string }>
    & (
      | Readonly<{ eq: CollectionPredicateValue }>
      | Readonly<{ ne: CollectionPredicateValue }>
      | Readonly<{ in: readonly CollectionPredicateValue[] }>
      | Readonly<{ lt: string | number }>
      | Readonly<{ lte: string | number }>
      | Readonly<{ gt: string | number }>
      | Readonly<{ gte: string | number }>
      | Readonly<{ exists: boolean }>
      | Readonly<{ isNull: boolean }>
      | Readonly<{ isBlank: boolean }>
      | Readonly<{ trimEq: string }>
      | Readonly<{ overlaps: readonly CollectionPredicateValue[] }>
    )
  );

const MAX_DEPTH = 16;
const MAX_NODES = 256;
const MAX_VALUES = 1000;
// ECMAScript String.trim whitespace, including BOM and Unicode separators.
const BLANK_CHARACTERS =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

/** Compile a bounded, two-valued predicate; all caller values are parameters. */
export function compileCollectionPredicate(
  input: CollectionPredicate,
  params: unknown[],
): string {
  let nodes = 0;
  let values = 0;
  const parameter = (value: unknown) => `$${params.push(value)}`;
  const scalar = (value: unknown): CollectionPredicateValue => {
    if (
      value === null || typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number" && Number.isFinite(value)
    ) return value;
    throw new TypeError("Predicate values must be finite JSON scalars.");
  };
  const visit = (input: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
      throw new TypeError(
        "Collection predicate exceeds its depth or node limit.",
      );
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("Collection predicate must be an object.");
    }
    const node = input as Record<string, unknown>;
    const keys = Object.keys(node);
    const logical = keys.find((key) => ["and", "or", "not"].includes(key));
    if (logical) {
      if (keys.length !== 1) {
        throw new TypeError("Logical predicates accept exactly one operator.");
      }
      if (logical === "not") return `(NOT ${visit(node.not, depth + 1)})`;
      const children = node[logical];
      if (!Array.isArray(children) || children.length > MAX_NODES) {
        throw new TypeError("Logical predicates require a bounded array.");
      }
      return `(${
        Array.from(children, (child) => visit(child, depth + 1)).join(
          logical === "and" ? " AND " : " OR ",
        ) || (logical === "and" ? "TRUE" : "FALSE")
      })`;
    }
    if (
      keys.length !== 2 || !Object.hasOwn(node, "field") ||
      typeof node.field !== "string"
    ) {
      throw new TypeError(
        "Field predicates require a field and exactly one operator.",
      );
    }
    const field = node.field;
    if (
      field.length > 256 ||
      !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field)
    ) throw new TypeError(`Invalid predicate field '${field}'.`);
    const columns: Record<string, string> = {
      id: "id",
      namespace: "namespace",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };
    const column = Object.hasOwn(columns, field) ? columns[field] : undefined;
    const timestamp = field === "createdAt" || field === "updatedAt";
    const json = column
      ? `to_jsonb(${column})`
      : `(data #> '{${field.split(".").join(",")}}')`;
    const text = column ?? `(data #>> '{${field.split(".").join(",")}}')`;
    const op = keys.find((key) => key !== "field")!;
    const value = node[op];
    values += Array.isArray(value) ? value.length : 1;
    if (values > MAX_VALUES) {
      throw new TypeError("Collection predicate exceeds its value limit.");
    }
    const equality = (raw: unknown) => {
      const value = scalar(raw);
      if (column) {
        if (value === null || typeof value !== "string") return "FALSE";
        return `COALESCE(${column} = ${parameter(value)}${
          timestamp ? "::timestamptz" : "::text"
        }, FALSE)`;
      }
      return `COALESCE(${json} = ${
        parameter(JSON.stringify(value))
      }::jsonb, FALSE)`;
    };
    if (op === "trimEq") {
      if (typeof value !== "string") {
        throw new TypeError("trimEq requires a string.");
      }
      return `(COALESCE(jsonb_typeof(${json}) = 'string' AND btrim(${text}::text, ${
        parameter(BLANK_CHARACTERS)
      }) = ${parameter(value)}, FALSE))`;
    }
    if (op === "eq") return `(${equality(value)})`;
    if (op === "ne") return `(NOT (${equality(value)}))`;
    if (op === "in" || op === "overlaps") {
      if (!Array.isArray(value) || value.length > MAX_VALUES) {
        throw new TypeError(
          `${op} requires at most ${MAX_VALUES} scalar values.`,
        );
      }
      for (const entry of value) scalar(entry);
      if (op === "in") {
        return `(${value.map(equality).join(" OR ") || "FALSE"})`;
      }
      const matches = value.map((entry) =>
        `${json} @> ${parameter(JSON.stringify([entry]))}::jsonb`
      ).join(" OR ") || "FALSE";
      return `(COALESCE(jsonb_typeof(${json}) = 'array' AND (${matches}), FALSE))`;
    }
    if (["exists", "isNull", "isBlank"].includes(op)) {
      if (typeof value !== "boolean") {
        throw new TypeError(`${op} requires a boolean.`);
      }
      const expression = op === "exists"
        ? `${json} IS NOT NULL`
        : op === "isNull"
        ? `COALESCE(${json} = 'null'::jsonb, FALSE)`
        : `COALESCE(jsonb_typeof(${json}) = 'string' AND btrim(${text}::text, ${
          parameter(BLANK_CHARACTERS)
        }) = '', FALSE)`;
      return `(${value ? expression : `NOT (${expression})`})`;
    }
    const comparisons: Record<string, string> = {
      lt: "<",
      lte: "<=",
      gt: ">",
      gte: ">=",
    };
    const comparison = Object.hasOwn(comparisons, op)
      ? comparisons[op]
      : undefined;
    if (!comparison) {
      throw new TypeError(`Unknown collection predicate operator '${op}'.`);
    }
    if (
      typeof value !== "string" &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new TypeError(
        "Range predicates require a string or finite number.",
      );
    }
    if (column) {
      if (typeof value !== "string") {
        throw new TypeError(
          "Record identity and timestamp ranges require strings.",
        );
      }
      return `(COALESCE(${column} ${comparison} ${parameter(value)}${
        timestamp ? "::timestamptz" : "::text"
      }, FALSE))`;
    }
    return `(COALESCE(jsonb_typeof(${json}) = '${
      typeof value === "number" ? "number" : "string"
    }' AND ${json} ${comparison} ${
      parameter(JSON.stringify(value))
    }::jsonb, FALSE))`;
  };
  return visit(input, 1);
}
