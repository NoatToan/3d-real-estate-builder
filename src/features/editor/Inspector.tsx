"use client";

import type { ReactNode } from "react";
import { AppWindow, BrickWall, Copy, DoorOpen, Footprints, Layers, RotateCw, Scissors, Sofa, Trash2, TriangleAlert } from "lucide-react";
import { Box, Col, Row, Text, TextFaint, TextMuted } from "@/components/ui/BasePrimitives";
import { Button } from "@/components/ui/Button";
import { NumberField, SelectField, TextField, Toggle } from "@/components/ui/Fields";
import { toast } from "@/components/ui/Toast";
import { useProjectStore } from "@/store/projectStore";
import { useEditorStore } from "@/store/editorStore";
import { useActiveFloor } from "@/features/plan/hooks";
import { OPENING_LABELS, ROOM_TYPE_LABELS, STAIR_TYPE_LABELS, fmtArea } from "@/domain/labels";
import { ROOM_TYPES, STAIR_TYPES, type Floor, type Furniture, type Opening, type Room, type Stair, type Wall } from "@/domain/types";
import { createFurniture, furnitureSpec } from "@/domain/furniture";
import { FurnitureCatalog, FurnitureIcon } from "@/features/furniture/FurnitureCatalog";
import { roomNetArea } from "@/domain/rooms";
import { area } from "@/geometry/polygon";
import { generateStair } from "@/geometry/stairs";
import { mid, normalize, sub } from "@/geometry/vec";
import { wallLength } from "@/geometry/openings";
import { TOOLS } from "./Toolbar";
import { RoomTypeBadge } from "./roomIcons";

function Panel({ title, icon, children, actions }: { title: string; icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <Row className="mb-2 items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {icon}
          {title}
        </h3>
        {actions}
      </Row>
      <Col className="gap-2">{children}</Col>
    </section>
  );
}

const Grid2 = ({ children }: { children: ReactNode }) => <Box className="grid grid-cols-2 gap-2">{children}</Box>;

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <Row className="justify-between text-xs">
      <TextMuted>{label}</TextMuted>
      <Text tone="primary" className="font-medium tabular-nums">
        {value}
      </Text>
    </Row>
  );
}

function DeleteButton({ floorId, ids }: { floorId: string; ids: string[] }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-danger-600"
      icon={<Trash2 size={14} />}
      onClick={() => {
        useProjectStore.getState().removeEntities(floorId, ids);
        useEditorStore.getState().select(null);
      }}
    >
      Xoá
    </Button>
  );
}

function WallInspector({ floor, wall }: { floor: Floor; wall: Wall }) {
  const s = useProjectStore.getState();
  const L = wallLength(wall);
  return (
    <Panel title="Vách" icon={<BrickWall size={14} />} actions={<DeleteButton floorId={floor.id} ids={[wall.id]} />}>
      <Grid2>
        <NumberField
          label="Chiều dài"
          value={L}
          min={0.05}
          max={200}
          suffix="m"
          onCommit={(n) => {
            if (!n) return;
            const d = normalize(sub(wall.b, wall.a));
            s.moveWallEndpoint(floor.id, wall.b, { x: wall.a.x + d.x * n, y: wall.a.y + d.y * n }, wall.id);
          }}
        />
        <NumberField label="Độ dày" value={wall.thickness} min={0.05} max={1} step={0.01} suffix="m" onCommit={(n) => n && s.updateWall(floor.id, wall.id, { thickness: n })} />
      </Grid2>
      <Row className="gap-1">
        {[0.11, 0.22].map((t) => (
          <Button key={t} size="sm" onClick={() => s.updateWall(floor.id, wall.id, { thickness: t })}>
            {t === 0.11 ? "Vách 110" : "Tường 220"}
          </Button>
        ))}
        <Button size="sm" icon={<Scissors size={14} />} onClick={() => s.splitWall(floor.id, wall.id, mid(wall.a, wall.b))}>
          Tách đôi
        </Button>
      </Row>
      <TextFaint as="p" className="text-xs">
        Đầu vách: ({wall.a.x.toFixed(2)}; {wall.a.y.toFixed(2)}) → ({wall.b.x.toFixed(2)}; {wall.b.y.toFixed(2)})
      </TextFaint>
    </Panel>
  );
}

