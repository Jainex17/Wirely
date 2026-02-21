"use client";

interface CardProps {
  title: string;
}

export default function Card({ title }: CardProps) {
  return (
    <div
      className="bg-card border-2 border-border rounded-lg shadow-lg p-6"
      style={{
        width: "1080px",
        minHeight: "2080px",
      }}
    >
      <div className="w-full h-full flex flex-col gap-4">
        <div className="w-full h-32 rounded-md"></div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-muted-foreground text-sm">
          This is a fixed-size card representing a website section.
        </p>
        <div className="flex-1 border-2 border-dashed border-border rounded-md flex items-center justify-center text-muted-foreground">
          Content Area
        </div>
      </div>
    </div>
  );
}
