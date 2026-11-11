import { describe, expect, it } from "vitest";
import {
  CATALOG_AUTOMATION_DISABLED,
  CATALOG_AUTOMATION_MESSAGE,
  CATALOG_AUTOMATION_STATUS,
  catalogAutomationDisabledBody,
} from "./catalogAutomation";

describe("catalogAutomation", () => {
  it("deja la automatización del catálogo apagada, sin tocar datos", () => {
    expect(CATALOG_AUTOMATION_DISABLED).toBe(true);
    expect(CATALOG_AUTOMATION_STATUS).toBe(409);
    expect(CATALOG_AUTOMATION_MESSAGE).toMatch(/solo se administra desde el panel/i);
    const body = catalogAutomationDisabledBody();
    expect(body.disabled).toBe(true);
    expect(body.success).toBe(false);
    expect(body.ok).toBe(false);
  });
});
