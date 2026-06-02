"use client";

import AppProblemScreen from "@/components/AppProblemScreen";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppProblemScreen error={error} reset={reset} secondaryHref={undefined} />;
}
