import { DeviceType } from "@/app/store/useEditorStore";

interface SectionProps {
    activeDevice: DeviceType;
    sectionId: string;
}

import { EditableText } from "@/components/editor/EditableText";

export const Testimonials1 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-gray-50">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-3xl font-bold text-center text-gray-900 mb-16 hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="title" defaultValue="Trusted by Developers" />
                </h2>
                <div className={`grid gap-8 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex text-yellow-400 mb-4">{"★".repeat(5)}</div>
                            <p className="text-gray-600 mb-6 leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`testimonial-${i}-quote`} defaultValue='"This tool has revolutionized how we build websites. The speed and flexibility are unmatched in the industry."' />
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                                <div>
                                    <div className="font-bold text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                                        <EditableText sectionId={sectionId} field={`testimonial-${i}-author`} defaultValue="Alex Johnson" />
                                    </div>
                                    <div className="text-sm text-gray-500 hover:outline hover:outline-2 hover:outline-blue-500">
                                        <EditableText sectionId={sectionId} field={`testimonial-${i}-role`} defaultValue="CTO, TechStart" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const Testimonials2 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-32 bg-white">
            <div className="max-w-4xl mx-auto text-center">
                <div className="w-20 h-20 bg-gray-200 rounded-full mx-auto mb-8"></div>
                <blockquote className="text-2xl md:text-4xl font-medium text-gray-900 leading-tight mb-8 hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="quote" defaultValue='"We&apos;ve tried every tool out there, and nothing comes close to the ease of use and power that Wirely provides. It&apos;s simply in a league of its own."' />
                </blockquote>
                <cite className="not-italic">
                    <div className="font-bold text-lg text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="author" defaultValue="Sarah Williams" />
                    </div>
                    <div className="text-gray-500 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="role" defaultValue="VP of Engineering at CloudScale" />
                    </div>
                </cite>
            </div>
        </div>
    );
};

export const Testimonials3 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-[#1a1a2e]">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-end mb-12">
                    <h2 className="text-3xl font-bold text-white hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="title" defaultValue="Loved by Thousands" />
                    </h2>
                    <button className="text-gray-400 hover:text-white text-sm hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="link" defaultValue="View all stories →" />
                    </button>
                </div>
                <div className={`grid gap-6 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="bg-white/5 p-6 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500"></div>
                                <div className="text-sm font-medium text-white hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`user-${i}-name`} defaultValue={`User ${i}`} />
                                </div>
                            </div>
                            <p className="text-gray-300 text-sm leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`user-${i}-review`} defaultValue='"Just wow. The new update is exactly what I was waiting for. Incredible work team!"' />
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
