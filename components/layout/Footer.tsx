import { DeviceType } from "@/app/store/useEditorStore";
import { EditableText } from "@/components/editor/EditableText";

interface FooterProps {
    activeDevice: DeviceType;
    sectionId: string;
}

export const Footer1 = ({ activeDevice, sectionId }: FooterProps) => {
    return (
        <div className="w-full bg-[#0f172a] px-8 py-16 border-t border-gray-800">
            <div className="max-w-7xl mx-auto">
                <div className="grid gap-12" style={{ gridTemplateColumns: activeDevice === "mobile" ? "1fr" : "2fr 1fr 1fr 1fr" }}>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-white font-bold text-2xl">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">O</div>
                            <span className="hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field="brand" defaultValue="WIRELY" />
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm max-w-xs leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="description" defaultValue="Making web design accessible, powerful, and fun for everyone. Built with modern technology for modern brands." />
                        </p>
                        <div className="flex gap-4 pt-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 cursor-pointer transition-colors" />
                            ))}
                        </div>
                    </div>

                    {[
                        { title: "Product", links: ["Features", "Templates", "Integrations", "Pricing"] },
                        { title: "Resources", links: ["Documentation", "Guides", "Blog", "Support"] },
                        { title: "Company", links: ["About Us", "Careers", "Legal", "Privacy"] }
                    ].map((col, i) => (
                        <div key={i} className={activeDevice === "mobile" ? "hidden" : "block"}>
                            <h4 className="text-white font-semibold mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field={`col-${i}-title`} defaultValue={col.title} />
                            </h4>
                            <ul className="space-y-3">
                                {col.links.map((link, j) => (
                                    <li key={j}><a href="#" className="text-gray-400 hover:text-white text-sm transition-colors hover:outline hover:outline-2 hover:outline-blue-500">
                                        <EditableText sectionId={sectionId} field={`col-${i}-link-${j}`} defaultValue={link} />
                                    </a></li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
                <div className="mt-16 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4 text-gray-500 text-sm">
                    <p className="hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="copyright" defaultValue="&copy; 2024 Wirely Inc. All rights reserved." />
                    </p>
                    <div className="flex gap-6">
                        <span className="hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="privacy" defaultValue="Privacy Policy" />
                        </span>
                        <span className="hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="terms" defaultValue="Terms of Service" />
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Footer2 = ({ activeDevice, sectionId }: FooterProps) => {
    return (
        <div className="w-full bg-white border-t border-gray-100 py-12 px-6">
            <div className="max-w-4xl mx-auto text-center">
                <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="font-bold text-2xl tracking-tighter text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="brand" defaultValue="Wirely" />
                    </span>
                </div>
                <ul className="flex flex-wrap justify-center gap-6 mb-8 text-gray-600 font-medium">
                    {["Home", "About", "Services", "Contact"].map((item, i) => (
                        <li key={i}><a href="#" className="hover:text-black hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field={`menu-item-${i}`} defaultValue={item} />
                        </a></li>
                    ))}
                </ul>
                <div className="flex justify-center gap-4 mb-8">
                    
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 text-gray-500">t</div>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 text-gray-500">ig</div>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 text-gray-500">li</div>
                </div>
                <p className="text-gray-400 text-sm hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="copyright" defaultValue="&copy; 2024 Wirely. All rights reserved." />
                </p>
            </div>
        </div>
    );
};

export const Footer3 = ({ activeDevice, sectionId }: FooterProps) => {
    return (
        <div className="w-full bg-black text-white py-10 px-8">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-full"></div>
                    <span className="font-bold text-xl hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="brand" defaultValue="Wirely" />
                    </span>
                </div>
                <div className="flex gap-8 text-sm text-gray-300">
                    <a href="#" className="hover:text-white hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="link-terms" defaultValue="Terms" />
                    </a>
                    <a href="#" className="hover:text-white hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="link-privacy" defaultValue="Privacy" />
                    </a>
                    <a href="#" className="hover:text-white hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="link-cookies" defaultValue="Cookies" />
                    </a>
                </div>
            </div>
        </div>
    );
};
