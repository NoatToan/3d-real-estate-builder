import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editorStore";

describe("control panel tab", () => {
  beforeEach(() => useEditorStore.getState().reset());

  it("starts on the checklist", () => {
    expect(useEditorStore.getState().panelTab).toBe("start");
  });

  it("opens 'Chỉnh sửa' when something is selected or a drawing tool is picked", () => {
    const ed = useEditorStore.getState();
    ed.setPanelTab("check");
    ed.select({ floorId: "f", ids: ["a"] });
    expect(useEditorStore.getState().panelTab).toBe("edit");

    ed.setPanelTab("fengshui");
    ed.select(null);
    expect(useEditorStore.getState().panelTab).toBe("fengshui");
    ed.setTool("pan");
    expect(useEditorStore.getState().panelTab).toBe("fengshui");
    ed.setTool("wall");
    expect(useEditorStore.getState().panelTab).toBe("edit");

    ed.setPanelTab("start");
    ed.pickFurniture("sofa");
    expect(useEditorStore.getState().panelTab).toBe("edit");
    ed.setPanelTab("start");
    ed.toggleSelect("f", "b");
    expect(useEditorStore.getState().panelTab).toBe("edit");
  });
});
