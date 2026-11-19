"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

/** Bei jedem Seitenwechsel: alle .reveal-Elemente weich von unten einblenden */
export default function Template({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(".reveal", {
        y: 18,
        opacity: 0,
        filter: "blur(6px)",
        duration: 0.9,
        ease: "expo.out",
        stagger: 0.06,
        clearProps: "filter,transform,opacity",
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
