"use client";

import { useState } from "react";
import { DeviceType } from "@/app/store/useEditorStore";
import { EditableText } from "@/components/editor/EditableText";
import { Card, CardContent } from "@/components/ui/card";

interface SectionProps {
    activeDevice: DeviceType;
    sectionId: string;
}

export const FAQ1 = ({ activeDevice, sectionId }: SectionProps) => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs = [
        { q: "How do I get started?", a: "Simply sign up for a free account and you'll be guided through the setup process. It takes less than 5 minutes." },
        { q: "Is there a free trial?", a: "Yes! We offer a 14-day free trial with full access to all features. No credit card required." },
        { q: "Can I cancel anytime?", a: "Absolutely. You can cancel your subscription at any time with no questions asked." },
        { q: "Do you offer refunds?", a: "We offer a 30-day money-back guarantee. If you're not satisfied, we'll refund your purchase." },
        { q: "What payment methods do you accept?", a: "We accept all major credit cards, PayPal, and bank transfers for enterprise plans." },
    ];

    return (
        <div className="w-full px-8 py-24 bg-gray-50">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-16">
                    <span className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-sm font-medium mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="badge" defaultValue="FAQ" />
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="title" defaultValue="Frequently Asked Questions" />
                    </h2>
                    <p className="text-gray-600 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="subtitle" defaultValue="Everything you need to know about our product" />
                    </p>
                </div>

                <div className="space-y-4">
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            className={`bg-white rounded-2xl border transition-all duration-300 ${openIndex === i ? 'border-blue-200 shadow-lg shadow-blue-500/10' : 'border-gray-100'}`}
                        >
                            <button
                                className="w-full p-6 text-left flex items-center justify-between"
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                            >
                                <span className="font-semibold text-gray-900 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`faq-${i}-q`} defaultValue={faq.q} />
                                </span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${openIndex === i ? 'bg-blue-600 text-white rotate-180' : 'bg-gray-100 text-gray-600'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>
                            <div className={`overflow-hidden transition-all duration-300 ${openIndex === i ? 'max-h-40' : 'max-h-0'}`}>
                                <div className="px-6 pb-6 text-gray-600 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`faq-${i}-a`} defaultValue={faq.a} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-12 text-center">
                    <p className="text-gray-500 mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="bottomText" defaultValue="Still have questions?" />
                    </p>
                    <button className="text-blue-600 font-semibold hover:text-blue-700 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="contactLink" defaultValue="Contact our support team →" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export const FAQ2 = ({ activeDevice, sectionId }: SectionProps) => {
    const faqs = [
        { q: "What's included in each plan?", a: "Each plan includes core features plus additional benefits as you go up in tiers." },
        { q: "How does billing work?", a: "We bill monthly or annually depending on your preference. Annual billing saves you 20%." },
        { q: "Can I upgrade my plan later?", a: "Yes, you can upgrade or downgrade at any time. Changes take effect immediately." },
    ];

    return (
        <div className="w-full px-8 py-24 bg-white">
            <div className="max-w-6xl mx-auto">
                <div className={`grid gap-16 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <div>
                        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="title" defaultValue="Got questions? We've got answers." />
                        </h2>
                        <p className="text-lg text-gray-600 mb-8 hover:outline hover:outline-2 hover:outline-blue-500">
                            <EditableText sectionId={sectionId} field="description" defaultValue="Can't find what you're looking for? Reach out to our friendly support team." />
                        </p>
                        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                            <CardContent className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl">
                                        💬
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 mb-1 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field="supportTitle" defaultValue="Need more help?" />
                                        </h4>
                                        <p className="text-gray-600 text-sm mb-3 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field="supportDesc" defaultValue="Our team is here to help you 24/7" />
                                        </p>
                                        <button className="text-blue-600 font-semibold text-sm hover:text-blue-700 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field="supportLink" defaultValue="Start a conversation →" />
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-6">
                        {faqs.map((faq, i) => (
                            <div key={i} className="pb-6 border-b border-gray-100 last:border-0">
                                <h3 className="text-lg font-bold text-gray-900 mb-3 hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`faq-${i}-q`} defaultValue={faq.q} />
                                </h3>
                                <p className="text-gray-600 leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                    <EditableText sectionId={sectionId} field={`faq-${i}-a`} defaultValue={faq.a} />
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const FAQ3 = ({ activeDevice, sectionId }: SectionProps) => {
    const categories = [
        {
            title: "General",
            faqs: [
                { q: "What is Wirely?", a: "Wirely is a modern website builder for developers and designers." },
                { q: "Who is it for?", a: "Anyone who wants to build beautiful websites without the hassle." },
            ]
        },
        {
            title: "Billing",
            faqs: [
                { q: "How much does it cost?", a: "We offer plans starting at $0/month with our free tier." },
                { q: "Can I get a refund?", a: "Yes, we offer a 30-day money-back guarantee on all paid plans." },
            ]
        },
    ];

    return (
        <div className="w-full px-8 py-24 bg-[#1a1a2e]">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="title" defaultValue="Common Questions" />
                    </h2>
                    <p className="text-gray-400 hover:outline hover:outline-2 hover:outline-blue-500">
                        <EditableText sectionId={sectionId} field="subtitle" defaultValue="Quick answers to help you get started faster" />
                    </p>
                </div>

                <div className={`grid gap-12 ${activeDevice === 'mobile' ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {categories.map((cat, catIndex) => (
                        <div key={catIndex}>
                            <h3 className="text-white font-bold text-lg mb-6 flex items-center gap-2 hover:outline hover:outline-2 hover:outline-blue-500">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <EditableText sectionId={sectionId} field={`cat-${catIndex}-title`} defaultValue={cat.title} />
                            </h3>
                            <div className="space-y-6">
                                {cat.faqs.map((faq, i) => (
                                    <div key={i} className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
                                        <h4 className="text-white font-semibold mb-3 hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`cat-${catIndex}-faq-${i}-q`} defaultValue={faq.q} />
                                        </h4>
                                        <p className="text-gray-400 text-sm leading-relaxed hover:outline hover:outline-2 hover:outline-blue-500">
                                            <EditableText sectionId={sectionId} field={`cat-${catIndex}-faq-${i}-a`} defaultValue={faq.a} />
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
