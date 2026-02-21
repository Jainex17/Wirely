// components/LoadingSkeleton.tsx
const LoadingSkeleton = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="mb-8 text-center text-4xl font-medium text-foreground">
        What do you want to create?
      </h1>

      {/* Form Skeleton */}
      <div className="bg-card border border-border rounded-xl p-4 mb-8">
        <div className="h-24 bg-muted rounded w-full mb-4 animate-pulse"></div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
            <div className="h-8 w-24 bg-muted rounded animate-pulse"></div>
          </div>
          <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
        </div>
      </div>

      {/* Recent Projects Header Skeleton */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Recent projects</h2>
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>

      {/* Project List Skeleton */}
      <div className="space-y-2">
        <div className="h-16 bg-card rounded-lg animate-pulse"></div>
        <div className="h-16 bg-card rounded-lg animate-pulse"></div>
        <div className="h-16 bg-card rounded-lg animate-pulse"></div>
      </div>
    </div>
  );
};

export default LoadingSkeleton;
