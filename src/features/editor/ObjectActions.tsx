"use client";

import { useState, type ReactNode } from "react";
import { AppWindow, Copy, DoorOpen, FlipHorizontal2, FlipVertical2, Footprints, Palette, Ruler, RotateCcw, RotateCw, Scissors, Sofa, Trash2, BrickWall, X } from "lucide-react";
import { Box, Col, Row, Text, TextMuted } from "@/components/ui/BasePrimitives";
import { NumberField, TextField } from "@/components/ui/Fields";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { duplicateFurniture, duplicateStair, entitySummary, findEntity, type SelectedEntity } from "@/domain/selection";
import { ROOM_TYPE_LABELS } from "@/domain/labels";
import { ROOM_TYPES, type Floor, type RoomType } from "@/domain/types";
import { mid, normalize, sub } from "@/geometry/vec";
import { wallLength } from "@/geometry/openings";
import { RoomTypeBadge } from "./roomIcons";

/** Screen box of the selected object inside the view (CSS px). */
export interface ActionAnchor {
  x: number;
  top: number;
  bottom: number;
}

function Act({ label, icon, onClick, active, danger }: { label: string; icon: ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex w-12 flex-col items-center gap-0.5 rounded-md px-0.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
        active ? "bg-brand-600 text-white" : danger ? "text-danger-600 hover:bg-danger-50" : "text-ink hover:bg-surface-muted"
      }`}
    >
      {icon}
      <Text className="text-micro font-medium leading-tight">{label}</Text>
    </button>
  );
}

const ICON = 16;

function entityIcon(e: SelectedEntity): ReactNode {
  switch (e.kind) {
    case "furniture":
      return <Sofa size={ICON} />;
    case "stair":
      return <Footprints size={ICON} />;
    case "opening":
      return e.opening.kind === "door" ? <DoorOpen size={ICON} /> : <AppWindow size={ICON} />;
    case "wall":
      return <BrickWall size={ICON} />;
    case "room":
      return <RoomTypeBadge type={e.room.type} size={20} />;
  }
}

type Pop = "size" | "type" | null;

/**
 * Floating bar next to the selected object, in the 2D plan and in 3D: rotate, size, flip,
 * duplicate, delete… right where the user is looking, without going to the side panel.
 */
export function ObjectActions({ floor, anchor, bounds }: { floor: Floor; anchor: ActionAnchor | null; bounds: { width: number; height: number } }) {
  const selection = useEditorStore((s) => s.selection);
  const [pop, setPop] = useState<Pop>(null);
  const [popFor, setPopFor] = useState<string | null>(null);
  if (!anchor || !selection || selection.floorId !== floor.id) return null;
  const s = useProjectStore.getState();
  const ed = useEditorStore.getState();
  const ids = selection.ids;
  const one = ids.length === 1 ? findEntity(floor, ids[0]) : null;
  // A popover belongs to the object it was opened for.
  const openPop = popFor === ids.join(",") ? pop : null;
  const toggle = (p: Exclude<Pop, null>) => {
    setPopFor(ids.join(","));
    setPop(openPop === p ? null : p);
  };
  const remove = () => {
    s.removeEntities(floor.id, ids);
    ed.select(null);
  };

  const actions: ReactNode[] = [];
  let popover: ReactNode = null;
  if (one?.kind === "furniture") {
    const f = one.item;
    const up = (patch: Partial<typeof f>) => s.updateFurniture(floor.id, f.id, patch);
    actions.push(
      <Act key="l" label="Xoay trái" icon={<RotateCcw size={ICON} />} onClick={() => up({ rotation: f.rotation - 90 })} />,
      <Act key="r" label="Xoay phải" icon={<RotateCw size={ICON} />} onClick={() => up({ rotation: f.rotation + 90 })} />,
      <Act key="s" label="Kích thước" icon={<Ruler size={ICON} />} active={openPop === "size"} onClick={() => toggle("size")} />,
      <Act
        key="d"
        label="Nhân bản"
        icon={<Copy size={ICON} />}
        onClick={() => {
          const copy = duplicateFurniture(f);
          s.addFurniture(floor.id, copy);
          ed.select({ floorId: floor.id, ids: [copy.id] });
        }}
      />,
    );
    if (openPop === "size")
      popover = (
        <Box className="grid grid-cols-2 gap-2">
          <NumberField label="Rộng" value={f.width} min={0.1} max={20} suffix="m" onCommit={(n) => n && up({ width: n })} />
          <NumberField label="Sâu" value={f.depth} min={0.1} max={20} suffix="m" onCommit={(n) => n && up({ depth: n })} />
          <NumberField label="Cao" value={f.height} min={0.05} max={10} suffix="m" onCommit={(n) => n && up({ height: n })} />
          <NumberField label="Góc xoay" value={f.rotation} min={-360} max={720} step={15} decimals={0} suffix="°" onCommit={(n) => n != null && up({ rotation: n })} />
        </Box>
      );
  } else if (one?.kind === "stair") {
    const st = one.stair;
    const up = (patch: Partial<typeof st>) => s.updateStair(floor.id, st.id, patch);
    actions.push(
      <Act key="l" label="Xoay trái" icon={<RotateCcw size={ICON} />} onClick={() => up({ rotation: st.rotation - 90 })} />,
      <Act key="r" label="Xoay phải" icon={<RotateCw size={ICON} />} onClick={() => up({ rotation: st.rotation + 90 })} />,
    );
    if (st.type !== "straight") actions.push(<Act key="t" label={st.turn === "left" ? "Rẽ phải" : "Rẽ trái"} icon={<FlipHorizontal2 size={ICON} />} onClick={() => up({ turn: st.turn === "left" ? "right" : "left" })} />);
    actions.push(
      <Act key="s" label="Kích thước" icon={<Ruler size={ICON} />} active={openPop === "size"} onClick={() => toggle("size")} />,
      <Act
        key="d"
        label="Nhân bản"
        icon={<Copy size={ICON} />}
        onClick={() => {
          const copy = duplicateStair(st);
          s.addStair(floor.id, copy);
          ed.select({ floorId: floor.id, ids: [copy.id] });
        }}
      />,
    );
    if (openPop === "size")
      popover = (
        <Box className="grid grid-cols-2 gap-2">
          <NumberField label="Rộng vế" value={st.width} min={0.4} max={5} suffix="m" onCommit={(n) => n && up({ width: n })} />
          <NumberField label="Số bậc" value={st.riserCount} min={2} max={60} step={1} decimals={0} onCommit={(n) => n && up({ riserCount: n })} />
          <NumberField label="Mặt bậc" value={st.treadDepth} min={0.12} max={0.6} step={0.01} suffix="m" onCommit={(n) => n && up({ treadDepth: n })} />
          <NumberField label="Góc đặt" value={st.rotation} min={-360} max={720} step={15} decimals={0} suffix="°" onCommit={(n) => n != null && up({ rotation: n })} />
        </Box>
      );
  } else if (one?.kind === "opening") {
    const o = one.opening;
    const up = (patch: Partial<typeof o>) => s.updateOpening(floor.id, o.id, patch);
    if (o.kind === "door")
      actions.push(
        <Act key="h" label="Bản lề" icon={<FlipHorizontal2 size={ICON} />} onClick={() => up({ hinge: o.hinge === "start" ? "end" : "start" })} />,
        <Act key="w" label="Chiều mở" icon={<FlipVertical2 size={ICON} />} onClick={() => up({ swing: o.swing === "left" ? "right" : "left" })} />,
      );
    actions.push(
      <Act
        key="k"
        label={o.kind === "door" ? "Thành cửa sổ" : "Thành cửa đi"}
        icon={o.kind === "door" ? <AppWindow size={ICON} /> : <DoorOpen size={ICON} />}
        onClick={() => up(o.kind === "door" ? { kind: "window", sill: Math.max(o.sill, 0.8), height: Math.min(o.height, 1.4) } : { kind: "door", sill: 0, height: Math.max(o.height, 2.1) })}
      />,
      <Act key="s" label="Kích thước" icon={<Ruler size={ICON} />} active={openPop === "size"} onClick={() => toggle("size")} />,
    );
    if (openPop === "size")
      popover = (
        <Box className="grid grid-cols-2 gap-2">
          <NumberField label="Rộng" value={o.width} min={0.3} max={wallLength(one.wall)} suffix="m" onCommit={(n) => n && up({ width: n })} />
          <NumberField label="Cao" value={o.height} min={0.3} max={floor.height} suffix="m" onCommit={(n) => n && up({ height: n })} />
          <NumberField label="Cao độ bậu" value={o.sill} min={0} max={floor.height - 0.3} suffix="m" onCommit={(n) => n != null && up({ sill: n })} />
          <NumberField label="Vị trí trên vách" value={o.offset} min={0} max={wallLength(one.wall)} suffix="m" onCommit={(n) => n != null && up({ offset: n })} />
        </Box>
      );
  } else if (one?.kind === "wall") {
    const w = one.wall;
    actions.push(
      <Act key="s" label="Kích thước" icon={<Ruler size={ICON} />} active={openPop === "size"} onClick={() => toggle("size")} />,
      <Act key="x" label="Tách đôi" icon={<Scissors size={ICON} />} onClick={() => s.splitWall(floor.id, w.id, mid(w.a, w.b))} />,
    );
    if (openPop === "size")
      popover = (
        <Box className="grid grid-cols-2 gap-2">
          <NumberField
            label="Chiều dài"
            value={wallLength(w)}
            min={0.05}
            max={200}
            suffix="m"
            onCommit={(n) => {
              if (!n) return;
              const d = normalize(sub(w.b, w.a));
              s.moveWallEndpoint(floor.id, w.b, { x: w.a.x + d.x * n, y: w.a.y + d.y * n }, w.id);
            }}
          />
          <NumberField label="Độ dày" value={w.thickness} min={0.05} max={1} step={0.01} suffix="m" onCommit={(n) => n && s.updateWall(floor.id, w.id, { thickness: n })} />
        </Box>
      );
  } else if (one?.kind === "room") {
    const r = one.room;
    const setType = (type: RoomType) => {
      const autoName = /^Phòng \d+$/.test(r.name) || Object.values(ROOM_TYPE_LABELS).includes(r.name);
      s.updateRoom(floor.id, r.id, autoName ? { type, name: ROOM_TYPE_LABELS[type] } : { type });
    };
    actions.push(<Act key="t" label="Công năng" icon={<Palette size={ICON} />} active={openPop === "type"} onClick={() => toggle("type")} />);
    if (openPop === "type")
      popover = (
        <Col className="gap-2">
          <TextField label="Tên phòng" value={r.name} onCommit={(name) => s.updateRoom(floor.id, r.id, { name })} />
          <Box role="radiogroup" aria-label="Công năng phòng" className="grid grid-cols-4 gap-1">
            {ROOM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={r.type === t}
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-0.5 rounded-md border p-1 ${r.type === t ? "border-brand-500 bg-brand-50" : "border-transparent hover:bg-surface-muted"}`}
              >
                <RoomTypeBadge type={t} size={24} />
                <Text className="text-micro leading-tight text-ink">{ROOM_TYPE_LABELS[t]}</Text>
              </button>
            ))}
          </Box>
        </Col>
      );
  }
  const canDelete = !one || one.kind !== "room" || one.room.source === "manual";
  if (canDelete) actions.push(<Act key="del" label="Xoá" danger icon={<Trash2 size={ICON} />} onClick={remove} />);

  const info = one ? entitySummary(one) : { title: `${ids.length} đối tượng`, size: "" };
  // Above the object when there is room, else below it; kept inside the view.
  const halfW = 170;
  const x = Math.min(Math.max(anchor.x, halfW), Math.max(halfW, bounds.width - halfW));
  // An open popover needs more room: go below the object when it wouldn't fit above.
  const above = anchor.top > (popover ? 330 : 100) || anchor.bottom + (popover ? 330 : 100) > bounds.height;
  const style = above ? { left: x, top: Math.max(0, anchor.top - 10), transform: "translate(-50%, -100%)" } : { left: x, top: Math.min(bounds.height - 60, anchor.bottom + 10), transform: "translate(-50%, 0)" };

  return (
    <Box role="toolbar" aria-label="Thao tác nhanh với đối tượng" className="pointer-events-auto absolute z-20 flex w-max max-w-[360px] flex-col gap-1" style={style} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      {above && popover && <PopBox onClose={() => setPop(null)}>{popover}</PopBox>}
      <Col className="rounded-xl border border-line bg-surface/95 p-1 shadow-lg backdrop-blur">
        <Row className="items-center gap-1.5 px-1.5 pt-0.5">
          {one ? entityIcon(one) : null}
          <Text className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{info.title}</Text>
          {info.size && <TextMuted className="shrink-0 text-xs tabular-nums">{info.size}</TextMuted>}
        </Row>
        <Row className="flex-wrap items-center gap-0.5">{actions}</Row>
      </Col>
      {!above && popover && <PopBox onClose={() => setPop(null)}>{popover}</PopBox>}
    </Box>
  );
}

function PopBox({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Box className="relative w-[320px] rounded-xl border border-line bg-surface p-2 pt-6 shadow-lg">
      <button type="button" aria-label="Đóng" onClick={onClose} className="absolute right-1 top-1 rounded p-0.5 text-ink-muted hover:bg-surface-muted">
        <X size={14} />
      </button>
      {children}
    </Box>
  );
}
