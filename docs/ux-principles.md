# UX principles for Real Estate Builder

Users are mostly **not** architects: homeowners planning a nhà phố, real-estate sales people, small builders. Every UI change follows these rules (checked in review, see AGENTS.md).

## The principles

1. **Show the next step (Nielsen #1 visibility, #6 recognition over recall).** An empty screen always says what to do next (empty floor → "Dựng nhanh / Phòng mẫu / Tường bao / Tự vẽ"; empty home → nhà mẫu first). The checklist "Bắt đầu" shows progress (x/5).
2. **Progressive disclosure.** One topic at a time. The control panel has tabs (Bắt đầu · Chỉnh sửa · Kiểm tra · Phong thuỷ · Cài đặt); advanced settings (ràng buộc, hiển thị) live in "Cài đặt", not on the main path.
3. **Hick's law: few choices per moment.** Primary actions are grouped and visually distinct: toolbar groups *Tạo* (highlighted: Tạo nhanh, Phòng mẫu), *Vẽ*, *Xem*. Dialogs offer 3–6 choices, the recommended one first and pre-selected.
4. **Easiest path by default.** Defaults pick what most users want: new project = "Nhập kích thước", empty project opens on the 2D plan (3D joins once there are walls), templates fit the lot automatically.
5. **Act where you look (Fitts's law).** Common edits sit next to the object: floating bar (xoay, kích thước, nhân bản, xoá) in 2D and 3D; drag in 3D. The panel is the place for the full list of properties.
6. **Icons + words, never icons alone.** Every icon button has a short Vietnamese label or tooltip; room types have an icon and their plan colour.
7. **Plain language, explain jargon in place.** Vietnamese everyday words first; technical terms (mật độ xây dựng, hệ số sử dụng đất, lộ giới…) get an ⓘ tooltip right where they appear.
8. **Explain automatic decisions.** When the app chooses for the user (vị trí phòng, phong thuỷ, dự toán), it shows why (✓/✗ reasons, assumptions) so the user can trust or override it.
9. **Forgiving (Nielsen #3, #5).** Everything can be undone (Ctrl+Z, one step per gesture); destructive actions are labelled; checks warn instead of blocking.
10. **Consistency (Jakob's law).** Same patterns as familiar tools (Canva / Floorplanner): templates gallery, left tool rail, tabs, drag to move, Delete to remove, wheel to zoom.

## Checklist for a UI change

- [ ] A first-time user can tell what to do next on every screen touched.
- [ ] New controls have an icon **and** a Vietnamese label; jargon has a hint.
- [ ] The default choice is the most common one; advanced options are behind a tab or "Cài đặt".
- [ ] The action is reachable next to the object it affects when it is a frequent one.
- [ ] Undo works and is one step per gesture.
- [ ] The e2e tour shows the change (Feature showcase rule).
