import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { SectionType } from '@/app/lib/sectionLayouts';
import { useState } from 'react';

export type DeviceType = "desktop" | "tablet" | "mobile";
export type TemplateType = "saas" | "business" | "portfolio" | "ecommerce" | null;

export interface CanvasState {
    zoom: number;
    panOffset: { x: number; y: number };
    activeDevice: DeviceType;
    isDragging: boolean;
}

export interface SectionData {
    id: string;
    type: SectionType;
    layoutId: string;
    name?: string;
    backgroundColor?: string;
    content: Record<string, unknown>;
}

export interface PageData {
    id: string;
    title: string;
    sections: string[];
}

export interface ProjectState {
    pages: PageData[];
    sections: Record<string, SectionData>;
    selectedSectionId: string | null;
    draggingSectionId: string | null;
    activeTemplate: TemplateType;
}

export interface AddSectionSidebarState {
    isOpen: boolean;
    position?: number;
    pageId?: string;
}

export interface EditorState extends CanvasState, ProjectState {
    addSectionSidebar: AddSectionSidebarState;
    setAddSectionSidebar: (state: AddSectionSidebarState) => void;
    setZoom: (zoom: number) => void;
    setPanOffset: (offset: { x: number; y: number }) => void;
    setActiveDevice: (device: DeviceType) => void;
    setSelectedSection: (id: string | null) => void;
    setDraggingSection: (id: string | null) => void;
    updateSectionLayout: (sectionId: string, layoutId: string) => void;
    updateSectionData: (sectionId: string, data: Partial<SectionData>) => void;
    addSection: (pageId: string, section: SectionData, index?: number) => void;
    removeSection: (pageId: string, sectionId: string) => void;
    moveSection: (pageId: string, sectionId: string, direction: 'up' | 'down') => void;
    reorderSection: (pageId: string, sectionId: string, newIndex: number) => void;
    loadTemplate: (templateType: TemplateType) => void;
    loadTemplateToPage: (pageId: string, templateType: TemplateType) => void;
    addPage: () => void;
    deletePage: (pageId: string) => void;
    duplicatePage: (pageId: string) => void;
    renamePage: (pageId: string, newTitle: string) => void;
    initializeWireDefaults: () => void;
    resetProject: () => void;
}

const generateEmptyState = (): Pick<ProjectState, 'pages' | 'sections' | 'selectedSectionId' | 'draggingSectionId' | 'activeTemplate'> => {
    return {
        pages: [{ id: "page-1", title: "Home", sections: [] }],
        sections: {},
        selectedSectionId: null,
        draggingSectionId: null,
        activeTemplate: null
    };
};

const generateSaasTemplate = (): { pages: PageData[], sections: Record<string, SectionData> } => {
    const pages: PageData[] = [{ id: "page-1", title: "Home", sections: [] }];
    const sections: Record<string, SectionData> = {};
    const pageId = "page-1";

    const sectionConfigs: Array<{ id: string; type: SectionType; layoutId: string; backgroundColor?: string }> = [
        { id: `navbar-${pageId}`, type: 'navbar', layoutId: 'nav-1' },
        { id: `hero-${pageId}`, type: 'hero', layoutId: 'hero-1' },
        { id: `features-${pageId}`, type: 'features', layoutId: 'features-1', backgroundColor: '#ffffff' },
        { id: `content-${pageId}`, type: 'content', layoutId: 'content-1', backgroundColor: '#f9fafb' },
        { id: `testimonials-${pageId}`, type: 'testimonials', layoutId: 'testimonials-1', backgroundColor: '#ffffff' },
        { id: `pricing-${pageId}`, type: 'pricing', layoutId: 'pricing-1', backgroundColor: '#f9fafb' },
        { id: `cta-${pageId}`, type: 'cta', layoutId: 'cta-1', backgroundColor: '#1a1a2e' },
        { id: `footer-${pageId}`, type: 'footer', layoutId: 'footer-1' },
    ];

    sectionConfigs.forEach(config => {
        sections[config.id] = {
            id: config.id,
            type: config.type,
            layoutId: config.layoutId,
            backgroundColor: config.backgroundColor,
            content: {}
        };
        pages[0].sections.push(config.id);
    });

    return { pages, sections };
};

