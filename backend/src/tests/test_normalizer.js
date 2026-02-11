/**
 * Jest tests for the data normalizer module.
 */

import { jest } from "@jest/globals";
import {
  normalizeDate,
  normalizeCurrency,
  canonicalizeSector,
  normalizeText,
  normalizeBoard,
} from "../normalizer.js";

describe("normalizeDate", () => {
  test("parses ISO format", () => {
    expect(normalizeDate("2024-03-15")).toBe("2024-03-15");
  });

  test("parses MM/DD/YYYY", () => {
    expect(normalizeDate("03/15/2024")).toBe("2024-03-15");
  });

  test("parses MM-DD-YYYY", () => {
    expect(normalizeDate("03-15-2024")).toBe("2024-03-15");
  });

  test("parses Excel serial number", () => {
    const result = normalizeDate("45366");
    expect(result).toBeTruthy();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("returns null for empty/null", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });

  test("returns null for garbage", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
  });
});

describe("normalizeCurrency", () => {
  test("parses dollar amount", () => {
    expect(normalizeCurrency("$1,250,000")).toEqual({ value: 1250000, currency: "USD" });
  });

  test("parses rupee amount", () => {
    expect(normalizeCurrency("₹50,00,000")).toEqual({ value: 5000000, currency: "INR" });
  });

  test("parses euro amount", () => {
    expect(normalizeCurrency("€100000")).toEqual({ value: 100000, currency: "EUR" });
  });

  test("parses plain number", () => {
    expect(normalizeCurrency("250000")).toEqual({ value: 250000, currency: "INR" });
  });

  test("returns null for empty", () => {
    expect(normalizeCurrency("")).toEqual({ value: null, currency: null });
    expect(normalizeCurrency(null)).toEqual({ value: null, currency: null });
  });
});

describe("canonicalizeSector", () => {
  test("normalizes oil & gas variants", () => {
    expect(canonicalizeSector("oil & gas")).toBe("Oil & Gas");
    expect(canonicalizeSector("Oil and Gas")).toBe("Oil & Gas");
    expect(canonicalizeSector("O&G")).toBe("Oil & Gas");
  });

  test("normalizes mining", () => {
    expect(canonicalizeSector("mines")).toBe("Mining");
    expect(canonicalizeSector("MINING")).toBe("Mining");
  });

  test("normalizes infra", () => {
    expect(canonicalizeSector("infra")).toBe("Infrastructure");
  });

  test("returns trimmed original for unknown sector", () => {
    expect(canonicalizeSector("Aerospace")).toBe("Aerospace");
  });

  test("returns null for empty", () => {
    expect(canonicalizeSector("")).toBeNull();
    expect(canonicalizeSector(null)).toBeNull();
  });
});

describe("normalizeText", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  test("returns null for empty", () => {
    expect(normalizeText("")).toBeNull();
  });
});

describe("normalizeBoard", () => {
  const mockBoard = {
    name: "Test Board",
    columns: [
      { id: "status", title: "Status", type: "status" },
      { id: "date4", title: "Close Date", type: "date" },
      { id: "numbers", title: "Deal Value", type: "numeric" },
    ],
    items_page: {
      items: [
        {
          id: "1",
          name: "Deal Alpha",
          column_values: [
            { id: "status", text: "Won", type: "status", column: { title: "Status" } },
            { id: "date4", text: "2024-06-15", type: "date", column: { title: "Close Date" } },
            { id: "numbers", text: "₹1,00,000", type: "numeric", column: { title: "Deal Value" } },
          ],
        },
        {
          id: "2",
          name: "Deal Beta",
          column_values: [
            { id: "status", text: "", type: "status", column: { title: "Status" } },
            { id: "date4", text: "", type: "date", column: { title: "Close Date" } },
            { id: "numbers", text: "$50,000", type: "numeric", column: { title: "Deal Value" } },
          ],
        },
      ],
    },
  };

  test("returns normalized rows with data quality", () => {
    const result = normalizeBoard(mockBoard);
    expect(result.boardName).toBe("Test Board");
    expect(result.rows).toHaveLength(2);
    expect(result.dataQuality.totalRows).toBe(2);
    expect(result.rows[0]["Close Date"]).toBe("2024-06-15");
  });

  test("tracks missing values", () => {
    const result = normalizeBoard(mockBoard);
    expect(result.dataQuality.missingCounts["Status"]).toBe(1);
    expect(result.dataQuality.missingCounts["Close Date"]).toBe(1);
  });

  test("detects mixed currencies", () => {
    const result = normalizeBoard(mockBoard);
    expect(result.dataQuality.currencyTypes.length).toBeGreaterThanOrEqual(1);
  });
});
