"use client";

import { useCallback, useState } from "react";

type Axis = "horizontal" | "vertical";

export function usePanelResize(
  initial: number,
  min: number,
  max: number,
  axis: Axis = "horizontal",
  invert = false,
) {
  const [size, setSize] = useState(initial);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = axis === "horizontal" ? e.clientX : e.clientY;
      const startSize = size;

      const onMove = (ev: MouseEvent) => {
        const currentPos = axis === "horizontal" ? ev.clientX : ev.clientY;
        const delta = invert
          ? startPos - currentPos
          : currentPos - startPos;
        setSize(Math.min(max, Math.max(min, startSize + delta)));
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor =
        axis === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size, min, max, axis, invert],
  );

  return { size, setSize, startResize };
}