const generateBusinessTemplate = (): { pages: PageData[], sections: Record<string, SectionData> } => {
    const pages: PageData[] = [{ id: "page-1", title: "Home", sections: [] }];
    const sections: Record<string, SectionData> = {};
    const pageId = "page-1";

    const sectionConfigs: Array<{ id: string; type: SectionType; layoutId: string; backgroundColor?: string }> = [
        { id: `navbar-${pageId}`, type: 'navbar', layoutId: 'nav-2' },
        { id: `hero-${pageId}`, type: 'hero', layoutId: 'hero-2' },
        { id: `content-${pageId}`, type: 'content', layoutId: 'content-2', backgroundColor: '#ffffff' },
        { id: `features-${pageId}`, type: 'features', layoutId: 'features-2', backgroundColor: '#f8fafc' },
        { id: `testimonials-${pageId}`, type: 'testimonials', layoutId: 'testimonials-2', backgroundColor: '#ffffff' },
        { id: `cta-${pageId}`, type: 'cta', layoutId: 'cta-2', backgroundColor: '#1e293b' },
        { id: `footer-${pageId}`, type: 'footer', layoutId: 'footer-2' },
    ];

    sectionConfigs.forEach(config => {
        sections[config.id] = {
            id: config.id,
            type: config.type,
            layoutId: config.layoutId,
            backgroundColor: config.backgroundColor,
            content: {}
        };
        pages[0].sections.push(config.id);
    });

    return { pages, sections };
};

const DEFAULT_CANVAS_STATE = {
    zoom: 20,
    panOffset: { x: 0, y: 0 },
    activeDevice: "desktop" as DeviceType,
    isDragging: false,
};

