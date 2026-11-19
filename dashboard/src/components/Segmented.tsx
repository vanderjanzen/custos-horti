"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/** Umschalter mit gleitendem Hintergrund */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useGSAP(
    () => {
      const btn = root.current?.querySelector<HTMLElement>("button.is-active");
      if (!btn || !thumb.current) return;
      gsap.to(thumb.current, {
        x: btn.offsetLeft - 3,
        width: btn.offsetWidth,
        duration: placed.current ? 0.5 : 0,
        ease: "expo.out",
      });
      placed.current = true;
    },
    { scope: root, dependencies: [value] },
  );

  return (
    <div className="segmented" ref={root}>
      <span className="segmented-thumb" ref={thumb} />
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          className={o.value === value ? "is-active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
