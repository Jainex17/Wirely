import { Plus } from "lucide-react";

interface EmptyPageStateProps {
  onShowTemplateModal: () => void;
}

export default function EmptyPageState({ onShowTemplateModal }: EmptyPageStateProps) {
  return (
    <div className="w-full h-[800px] flex flex-col items-center justify-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onShowTemplateModal();
        }}
        className="group flex flex-col items-center gap-6 p-12 rounded-2xl transition-all duration-300"
      >
        <div className="w-24 h-24 rounded-full bg-blue-500 cursor-pointer flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
          <Plus className="w-10 h-10 text-white" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-2">Choose a Template</h3>
          <p className="text-gray-500 max-w-xs">
            Start with a pre-built template and customize it to match your brand
          </p>
        </div>
      </button>
    </div>
  );
}