"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/** Zahl, die weich zum neuen Wert zaehlt. React rendert den Text nicht selbst. */
export default function CountUp({ value, decimals = 1 }: { value: number | null; decimals?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const current = useRef({ v: 0 });

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (value == null) {
      node.textContent = "–";
      return;
    }
    const tween = gsap.to(current.current, {
      v: value,
      duration: 1.4,
      ease: "expo.out",
      onUpdate: () => {
        node.textContent = current.current.v.toFixed(decimals);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value, decimals]);

  return <span ref={el} />;
}