function OpeningInspector({ floor, opening }: { floor: Floor; opening: Opening }) {
  const s = useProjectStore.getState();
  const up = (patch: Partial<Opening>) => s.updateOpening(floor.id, opening.id, patch);
  const wall = floor.walls.find((w) => w.id === opening.wallId);
  return (
    <Panel title={OPENING_LABELS[opening.kind]} icon={opening.kind === "door" ? <DoorOpen size={14} /> : <AppWindow size={14} />} actions={<DeleteButton floorId={floor.id} ids={[opening.id]} />}>
      <SelectField label="Loại" value={opening.kind} options={[{ value: "door", label: "Cửa đi" }, { value: "window", label: "Cửa sổ" }]} onChange={(kind) => up({ kind, sill: kind === "door" ? 0 : Math.max(opening.sill, 0.8) })} />
      <Grid2>
        <NumberField label="Rộng" value={opening.width} min={0.3} max={wall ? wallLength(wall) : 10} suffix="m" onCommit={(n) => n && up({ width: n })} />
        <NumberField label="Cao" value={opening.height} min={0.3} max={floor.height} suffix="m" onCommit={(n) => n && up({ height: n })} />
        <NumberField label="Cao độ bậu" value={opening.sill} min={0} max={floor.height - 0.3} suffix="m" onCommit={(n) => n != null && up({ sill: n })} />
        <NumberField label="Vị trí (từ đầu vách)" value={opening.offset} min={0} max={wall ? wallLength(wall) : 100} suffix="m" onCommit={(n) => n != null && up({ offset: n })} />
      </Grid2>
      {opening.kind === "door" && (
        <Row className="gap-1">
          <Button size="sm" onClick={() => up({ hinge: opening.hinge === "start" ? "end" : "start" })}>
            Đổi bản lề
          </Button>
          <Button size="sm" onClick={() => up({ swing: opening.swing === "left" ? "right" : "left" })}>
            Đổi chiều mở
          </Button>
        </Row>
      )}
    </Panel>
  );
}

function StairInspector({ floor, stair, isTop }: { floor: Floor; stair: Stair; isTop: boolean }) {
  const s = useProjectStore.getState();
  const up = (patch: Partial<Stair>) => s.updateStair(floor.id, stair.id, patch);
  const g = generateStair(stair, floor.height);
  return (
    <Panel title="Cầu thang" icon={<Footprints size={14} />} actions={<DeleteButton floorId={floor.id} ids={[stair.id]} />}>
      <SelectField label="Kiểu thang" value={stair.type} options={STAIR_TYPES.map((t) => ({ value: t, label: STAIR_TYPE_LABELS[t] }))} onChange={(type) => up({ type })} />
      <Grid2>
        <NumberField label={stair.type === "spiral" ? "Rộng bậc" : "Rộng vế"} value={stair.width} min={0.4} max={5} suffix="m" onCommit={(n) => n && up({ width: n })} />
        <NumberField label="Số bậc" value={stair.riserCount} min={2} max={60} step={1} decimals={0} onCommit={(n) => n && up({ riserCount: n })} />
        {stair.type !== "spiral" && <NumberField label="Mặt bậc" value={stair.treadDepth} min={0.12} max={0.6} step={0.01} suffix="m" onCommit={(n) => n && up({ treadDepth: n })} />}
        {(stair.type === "L" || stair.type === "U") && <NumberField label="Chiếu nghỉ" value={stair.landingDepth} min={0.6} max={5} suffix="m" onCommit={(n) => n && up({ landingDepth: n })} />}
        {stair.type === "U" && <NumberField label="Khe giữa 2 vế" value={stair.gap} min={0} max={2} step={0.05} suffix="m" onCommit={(n) => n != null && up({ gap: n })} />}
        {stair.type === "spiral" && <NumberField label="Bán kính trụ" value={stair.innerRadius} min={0.05} max={2} step={0.01} suffix="m" onCommit={(n) => n && up({ innerRadius: n })} />}
        {stair.type === "spiral" && <NumberField label="Góc xoay tổng" value={stair.sweep} min={90} max={720} step={15} decimals={0} suffix="°" onCommit={(n) => n && up({ sweep: n })} />}
        <NumberField label="Góc đặt" value={stair.rotation} min={-360} max={720} step={15} decimals={0} suffix="°" onCommit={(n) => n != null && up({ rotation: n })} />
      </Grid2>
      <Row className="gap-1">
        <Button size="sm" icon={<RotateCw size={14} />} onClick={() => up({ rotation: stair.rotation + 90 })}>
          Xoay 90°
        </Button>
        {stair.type !== "straight" && (
          <Button size="sm" onClick={() => up({ turn: stair.turn === "left" ? "right" : "left" })}>
            Rẽ {stair.turn === "left" ? "phải" : "trái"}
          </Button>
        )}
      </Row>
      <Readout label="Chiều cao bậc" value={`${(g.riserHeight * 100).toFixed(1)} cm`} />
      <Readout label="Mặt bậc (đường đi)" value={`${(g.going * 100).toFixed(1)} cm`} />
      <Readout label="Diện tích chiếm chỗ" value={fmtArea(area(g.footprint))} />
      {[...(isTop ? ["Đây là tầng trên cùng — thêm tầng phía trên để thang dẫn lên."] : []), ...g.warnings].map((w) => (
        <Row key={w} className="items-start gap-1.5 rounded-md bg-warning-50 p-2 text-xs text-warning-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          {w}
        </Row>
      ))}
    </Panel>
  );
}

