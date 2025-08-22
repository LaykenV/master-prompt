"use client";

import { motion } from "motion/react";
import { RefObject, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>; // Container ref
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
  // Visual polish
  showFlow?: boolean; // animated dashes indicating direction
  flowDuration?: number; // seconds for one dash cycle
  showNodes?: boolean; // render endpoint nodes
  nodeRadius?: number;
  glow?: boolean; // draw a soft glow under the line
  glowOpacity?: number; // 0..1
  dashLength?: number; // px
  dashGap?: number; // px
  // Reveal animation
  revealProgress?: number; // 0..1 length grown along the path
}

export const AnimatedBeam: React.FC<AnimatedBeamProps> = ({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 80,
  reverse = false, // Include the reverse prop
  duration = Math.random() * 3 + 4,
  delay = 0,
  pathColor = "gray",
  pathWidth = 2,
  pathOpacity = 0.2,
  gradientStartColor = "#ffaa40",
  gradientStopColor = "#9c40ff",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
  showFlow = true,
  flowDuration = 3.2,
  showNodes = true,
  nodeRadius = 3.5,
  glow = true,
  glowOpacity = 0.28,
  dashLength = 8,
  dashGap = 12,
  revealProgress = 1,
}) => {
  const id = useId();
  const maskId = `${id}-reveal-mask`;
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const mainPathRef = useRef<SVGPathElement | null>(null);
  const [endpoints, setEndpoints] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Calculate the gradient coordinates based on the reverse prop
  const gradientCoordinates = reverse
    ? {
        x1: ["90%", "-10%"],
        x2: ["100%", "0%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      }
    : {
        x1: ["10%", "110%"],
        x2: ["0%", "100%"],
        y1: ["0%", "0%"],
        y2: ["0%", "0%"],
      };

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current && fromRef.current && toRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rectA = fromRef.current.getBoundingClientRect();
        const rectB = toRef.current.getBoundingClientRect();

        const svgWidth = containerRect.width;
        const svgHeight = containerRect.height;
        setSvgDimensions({ width: svgWidth, height: svgHeight });

        const startX =
          rectA.left - containerRect.left + rectA.width / 2 + startXOffset;
        const startY =
          rectA.top - containerRect.top + rectA.height / 2 + startYOffset;
        const endX =
          rectB.left - containerRect.left + rectB.width / 2 + endXOffset;
        const endY =
          rectB.top - containerRect.top + rectB.height / 2 + endYOffset;

        // Compute cubic bezier control points using a perpendicular offset for a smooth arc
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = -dy / distance; // unit normal x
        const ny = dx / distance; // unit normal y

        const c1x = startX + dx * 0.25 + nx * curvature;
        const c1y = startY + dy * 0.25 + ny * curvature;
        const c2x = startX + dx * 0.75 + nx * curvature;
        const c2y = startY + dy * 0.75 + ny * curvature;

        const d = `M ${startX},${startY} C ${c1x},${c1y} ${c2x},${c2y} ${endX},${endY}`;
        setPathD(d);
        setEndpoints({ startX, startY, endX, endY });
      }
    };

    // Initialize ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach(() => updatePath());
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Recompute on scroll for more robust positioning while layout changes
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        updatePath();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    updatePath();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [
    containerRef,
    fromRef,
    toRef,
    curvature,
    startXOffset,
    startYOffset,
    endXOffset,
    endYOffset,
  ]);

  // No-op placeholder if we need to measure the path in the future

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "pointer-events-none absolute left-0 top-0 transform-gpu stroke-2",
        className,
      )}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
    >
      {/* Mask that reveals the path up to revealProgress */}
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width={svgDimensions.width} height={svgDimensions.height} fill="black" />
          <path
            d={pathD}
            stroke="white"
            strokeWidth={pathWidth + 2}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${Math.max(0, Math.min(1, revealProgress))} 1`}
            strokeDashoffset={`${1 - Math.max(0, Math.min(1, revealProgress))}`}
          />
        </mask>
      </defs>
      {/* Base line */}
      <path
        ref={mainPathRef}
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
        shapeRendering="geometricPrecision"
        mask={`url(#${maskId})`}
      />

      {/* Gradient stroke overlay */}
      <path
        d={pathD}
        strokeWidth={pathWidth}
        stroke={`url(#${id})`}
        strokeOpacity="1"
        strokeLinecap="round"
        shapeRendering="geometricPrecision"
        style={{ filter: glow ? `drop-shadow(0 0 ${Math.max(4, pathWidth * 2)}px ${gradientStopColor})` : undefined, opacity: 0.95 }}
        mask={`url(#${maskId})`}
      />

      {/* Flowing dash overlay */}
      {showFlow && (
        <motion.path
          d={pathD}
          stroke={gradientStopColor}
          strokeWidth={Math.max(1, pathWidth - 0.5)}
          strokeLinecap="round"
          strokeOpacity={0.9}
          strokeDasharray={`${dashLength} ${dashGap}`}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: reverse ? [0, dashLength + dashGap] : [0, -(dashLength + dashGap)] }}
          transition={{ duration: flowDuration, repeat: Infinity, ease: "linear" }}
          mask={`url(#${maskId})`}
        />
      )}

      {/* Endpoint nodes */}
      {showNodes && endpoints && (
        <>
          {/* Start node */}
          {glow && (
            <circle
              cx={endpoints.startX}
              cy={endpoints.startY}
              r={nodeRadius * 2}
              fill={gradientStartColor}
              opacity={glowOpacity}
            />
          )}
          <circle
            cx={endpoints.startX}
            cy={endpoints.startY}
            r={nodeRadius}
            fill={gradientStartColor}
            style={{ filter: glow ? `drop-shadow(0 0 ${nodeRadius * 2}px ${gradientStartColor})` : undefined }}
          />
          {/* End node */}
          {glow && (
            <circle
              cx={endpoints.endX}
              cy={endpoints.endY}
              r={nodeRadius * 2}
              fill={gradientStopColor}
              opacity={glowOpacity}
            />
          )}
          <circle
            cx={endpoints.endX}
            cy={endpoints.endY}
            r={nodeRadius}
            fill={gradientStopColor}
            style={{ filter: glow ? `drop-shadow(0 0 ${nodeRadius * 2}px ${gradientStopColor})` : undefined }}
          />
        </>
      )}
      <defs>
        <motion.linearGradient
          className="transform-gpu"
          id={id}
          gradientUnits={"userSpaceOnUse"}
          initial={{
            x1: "0%",
            x2: "0%",
            y1: "0%",
            y2: "0%",
          }}
          animate={{
            x1: gradientCoordinates.x1,
            x2: gradientCoordinates.x2,
            y1: gradientCoordinates.y1,
            y2: gradientCoordinates.y2,
          }}
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1], // https://easings.net/#easeOutExpo
            repeat: Infinity,
            repeatDelay: 0,
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0"></stop>
          <stop stopColor={gradientStartColor}></stop>
          <stop offset="32.5%" stopColor={gradientStopColor}></stop>
          <stop
            offset="100%"
            stopColor={gradientStopColor}
            stopOpacity="0"
          ></stop>
        </motion.linearGradient>
      </defs>
    </svg>
  );
};
