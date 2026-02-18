"use client";

interface CardProps {
  title: string;
}

export default function Card({ title }: CardProps) {
  return (
    <div
      className="bg-white border-2 border-gray-300 rounded-lg shadow-lg p-6"
      style={{
        width: "1080px",
        minHeight: "2080px",
      }}
    >
      <div className="w-full h-full flex flex-col gap-4">
        <div className="w-full h-32 rounded-md"></div>
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        <p className="text-gray-600 text-sm">
          This is a fixed-size card representing a website section.
        </p>
        <div className="flex-1 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center text-gray-400">
          Content Area
        </div>
      </div>
    </div>
  );
}