function FurnitureInspector({ floor, item }: { floor: Floor; item: Furniture }) {
  const s = useProjectStore.getState();
  const up = (patch: Partial<Furniture>) => s.updateFurniture(floor.id, item.id, patch);
  const spec = furnitureSpec(item.kind);
  return (
    <Panel title="Nội thất" icon={<Sofa size={14} />} actions={<DeleteButton floorId={floor.id} ids={[item.id]} />}>
      <Row className="items-center gap-2">
        <FurnitureIcon spec={spec} size={44} />
        <TextField className="flex-1" label="Tên" value={item.name} onCommit={(name) => up({ name })} />
      </Row>
      <Grid2>
        <NumberField label="Rộng" value={item.width} min={0.1} max={20} suffix="m" onCommit={(n) => n && up({ width: n })} />
        <NumberField label="Sâu" value={item.depth} min={0.1} max={20} suffix="m" onCommit={(n) => n && up({ depth: n })} />
        <NumberField label="Cao" value={item.height} min={0.05} max={10} suffix="m" onCommit={(n) => n && up({ height: n })} />
        <NumberField label="Góc xoay" value={item.rotation} min={-360} max={720} step={15} decimals={0} suffix="°" onCommit={(n) => n != null && up({ rotation: n })} />
      </Grid2>
      <Row className="flex-wrap gap-1">
        <Button size="sm" icon={<RotateCw size={14} />} onClick={() => up({ rotation: item.rotation + 90 })}>
          Xoay 90°
        </Button>
        <Button
          size="sm"
          icon={<Copy size={14} />}
          onClick={() => {
            const copy = { ...createFurniture(item.kind, { x: item.x + 0.3, y: item.y + 0.3 }, item.rotation), name: item.name, width: item.width, depth: item.depth, height: item.height };
            s.addFurniture(floor.id, copy);
            useEditorStore.getState().select({ floorId: floor.id, ids: [copy.id] });
          }}
        >
          Nhân bản
        </Button>
        <Button size="sm" onClick={() => up({ width: spec.width, depth: spec.depth, height: spec.height })}>
          Kích thước mẫu
        </Button>
      </Row>
      <TextFaint as="p" className="text-xs">
        Kéo trên mặt bằng để di chuyển, phím mũi tên để dịch từng chút, R để xoay.
      </TextFaint>
    </Panel>
  );
}

function RoomInspector({ floor, room }: { floor: Floor; room: Room }) {
  const s = useProjectStore.getState();
  return (
    <Panel title="Phòng" icon={<RoomTypeBadge type={room.type} size={18} />} actions={room.source === "manual" ? <DeleteButton floorId={floor.id} ids={[room.id]} /> : undefined}>
      <TextField label="Tên phòng" value={room.name} onCommit={(name) => s.updateRoom(floor.id, room.id, { name })} />
      <SelectField
        label="Công năng"
        value={room.type}
        options={ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] }))}
        onChange={(type) => {
          const autoName = /^Phòng \d+$/.test(room.name) || Object.values(ROOM_TYPE_LABELS).includes(room.name);
          s.updateRoom(floor.id, room.id, autoName ? { type, name: ROOM_TYPE_LABELS[type] } : { type });
        }}
      />
      <Readout label="Diện tích thông thuỷ" value={fmtArea(roomNetArea(room))} />
      <Readout label="Diện tích tim tường" value={fmtArea(area(room.polygon))} />
      <TextFaint as="p" className="text-xs">
        {room.source === "auto" ? "Tự nhận diện từ vách khép kín — chỉnh vách để đổi hình dạng." : "Phòng vẽ thủ công."}
      </TextFaint>
    </Panel>
  );
}

