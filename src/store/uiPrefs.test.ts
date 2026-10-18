import { describe, expect, it } from "vitest";
import { parseUiPrefs } from "./uiPrefs";

describe("parseUiPrefs", () => {
  it("keeps valid fields only", () => {
    expect(parseUiPrefs(JSON.stringify({ panelTab: "fengshui", panelOpen: false, tourDone: true }))).toEqual({ panelTab: "fengshui", panelOpen: false, tourDone: true });
    expect(parseUiPrefs(JSON.stringify({ panelTab: "nope", panelOpen: "yes" }))).toEqual({});
  });

  it("survives missing or broken storage", () => {
    expect(parseUiPrefs(null)).toEqual({});
    expect(parseUiPrefs("{oops")).toEqual({});
  });
});
