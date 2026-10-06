import { describe, expect, it } from "vitest";
import { formatCLP, vehicles } from "@/lib/vehicles";

describe("formatCLP()", () => {
  it("formatea montos en pesos chilenos", () => {
    const formatted = formatCLP(15990000);
    expect(formatted).toContain("15");
    expect(formatted).toMatch(/\$|CLP|15/);
  });
});

describe("vehicles catalog", () => {
  it("tiene al menos un vehículo con slug", () => {
    expect(vehicles.length).toBeGreaterThan(0);
    expect(vehicles[0]?.slug).toBeTruthy();
  });
});
