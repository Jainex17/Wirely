interface GeneratingPreviewPlaceholderProps {
  className?: string;
}

export default function GeneratingPreviewPlaceholder({
  className,
}: GeneratingPreviewPlaceholderProps) {
  return (
    <div
      className={`relative isolate h-full w-full overflow-hidden bg-[#05010f] ${className ?? ""}`}
    >
      <div className="absolute -left-24 -top-20 h-[70%] w-[70%] animate-[pulse_8s_ease-in-out_infinite] rounded-[45%] bg-[radial-gradient(circle_at_30%_30%,#61e8ff_0%,#58b0ff_35%,#8b4dff_60%,rgba(5,1,15,0)_72%)] blur-3xl opacity-90" />
      <div className="absolute -right-20 top-10 h-[75%] w-[65%] animate-[pulse_10s_ease-in-out_infinite] rounded-[48%] bg-[radial-gradient(circle_at_55%_45%,#ff5fd2_0%,#d91bff_35%,#3b1ea8_62%,rgba(5,1,15,0)_74%)] blur-3xl opacity-90" />
      <div className="absolute left-[12%] bottom-[-10%] h-[45%] w-[55%] animate-[pulse_12s_ease-in-out_infinite] rounded-[50%] bg-[radial-gradient(circle_at_45%_45%,#36f3ff_0%,#2a7bff_40%,rgba(5,1,15,0)_68%)] blur-3xl opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.02)_28%,rgba(0,0,0,0.7)_64%,rgba(0,0,0,0.95)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,1,15,0.2)_0%,rgba(5,1,15,0.65)_70%,rgba(5,1,15,0.95)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.08)_45%,rgba(255,255,255,0)_100%)] backdrop-blur-2xl" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-white/85">
        <div className="h-1.5 w-24 rounded-full bg-white/50">
          <div className="h-full w-1/2 animate-[pulse_1.6s_ease-in-out_infinite] rounded-full bg-white" />
        </div>
        <p className="text-xs font-semibold tracking-[0.32em] uppercase">
          Generating design
        </p>
      </div>
    </div>
  );
}
