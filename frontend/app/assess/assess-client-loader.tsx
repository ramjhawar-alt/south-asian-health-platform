"use client";

import dynamic from "next/dynamic";

const AssessmentApp = dynamic(
  () => import("./assessment-app").then((m) => ({ default: m.AssessmentApp })),
  { ssr: false }
);

export function AssessClientLoader() {
  return <AssessmentApp />;
}
