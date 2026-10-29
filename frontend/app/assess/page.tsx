export default function AssessPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-5xl">🔬</div>
      <h1 className="text-2xl font-semibold text-[var(--foreground)]">Coming Soon</h1>
      <p className="max-w-md text-[var(--muted-foreground)]">
        South Asian-specific risk equations are under development. Current general-population
        models underestimate cardiometabolic risk in South Asians, so we're building
        validated, population-specific calculators before launching this feature.
      </p>
    </div>
  );
}