function ToolOptions() {
  const tool = useEditorStore((s) => s.tool);
  const stairType = useEditorStore((s) => s.stairType);
  const wallThickness = useEditorStore((s) => s.wallThickness);
  const roomCreatesWalls = useEditorStore((s) => s.roomCreatesWalls);
  const defaults = useProjectStore((s) => s.project?.defaults);
  const ed = useEditorStore.getState();
  const info = TOOLS.find((t) => t.tool === tool);
  return (
    <Panel title={`Công cụ: ${info?.label ?? ""}`} icon={info?.icon}>
      <TextMuted as="p" className="text-xs">
        {info?.hint}
      </TextMuted>
      {tool === "wall" && (
        <Row className="gap-1">
          {[
            { v: defaults?.wallThickness ?? 0.11, l: "Vách 110" },
            { v: defaults?.exteriorWallThickness ?? 0.22, l: "Tường 220" },
          ].map((o) => (
            <Button key={o.l} size="sm" variant={(wallThickness ?? defaults?.wallThickness) === o.v ? "primary" : "secondary"} onClick={() => ed.setWallThickness(o.v)}>
              {o.l}
            </Button>
          ))}
          <NumberField className="w-24" aria-label="Độ dày vách" value={wallThickness ?? defaults?.wallThickness ?? 0.11} min={0.05} max={1} step={0.01} suffix="m" onCommit={(n) => n && ed.setWallThickness(n)} />
        </Row>
      )}
      {tool === "stair" && <SelectField label="Kiểu thang" value={stairType} options={STAIR_TYPES.map((t) => ({ value: t, label: STAIR_TYPE_LABELS[t] }))} onChange={ed.setStairType} />}
      {tool === "room" && <Toggle label="Tự tạo vách theo cạnh phòng" checked={roomCreatesWalls} onChange={ed.setRoomCreatesWalls} />}
      {tool === "furniture" && <FurnitureCatalog />}
    </Panel>
  );
}

function FloorProperties({ floor }: { floor: Floor }) {
  const s = useProjectStore.getState();
  return (
    <Panel title="Tầng đang chọn" icon={<Layers size={14} />}>
      <TextField label="Tên tầng" value={floor.name} onCommit={(name) => s.updateFloor(floor.id, { name })} />
      <Grid2>
        <NumberField label="Chiều cao tầng" value={floor.height} min={2} max={10} suffix="m" onCommit={(n) => n && s.updateFloor(floor.id, { height: n })} />
        <NumberField label="Dày sàn" value={floor.slabThickness} min={0.05} max={0.5} step={0.01} suffix="m" onCommit={(n) => n && s.updateFloor(floor.id, { slabThickness: n })} />
      </Grid2>
      <Row className="flex-wrap gap-1">
        <Button
          size="sm"
          onClick={() => {
            if (!s.generateExteriorWalls(floor.id, "lot")) toast.error("Không tạo được tường bao từ ranh đất.");
          }}
        >
          Tường bao theo ranh đất
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (!s.generateExteriorWalls(floor.id, "buildable")) toast.info("Hãy bật khoảng lùi xây dựng trong mục Ràng buộc trước.");
          }}
        >
          Theo chỉ giới xây dựng
        </Button>
      </Row>
      <Readout label="Số vách / phòng / cửa / thang" value={`${floor.walls.length} / ${floor.rooms.length} / ${floor.openings.length} / ${floor.stairs.length}`} />
    </Panel>
  );
}

export function Inspector() {
  const { floor, index } = useActiveFloor();
  const selection = useEditorStore((s) => s.selection);
  const floors = useProjectStore((s) => s.project?.floors.length ?? 0);
  if (!floor) return null;

  const ids = selection && selection.floorId === floor.id ? selection.ids : [];
  if (ids.length > 1) {
    return (
      <Panel title={`Đã chọn ${ids.length} đối tượng`} actions={<DeleteButton floorId={floor.id} ids={ids} />}>
        <TextMuted as="p" className="text-xs">
          Nhấn Delete để xoá. Shift + nhấp để thêm/bớt đối tượng.
        </TextMuted>
      </Panel>
    );
  }
  if (ids.length === 1) {
    const id = ids[0];
    const wall = floor.walls.find((w) => w.id === id);
    if (wall) return <WallInspector floor={floor} wall={wall} />;
    const opening = floor.openings.find((o) => o.id === id);
    if (opening) return <OpeningInspector floor={floor} opening={opening} />;
    const stair = floor.stairs.find((s) => s.id === id);
    if (stair) return <StairInspector floor={floor} stair={stair} isTop={index === floors - 1} />;
    const item = floor.furniture.find((x) => x.id === id);
    if (item) return <FurnitureInspector floor={floor} item={item} />;
    const room = floor.rooms.find((r) => r.id === id);
    if (room) return <RoomInspector floor={floor} room={room} />;
  }
  return (
    <>
      <ToolOptions />
      <FloorProperties floor={floor} />
    </>
  );
}
