"use client";

import { DeviceType } from "@/app/store/useEditorStore";
import { EditableText } from "@/components/editor/EditableText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SectionProps {
    activeDevice: DeviceType;
    sectionId: string;
}

export const Contact1 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-white">
            <div className="max-w-6xl mx-auto">
                <div className={`grid gap-16 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="title" defaultValue="Get in touch" />
                        </h2>
                        <p className="text-lg text-gray-600 mb-10 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="description" defaultValue="Have a question or want to work together? We'd love to hear from you." />
                        </p>

                        <div className="space-y-8">
                            {[
                                { icon: "📍", label: "Office", value: "123 Innovation Street, San Francisco, CA 94102" },
                                { icon: "📧", label: "Email", value: "hello@wirely.io" },
                                { icon: "📞", label: "Phone", value: "+1 (555) 123-4567" },
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl">
                                        {item.icon}
                                    </div>
                                    <div>
                                        <div className="text-sm text-gray-500 mb-1 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`contact-${i}-label`} defaultValue={item.label} />
                                        </div>
                                        <div className="font-medium text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`contact-${i}-value`} defaultValue={item.value} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-10 pt-8 border-t border-gray-100">
                            <p className="text-gray-500 mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field="socialLabel" defaultValue="Follow us on social media" />
                            </p>
                            <div className="flex gap-4">
                                {["Twitter", "LinkedIn", "GitHub"].map((social, i) => (
                                    <div
                                        key={i}
                                        className="px-4 py-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors cursor-pointer text-sm font-medium hover:outline hover:outline-2 hover:outline-blue-500"
                                    >
                                        <EditableText sectionId={sectionId} field={`social-${i}`} defaultValue={social} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <Card className="border-gray-100 shadow-xl">
                        <CardContent className="p-8">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                                <EditableText sectionId={sectionId} field="formTitle" defaultValue="Send us a message" />
                            </h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                                        <Input placeholder="John" className="h-12" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                                        <Input placeholder="Doe" className="h-12" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                    <Input type="email" placeholder="john@example.com" className="h-12" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                                    <textarea
                                        className="w-full h-32 px-4 py-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        placeholder="Tell us about your project..."
                                    />
                                </div>
                                <Button className="w-full h-12 bg-gray-900 hover:bg-gray-800 font-semibold hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field="submitBtn" defaultValue="Send Message" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export const Contact2 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-[#0a0a0a]">
            <div className="max-w-4xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium mb-8 border border-blue-500/30 hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="badge" defaultValue="We're hiring!" />
                </div>

                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="title" defaultValue="Let's build something great together" />
                </h2>
                <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto hover:outline hover:outline-2 hover:outline-blue-500">
                    <EditableText sectionId={sectionId} field="description" defaultValue="Whether you have a question about features, pricing, or anything else, our team is ready to answer all your questions." />
                </p>

                <div className={`grid gap-6 mb-12 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {[
                        { title: "Sales", desc: "Discuss plans and pricing", email: "sales@wirely.io" },
                        { title: "Support", desc: "Get help with your account", email: "support@wirely.io" },
                        { title: "Partnerships", desc: "Explore collaboration", email: "partners@wirely.io" },
                    ].map((item, i) => (
                        <Card key={i} className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                            <CardContent className="p-6 text-center">
                                <h3 className="text-white font-bold mb-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`option-${i}-title`} defaultValue={item.title} />
                                </h3>
                                <p className="text-gray-400 text-sm mb-3 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`option-${i}-desc`} defaultValue={item.desc} />
                                </p>
                                <span className="text-blue-400 font-medium hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`option-${i}-email`} defaultValue={item.email} />
                                </span>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <div className="flex items-center justify-center gap-8 text-gray-500">
                    <div className="flex items-center gap-2 hover:outline hover:outline-2 hover:outline-blue-500">
                        <span>⚡</span>
                        <EditableText sectionId={sectionId} field="feature1" defaultValue="Replies within 24 hours" />
                    </div>
                    <div className="flex items-center gap-2 hover:outline hover:outline-2 hover:outline-blue-500">
                        <span>🌍</span>
                        <EditableText sectionId={sectionId} field="feature2" defaultValue="Global support team" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const Contact3 = ({ activeDevice, sectionId }: SectionProps) => {
    return (
        <div className="w-full px-8 py-24 bg-gradient-to-br from-blue-50 to-indigo-100">
            <div className="max-w-6xl mx-auto">
                <div className={`flex ${activeDevice === 'mobile' ? 'flex-col gap-12' : 'items-center gap-16'}`}>
                    <div className="flex-1">
                        <span className="text-blue-600 font-semibold text-sm uppercase tracking-wider hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="badge" defaultValue="Contact Us" />
                        </span>
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4 mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="title" defaultValue="Start a conversation" />
                        </h2>
                        <p className="text-lg text-gray-600 mb-8 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="description" defaultValue="Our friendly team would love to hear from you." />
                        </p>

                        <div className="bg-white rounded-2xl p-8 shadow-lg">
                            <div className="space-y-4">
                                <Input placeholder="Your email" className="h-12 border-gray-200" />
                                <Input placeholder="Subject" className="h-12 border-gray-200" />
                                <textarea
                                    className="w-full h-32 px-4 py-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    placeholder="Your message..."
                                />
                                <Button className="w-full h-12 bg-blue-600 hover:bg-blue-700 font-semibold hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field="submitBtn" defaultValue="Send Message" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-6">
                        {[
                            { icon: "💬", title: "Chat with us", desc: "We're online Mon-Fri 9am-6pm", action: "Start a chat" },
                            { icon: "📧", title: "Email us", desc: "We'll respond within 24 hours", action: "hello@wirely.io" },
                            { icon: "📞", title: "Call us", desc: "Mon-Fri from 9am to 6pm", action: "+1 (555) 123-4567" },
                        ].map((item, i) => (
                            <div key={i} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-2xl">
                                        {item.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 mb-1 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`method-${i}-title`} defaultValue={item.title} />
                                        </h3>
                                        <p className="text-gray-500 text-sm mb-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`method-${i}-desc`} defaultValue={item.desc} />
                                        </p>
                                        <span className="text-blue-600 font-medium hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`method-${i}-action`} defaultValue={item.action} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
