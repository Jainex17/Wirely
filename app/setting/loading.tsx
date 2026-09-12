export default function SettingLoading() {
  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-semibold text-foreground">Loading settings</h2>
      <p className="text-sm text-muted-foreground">
        Fetching your latest account and model configuration.
      </p>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
