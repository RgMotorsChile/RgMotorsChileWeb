import { describe, it, expect } from "vitest";
import { formatRut, validateRut } from "./rut";

describe("rut validation and formatting", () => {
  it("formats chilean RUT properly", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
    expect(formatRut("111111111")).toBe("11.111.111-1");
  });

  it("validates valid and invalid RUTs", () => {
    expect(validateRut("11.111.111-1")).toBe(true);
    expect(validateRut("12.345.678-5")).toBe(true);
    expect(validateRut("12.345.678-0")).toBe(false);
  });
});
