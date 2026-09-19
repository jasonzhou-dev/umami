import { Row } from "@umami/react-zen";
import type { ReactNode } from "react";

export function TypeIcon({
  type,
  value,
  children,
}: {
  type: "browser" | "country" | "device" | "os";
  value: string;
  children?: ReactNode;
}) {
  const iconValue =
    type === "browser" && value === "browser" ? "unknown" : value;
  const baseName = iconValue?.replaceAll(" ", "-").toLowerCase() || "unknown";

  return (
    <Row gap="3" alignItems="center">
      <img
        src={`${process.env.basePath || ""}/images/${type}/${baseName}.png`}
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src.endsWith(".png")) {
            img.src = `${process.env.basePath || ""}/images/${type}/${baseName}.svg`;
          } else {
            img.src = `${process.env.basePath || ""}/images/${type}/unknown.png`;
          }
        }}
        alt={value}
        width={type === "country" ? undefined : 16}
        height={type === "country" ? undefined : 16}
      />
      {children}
    </Row>
  );
}