export const useEditorStore = create<EditorState>()(
    persist(
        (set) => ({
            ...DEFAULT_CANVAS_STATE,
            ...generateEmptyState(),
            addSectionSidebar: { isOpen: false },

            setAddSectionSidebar: (state) => set({ addSectionSidebar: state }),

            setZoom: (zoom) => set({ zoom }),
            setPanOffset: (panOffset) => set({ panOffset }),
            setActiveDevice: (activeDevice) => set({ activeDevice }),
            setSelectedSection: (selectedSectionId) => set({ selectedSectionId }),
            setDraggingSection: (draggingSectionId) => set({ draggingSectionId }),

            updateSectionLayout: (sectionId, layoutId) => set((state) => ({
                sections: {
                    ...state.sections,
                    [sectionId]: { ...state.sections[sectionId], layoutId }
                }
            })),

            updateSectionData: (sectionId, data) => set((state) => ({
                sections: {
                    ...state.sections,
                    [sectionId]: { ...state.sections[sectionId], ...data }
                }
            })),

            addSection: (pageId, section, index) => set((state) => {
                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                const newPages = [...state.pages];
                const newSectionsList = [...newPages[pageIndex].sections];

                if (typeof index === 'number') {
                    newSectionsList.splice(index, 0, section.id);
                } else {
                    newSectionsList.push(section.id);
                }

                newPages[pageIndex] = { ...newPages[pageIndex], sections: newSectionsList };

                return {
                    pages: newPages,
                    sections: { ...state.sections, [section.id]: section }
                };
            }),

            removeSection: (pageId, sectionId) => set((state) => {
                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                const newPages = [...state.pages];
                newPages[pageIndex] = {
                    ...newPages[pageIndex],
                    sections: newPages[pageIndex].sections.filter(id => id !== sectionId)
                };

                const newSections = { ...state.sections };
                delete newSections[sectionId];

                return {
                    pages: newPages,
                    sections: newSections
                };
            }),

            moveSection: (pageId, sectionId, direction) => set((state) => {
                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                const sections = [...state.pages[pageIndex].sections];
                const currentIndex = sections.indexOf(sectionId);
                if (currentIndex === -1) return state;

                const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
                if (newIndex < 0 || newIndex >= sections.length) return state;

                [sections[currentIndex], sections[newIndex]] = [sections[newIndex], sections[currentIndex]];

                const newPages = [...state.pages];
                newPages[pageIndex] = { ...newPages[pageIndex], sections };

                return { pages: newPages };
            }),

            reorderSection: (pageId, sectionId, newIndex) => set((state) => {
                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                const sections = [...state.pages[pageIndex].sections];
                const currentIndex = sections.indexOf(sectionId);
                if (currentIndex === -1) return state;
                if (currentIndex === newIndex) return state;

                sections.splice(currentIndex, 1);
                sections.splice(newIndex, 0, sectionId);

                const newPages = [...state.pages];
                newPages[pageIndex] = { ...newPages[pageIndex], sections };

                return { pages: newPages };
            }),

            loadTemplate: (templateType) => set(() => {
                if (!templateType) return generateEmptyState();

                let templateData: { pages: PageData[], sections: Record<string, SectionData> };

                switch (templateType) {
                    case 'saas':
                        templateData = generateSaasTemplate();
                        break;
                    case 'business':
                        templateData = generateBusinessTemplate();
                        break;
                    case 'portfolio':
                    case 'ecommerce':
                        templateData = generateSaasTemplate();
                        break;
                    default:
                        return generateEmptyState();
                }

                return {
                    ...templateData,
                    activeTemplate: templateType,
                    selectedSectionId: null,
                    draggingSectionId: null
                };
            }),

            loadTemplateToPage: (pageId, templateType) => set((state) => {
                if (!templateType) return state;

                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                let sectionConfigs: Array<{ type: SectionType; layoutId: string; backgroundColor?: string }>;

                switch (templateType) {
                    case 'saas':
                        sectionConfigs = [
                            { type: 'navbar', layoutId: 'nav-1' },
                            { type: 'hero', layoutId: 'hero-1' },
                            { type: 'features', layoutId: 'features-1', backgroundColor: '#ffffff' },
                            { type: 'content', layoutId: 'content-1', backgroundColor: '#f9fafb' },
                            { type: 'testimonials', layoutId: 'testimonials-1', backgroundColor: '#ffffff' },
                            { type: 'pricing', layoutId: 'pricing-1', backgroundColor: '#f9fafb' },
                            { type: 'cta', layoutId: 'cta-1', backgroundColor: '#1a1a2e' },
                            { type: 'footer', layoutId: 'footer-1' },
                        ];
                        break;
                    case 'business':
                        sectionConfigs = [
                            { type: 'navbar', layoutId: 'nav-2' },
                            { type: 'hero', layoutId: 'hero-2' },
                            { type: 'content', layoutId: 'content-2', backgroundColor: '#ffffff' },
                            { type: 'features', layoutId: 'features-2', backgroundColor: '#f8fafc' },
                            { type: 'testimonials', layoutId: 'testimonials-2', backgroundColor: '#ffffff' },
                            { type: 'cta', layoutId: 'cta-2', backgroundColor: '#1e293b' },
                            { type: 'footer', layoutId: 'footer-2' },
                        ];
                        break;
                    case 'portfolio':
                    case 'ecommerce':
                    default:
                        sectionConfigs = [
                            { type: 'navbar', layoutId: 'nav-1' },
                            { type: 'hero', layoutId: 'hero-1' },
                            { type: 'features', layoutId: 'features-1', backgroundColor: '#ffffff' },
                            { type: 'content', layoutId: 'content-1', backgroundColor: '#f9fafb' },
                            { type: 'cta', layoutId: 'cta-1', backgroundColor: '#1a1a2e' },
                            { type: 'footer', layoutId: 'footer-1' },
                        ];
                        break;
                }

                const newSections: Record<string, SectionData> = { ...state.sections };
                const newSectionIds: string[] = [];

                sectionConfigs.forEach(config => {
                    const sectionId = `${config.type}-${pageId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    newSections[sectionId] = {
                        id: sectionId,
                        type: config.type,
                        layoutId: config.layoutId,
                        backgroundColor: config.backgroundColor,
                        content: {}
                    };
                    newSectionIds.push(sectionId);
                });

                const newPages = [...state.pages];
                newPages[pageIndex] = {
                    ...newPages[pageIndex],
                    sections: newSectionIds
                };

                return {
                    pages: newPages,
                    sections: newSections,
                    selectedSectionId: null,
                    draggingSectionId: null
                };
            }),

            addPage: () => set((state) => {
                const newPageNumber = state.pages.length + 1;
                const newPageId = `page-${Date.now()}`;
                const newPage: PageData = {
                    id: newPageId,
                    title: `Page ${newPageNumber}`,
                    sections: []
                };
                return {
                    pages: [...state.pages, newPage]
                };
            }),

            deletePage: (pageId) => set((state) => {
                if (state.pages.length <= 1) return state;

                const pageToDelete = state.pages.find(p => p.id === pageId);
                if (!pageToDelete) return state;

                const newSections = { ...state.sections };
                pageToDelete.sections.forEach(sectionId => {
                    delete newSections[sectionId];
                });

                return {
                    pages: state.pages.filter(p => p.id !== pageId),
                    sections: newSections,
                    selectedSectionId: null
                };
            }),

            duplicatePage: (pageId) => set((state) => {
                const pageToDuplicate = state.pages.find(p => p.id === pageId);
                if (!pageToDuplicate) return state;

                const newPageId = `page-${Date.now()}`;
                const newSections: Record<string, SectionData> = { ...state.sections };
                const newSectionIds: string[] = [];

                pageToDuplicate.sections.forEach(sectionId => {
                    const originalSection = state.sections[sectionId];
                    if (originalSection) {
                        const newSectionId = `${originalSection.type}-${newPageId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                        newSections[newSectionId] = {
                            ...originalSection,
                            id: newSectionId
                        };
                        newSectionIds.push(newSectionId);
                    }
                });

                const newPage: PageData = {
                    id: newPageId,
                    title: `${pageToDuplicate.title} (Copy)`,
                    sections: newSectionIds
                };

                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                const newPages = [...state.pages];
                newPages.splice(pageIndex + 1, 0, newPage);

                return {
                    pages: newPages,
                    sections: newSections
                };
            }),

            renamePage: (pageId, newTitle) => set((state) => {
                const pageIndex = state.pages.findIndex(p => p.id === pageId);
                if (pageIndex === -1) return state;

                const newPages = [...state.pages];
                newPages[pageIndex] = {
                    ...newPages[pageIndex],
                    title: newTitle
                };

                return { pages: newPages };
            }),

            initializeWireDefaults: () => set((state) => {
                const isFresh =
                    state.pages.length === 1 &&
                    state.pages[0]?.sections.length === 0 &&
                    Object.keys(state.sections).length === 0 &&
                    state.activeTemplate === null;

                if (!isFresh) return state;

                return {
                    pages: [
                        { id: "page-1", title: "Page 1", sections: [] },
                        { id: "page-2", title: "Page 2", sections: [] },
                        { id: "page-3", title: "Page 3", sections: [] }
                    ],
                    sections: {},
                    selectedSectionId: null,
                    draggingSectionId: null,
                    activeTemplate: null
                };
            }),

            resetProject: () => set(() => ({
                ...generateEmptyState(),
                zoom: 20,
                panOffset: { x: 0, y: 0 }
            })),

        }),
        {
            name: 'openwire-editor-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                pages: state.pages,
                sections: state.sections,
                activeTemplate: state.activeTemplate,
            })
        }
    )
);
