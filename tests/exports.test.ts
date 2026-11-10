import { describe, expect, it } from "vitest";
import { versCsv } from "@/lib/export-csv";

describe("CSV pour Excel en français", () => {
  it("BOM, point-virgule, virgule décimale, guillemets", () => {
    const csv = versCsv(["Produit", "Prix", "Écart"], [["Cookie; « duo »", 35.5, -1], ['Flan "maison"', 45, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Produit;Prix;Écart", '"Cookie; « duo »";35,50;-1', '"Flan ""maison""";45;', ""]);
  });
});
