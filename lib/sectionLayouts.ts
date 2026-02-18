export type SectionType =
    | "navbar"
    | "hero"
    | "features"
    | "content"
    | "testimonials"
    | "pricing"
    | "cta"
    | "footer"
    | "stats"
    | "team"
    | "faq"
    | "contact"
    | "newsletter"
    | "logocloud";

export interface LayoutOption {
    id: string;
    name: string;
    gridTemplate?: string;
}

export const SECTION_LAYOUTS: Record<SectionType, LayoutOption[]> = {
    navbar: [
        { id: "nav-1", name: "Standard Full Width" },
        { id: "nav-2", name: "Floating Pill" },
        { id: "nav-3", name: "Logo Left, Nav Center, CTA Right" },
        { id: "nav-4", name: "Minimal with Hamburger" },
    ],
    hero: [
        { id: "hero-1", name: "Left Text, Right Image" },
        { id: "hero-2", name: "Center Text, Bottom Image" },
        { id: "hero-3", name: "Full Width Background" },
        { id: "hero-4", name: "Split with Features" },
    ],
    features: [
        { id: "features-1", name: "Grid Icons" },
        { id: "features-2", name: "Alternating Side-by-Side" },
        { id: "features-3", name: "List View" },
        { id: "features-4", name: "Feature Cards" },
        { id: "features-5", name: "Icon Grid Minimal" },
    ],
    content: [
        { id: "content-1", name: "3 Column Grid" },
        { id: "content-2", name: "2 Column Grid" },
        { id: "content-3", name: "Feature Highlight (Left/Right)" },
    ],
    testimonials: [
        { id: "testimonials-1", name: "3 Cards Row" },
        { id: "testimonials-2", name: "Single Large Quote" },
        { id: "testimonials-3", name: "Masonry Grid" },
    ],
    pricing: [
        { id: "pricing-1", name: "3 Tiers" },
        { id: "pricing-2", name: "2 Tiers with Comparison" },
    ],
    cta: [
        { id: "cta-1", name: "Simple Center" },
        { id: "cta-2", name: "Split Left/Right" },
        { id: "cta-3", name: "Gradient Background" },
        { id: "cta-4", name: "Newsletter Style" },
    ],
    footer: [
        { id: "footer-1", name: "4 Columns" },
        { id: "footer-2", name: "Simple Concentrated" },
        { id: "footer-3", name: "Logo + Links Horizontal" },
    ],
    stats: [
        { id: "stats-1", name: "Horizontal Stats Bar" },
        { id: "stats-2", name: "Stats with Icons" },
        { id: "stats-3", name: "Dark Background Stats" },
    ],
    team: [
        { id: "team-1", name: "Grid with Details" },
        { id: "team-2", name: "Compact Cards" },
        { id: "team-3", name: "Full Width Cards" },
    ],
    faq: [
        { id: "faq-1", name: "Accordion Style" },
        { id: "faq-2", name: "Two Column Grid" },
        { id: "faq-3", name: "Cards with Expand" },
    ],
    contact: [
        { id: "contact-1", name: "Form with Info" },
        { id: "contact-2", name: "Centered Form" },
        { id: "contact-3", name: "Split Layout" },
    ],
    newsletter: [
        { id: "newsletter-1", name: "Simple Inline" },
        { id: "newsletter-2", name: "Card with Benefits" },
        { id: "newsletter-3", name: "Minimal Dark" },
    ],
    logocloud: [
        { id: "logocloud-1", name: "Simple Row" },
        { id: "logocloud-2", name: "With Heading" },
        { id: "logocloud-3", name: "Dark Background" },
    ],
};
