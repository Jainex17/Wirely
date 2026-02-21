// components/LoadingSkeleton.tsx
const LoadingSkeleton = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-10 bg-muted rounded w-3/4 mx-auto mb-8"></div>

      {/* Form Skeleton */}
      <div className="bg-card border border-border rounded-xl p-4 mb-8">
        <div className="h-24 bg-muted rounded w-full mb-4"></div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-muted rounded"></div>
            <div className="h-8 w-24 bg-muted rounded"></div>
          </div>
          <div className="h-8 w-20 bg-muted rounded"></div>
        </div>
      </div>

      {/* Recent Projects Header Skeleton */}
      <div className="flex justify-between items-center mb-4">
        <div className="h-6 bg-muted rounded w-1/4"></div>
        <div className="h-6 bg-muted rounded w-20"></div>
      </div>

      {/* Project List Skeleton */}
      <div className="space-y-2">
        <div className="h-16 bg-card rounded-lg"></div>
        <div className="h-16 bg-card rounded-lg"></div>
        <div className="h-16 bg-card rounded-lg"></div>
      </div>
    </div>
  );
};

export default LoadingSkeleton;
