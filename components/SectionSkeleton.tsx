import React from "react";

interface SectionSkeletonProps {
    type: string;
}

export const SectionSkeleton = ({ type }: SectionSkeletonProps) => {
    const getHeightClass = () => {
        switch (type) {
            case 'navbar':
                return 'h-20';
            case 'hero':
                return 'h-[600px]';
            case 'stats':
            case 'logocloud':
                return 'h-[200px]';
            case 'cta':
            case 'newsletter':
                return 'h-[300px]';
            case 'footer':
                return 'h-[400px]';
            case 'features':
            case 'pricing':
            case 'contact':
            case 'team':
                return 'h-[700px]';
            case 'testimonials':
            case 'faq':
            case 'content':
            default:
                return 'h-[500px]';
        }
    };

    return (
        <div className={`w-full ${getHeightClass()} bg-gray-700 dark:bg-gray-800/40 animate-pulse relative overflow-hidden`}>
        </div>
    );
};
