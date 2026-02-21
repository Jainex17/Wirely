interface GeneratingPreviewPlaceholderProps {
  className?: string;
}

const blobOneStyle = {
  backgroundImage:
    "radial-gradient(circle at 30% 30%, var(--primary) 0%, var(--chart-2) 35%, var(--chart-3) 60%, transparent 72%)",
  animation: "gradient-flow-1 15s ease-in-out infinite",
} as const;

const blobTwoStyle = {
  backgroundImage:
    "radial-gradient(circle at 55% 45%, var(--accent) 0%, var(--chart-4) 35%, var(--chart-5) 62%, transparent 74%)",
  animation: "gradient-flow-2 18s ease-in-out infinite",
} as const;

const blobThreeStyle = {
  backgroundImage:
    "radial-gradient(circle at 45% 45%, var(--primary) 0%, var(--accent) 40%, transparent 68%)",
  animation: "gradient-flow-3 20s ease-in-out infinite",
} as const;

const overlayStyle = {
  backgroundImage:
    "radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--primary-foreground) 20%, transparent) 0%, color-mix(in srgb, var(--primary-foreground) 8%, transparent) 28%, color-mix(in srgb, var(--foreground) 60%, transparent) 64%, color-mix(in srgb, var(--foreground) 85%, transparent) 100%)",
} as const;

const depthStyle = {
  backgroundImage:
    "linear-gradient(180deg, color-mix(in srgb, var(--background) 20%, transparent) 0%, color-mix(in srgb, var(--background) 65%, transparent) 70%, color-mix(in srgb, var(--background) 92%, transparent) 100%)",
} as const;

const topLightStyle = {
  backgroundImage:
    "linear-gradient(to bottom, color-mix(in srgb, var(--primary-foreground) 28%, transparent) 0%, color-mix(in srgb, var(--primary-foreground) 10%, transparent) 45%, transparent 100%)",
} as const;

export default function GeneratingPreviewPlaceholder({
  className,
}: GeneratingPreviewPlaceholderProps) {
  return (
    <div
      className={`relative isolate h-full w-full overflow-hidden bg-background ${className ?? ""}`}
    >
      {/* Animated gradient blobs with flowing movement */}
      <div
        className="absolute -left-24 -top-20 h-[70%] w-[70%] rounded-[45%] blur-3xl opacity-90"
        style={blobOneStyle}
      />
      <div
        className="absolute -right-20 top-10 h-[75%] w-[65%] rounded-[48%] blur-3xl opacity-90"
        style={blobTwoStyle}
      />
      <div
        className="absolute left-[12%] bottom-[-10%] h-[45%] w-[55%] rounded-[50%] blur-3xl opacity-70"
        style={blobThreeStyle}
      />

      {/* Overlay layers */}
      <div className="absolute inset-0" style={overlayStyle} />
      <div className="absolute inset-0" style={depthStyle} />
      <div className="absolute inset-x-0 top-0 h-48 backdrop-blur-2xl" style={topLightStyle} />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      {/* Loading indicator */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-foreground/85">
        <div className="h-1.5 w-24 rounded-full bg-foreground/50 overflow-hidden">
          <div
            className="h-full w-1/2 rounded-full bg-primary"
            style={{
              animation: 'shimmer 1.6s ease-in-out infinite',
            }}
          />
        </div>
        <p className="text-xs font-semibold tracking-[0.32em] uppercase">
          Generating design
        </p>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes gradient-flow-1 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
          }
          25% {
            transform: translate(20px, -15px) scale(1.1) rotate(5deg);
          }
          50% {
            transform: translate(-10px, 20px) scale(0.95) rotate(-3deg);
          }
          75% {
            transform: translate(15px, 10px) scale(1.05) rotate(2deg);
          }
        }

        @keyframes gradient-flow-2 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
          }
          33% {
            transform: translate(-25px, 15px) scale(1.15) rotate(-8deg);
          }
          66% {
            transform: translate(10px, -20px) scale(0.9) rotate(5deg);
          }
        }

        @keyframes gradient-flow-3 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: 0.7;
          }
          50% {
            transform: translate(-15px, -25px) scale(1.2) rotate(10deg);
            opacity: 0.9;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
}
