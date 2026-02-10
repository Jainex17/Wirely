import { DeviceType } from "@/app/store/useEditorStore";

import { EditableText } from "@/components/editor/EditableText";

interface SectionProps {
    activeDevice: DeviceType;
    sectionId: string;
}

export const Features1 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-20 bg-white">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="title" defaultValue="Amazing Features" />
                    </h2>
                    <p className="text-gray-600 max-w-2xl mx-auto hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="description" defaultValue="Discover what makes our platform stand out from the rest." />
                    </p>
                </div>
                <div className={`grid gap-12 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {[
                        { title: "Real-time Sync", desc: "Collaborate with your team in real-time.", icon: "🔄" },
                        { title: "Global CDN", desc: "Lightning fast content delivery worldwide.", icon: "🌍" },
                        { title: "Bank-grade Security", desc: "Your data is safe with us.", icon: "🔒" },
                        { title: "24/7 Support", desc: "We are here when you need us.", icon: "💬" },
                        { title: "Auto Scaling", desc: "Handle any amount of traffic effortlessly.", icon: "📈" },
                        { title: "Custom Domain", desc: "Use your own brand name.", icon: "🔗" }
                    ].map((f, i) => (
                        <div key={i} className="flex gap-4 items-start">
                            <div className="text-2xl p-3 bg-gray-100 rounded-lg">{f.icon}</div>
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-title`} defaultValue={f.title} />
                                </h3>
                                <p className="text-gray-600 leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-desc`} defaultValue={f.desc} />
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const Features2 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-20 bg-gray-50">
            <div className="max-w-6xl mx-auto space-y-24">
                {[
                    { title: "Seamless Integration", desc: "Connect with your favorite tools in seconds.", icon: "🔌", align: "right" },
                    { title: "Advanced Analytics", desc: "Track every metric that matters to your growth.", icon: "📊", align: "left" },
                    { title: "Team Collaboration", desc: "Work together without stepping on toes.", icon: "👥", align: "right" }
                ].map((f, i) => (
                    <div key={i} className={`flex items-center gap-12 ${activeDevice === 'mobile' ? 'flex-col' : f.align === 'left' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="flex-1 space-y-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-3xl">
                                {f.icon}
                            </div>
                            <h3 className="text-3xl font-bold text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`feature-${i}-title`} defaultValue={f.title} />
                            </h3>
                            <p className="text-lg text-gray-600 leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`feature-${i}-desc`} defaultValue={f.desc} />
                            </p>
                            <button className="text-blue-600 font-semibold hover:text-blue-700 flex items-center gap-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`feature-${i}-link`} defaultValue="Learn more" /> <span className="hover:outline hover:outline-2 hover:outline-blue-500">→</span>
                            </button>
                        </div>
                        <div className="flex-1 bg-white rounded-3xl shadow-xl h-[300px] w-full flex items-center justify-center text-gray-300 font-medium border border-gray-100 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field={`feature-${i}-image`} defaultValue="Image Preview" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const Features3 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-white">
            <div className="max-w-4xl mx-auto">
                <div className="space-y-12">
                    <div className="text-center pb-12 border-b border-gray-100">
                        <h2 className="text-3xl font-bold text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="title" defaultValue="Why Choose Us?" />
                        </h2>
                    </div>
                    {[
                        { title: "Performance First", desc: "Built for speed and reliability from the ground up." },
                        { title: "Secure by Design", desc: "Security is not an afterthought, it is our foundation." },
                        { title: "Developer Friendly", desc: "API-first approach with extensive documentation." },
                        { title: "24/7 Expert Support", desc: "Get help from engineers, not bots." }
                    ].map((f, i) => (
                        <div key={i} className="flex gap-6 group hover:bg-gray-50 p-6 rounded-xl transition-colors">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg">
                                {i + 1}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-title`} defaultValue={f.title} />
                                </h3>
                                <p className="text-gray-600 text-lg leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-desc`} defaultValue={f.desc} />
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const Features4 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-[#0a0a0a]">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <span className="inline-block px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium mb-6 border border-blue-500/30 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="badge" defaultValue="FEATURES" />
                    </span>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="title" defaultValue="Everything you need" />
                    </h2>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="description" defaultValue="Powerful tools designed to help you build faster and smarter." />
                    </p>
                </div>

                <div className={`grid gap-4 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-4 grid-rows-2'}`}>
                    <div className={`${activeDevice === 'mobile' ? '' : 'col-span-2 row-span-2'} bg-blue-600 rounded-3xl p-8 relative overflow-hidden group`}>
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0aDR2MWgtNHYtMXptMC0yaDF2NGgtMXYtNHptMCAwIi8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
                        <div className="relative z-10 h-full flex flex-col">
                            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-3 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field="main-feature-title" defaultValue="Lightning Fast" />
                            </h3>
                            <p className="text-white/80 text-lg flex-1 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field="main-feature-desc" defaultValue="Built on cutting-edge technology to ensure maximum performance. Your websites load in milliseconds, not seconds." />
                            </p>
                        </div>
                    </div>

                    
                    {[
                        { icon: "🔒", title: "Secure", desc: "Enterprise-grade security" },
                        { icon: "🌍", title: "Global CDN", desc: "200+ edge locations" },
                        { icon: "📊", title: "Analytics", desc: "Real-time insights" },
                        { icon: "🔄", title: "Auto Backup", desc: "Never lose your work" }
                    ].map((feat, i) => (
                        <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group">
                            <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">{feat.icon}</div>
                            <h3 className="text-lg font-bold text-white mb-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`feat-${i}-title`} defaultValue={feat.title} />
                            </h3>
                            <p className="text-gray-400 text-sm hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`feat-${i}-desc`} defaultValue={feat.desc} />
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const Features5 = ({ activeDevice, sectionId }: SectionProps) => {
    const features = [
        { icon: "✨", title: "AI-Powered", desc: "Smart suggestions that learn from your style", color: "bg-amber-500" },
        { icon: "🎨", title: "Beautiful Design", desc: "Pixel-perfect components out of the box", color: "bg-pink-500" },
        { icon: "⚡", title: "Blazing Fast", desc: "Optimized for performance at every level", color: "bg-blue-500" },
        { icon: "🔐", title: "Secure by Default", desc: "Built with security as a first principle", color: "bg-green-500" },
        { icon: "🌐", title: "Global Scale", desc: "Deploy worldwide in one click", color: "bg-purple-500" },
        { icon: "💬", title: "24/7 Support", desc: "Real humans ready to help anytime", color: "bg-red-500" },
    ];

    return (
        <div className="w-full px-8 py-24 bg-white">
            <div className="max-w-7xl mx-auto">
                <div className={`flex ${activeDevice === 'mobile' ? 'flex-col gap-12' : 'items-start gap-20'}`}>
                    <div className="flex-shrink-0 max-w-md sticky top-24">
                        <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="badge" defaultValue="Why Wirely" />
                        </span>
                        <h2 className="text-4xl font-bold text-gray-900 mt-4 mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="title" defaultValue="Features that set us apart" />
                        </h2>
                        <p className="text-lg text-gray-600 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="description" defaultValue="We've thought about every detail so you can focus on what matters most building great products." />
                        </p>
                    </div>

                    <div className={`flex-1 grid gap-6 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {features.map((feat, i) => (
                            <div key={i} className="group p-6 rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-xl transition-all duration-300">
                                <div className={`w-12 h-12 rounded-xl ${feat.color} flex items-center justify-center text-white text-xl mb-4 group-hover:scale-110 transition-transform`}>
                                    {feat.icon}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-title`} defaultValue={feat.title} />
                                </h3>
                                <p className="text-gray-600 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`feature-${i}-desc`} defaultValue={feat.desc} />
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
