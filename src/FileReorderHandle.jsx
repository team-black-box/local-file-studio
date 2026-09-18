// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";

// Capture only the handle so touch scrolling still works everywhere else in a row.
export function FileReorderHandle({ index, name, onReorder, disabled }) {
  const active = useRef(null);
  const [dragging, setDragging] = useState(false);

  const clear = () => {
    const drag = active.current;
    active.current = null;
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    drag.target?.classList.remove("file-drop-target");
    drag.row.classList.remove("file-drag-source");
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  };

  useEffect(() => clear, []);

  const start = (event) => {
    if (disabled || active.current || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const row = handle.closest("[data-file-index]");
    const queue = row.parentElement;
    const stage = row.closest(".file-stage");
    const body = row.closest(".workbench-body");
    const scroller = getComputedStyle(stage).overflowY === "auto" ? stage : body;
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
    active.current = { handle, row, queue, scroller, pointerId: event.pointerId, y: event.clientY, x: event.clientX, target: row, targetIndex: index, frame: 0 };
    row.classList.add("file-drag-source");
    setDragging(true);
    const tick = () => {
      const drag = active.current;
      if (!drag) return;
      const bounds = drag.scroller.getBoundingClientRect();
      const edge = 48;
      const speed = drag.y < bounds.top + edge ? -Math.min(16, (bounds.top + edge - drag.y) / 3)
        : drag.y > bounds.bottom - edge ? Math.min(16, (drag.y - bounds.bottom + edge) / 3) : 0;
      if (speed) drag.scroller.scrollTop += speed;
      const target = document.elementFromPoint(drag.x, Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, drag.y)))?.closest("[data-file-index]");
      if (target && target.parentElement === drag.queue) {
        drag.target?.classList.remove("file-drop-target");
        drag.target = target;
        drag.targetIndex = Number(target.dataset.fileIndex);
        if (drag.targetIndex !== index) target.classList.add("file-drop-target");
      }
      drag.frame = requestAnimationFrame(tick);
    };
    active.current.frame = requestAnimationFrame(tick);
  };

  const finish = (event, commit) => {
    const drag = active.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetIndex = drag.targetIndex;
    clear();
    setDragging(false);
    if (commit && targetIndex !== index) onReorder(index, targetIndex - index);
  };

  return <button
    type="button"
    className={`file-drag-handle${dragging ? " dragging" : ""}`}
    aria-label={`Drag ${name} to reorder; use the up and down buttons for keyboard reordering`}
    title="Drag to reorder"
    disabled={disabled}
    onPointerDown={start}
    onPointerMove={(event) => { if (active.current?.pointerId === event.pointerId) { active.current.x = event.clientX; active.current.y = event.clientY; } }}
    onPointerUp={(event) => finish(event, true)}
    onPointerCancel={(event) => finish(event, false)}
    onLostPointerCapture={(event) => finish(event, false)}
    onKeyDown={(event) => { if (event.key === "Escape" && active.current) { event.preventDefault(); clear(); setDragging(false); event.stopPropagation(); } }}
  ><DotsSixVerticalIcon size={20} aria-hidden="true" /></button>;
}
