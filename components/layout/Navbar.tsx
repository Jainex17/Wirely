"use client";

import { useState, useEffect, useRef } from "react";
import { DeviceType } from "@/app/store/useEditorStore";
import { EditableText } from "@/components/editor/EditableText";

export const Navbar1 = ({
  activeDevice,
  sectionId,
}: {
  activeDevice: DeviceType;
  sectionId: string;
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const isMobile = activeDevice === "mobile";

  const solutionsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        solutionsRef.current &&
        !solutionsRef.current.contains(event.target as Node)
      ) {
        setSolutionsOpen(false);
      }
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };

    if (solutionsOpen || moreOpen || mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [solutionsOpen, moreOpen, mobileMenuOpen]);

  return (
    <header id="navbar">
      <div className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center border-b-2 border-gray-100 py-6 md:justify-start md:space-x-10">
            <div className="flex justify-start lg:w-0 lg:flex-1">
              <h1 className="text-2xl font-bold">
                <EditableText
                  sectionId={sectionId}
                  defaultValue="Wirely"
                  field="logo"
                />
              </h1>
            </div>

            {isMobile && (
              <div className="-mr-2 -my-2">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="bg-white rounded-md p-2 inline-flex items-center justify-center text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                >
                  <span className="sr-only">Open menu</span>
                  <svg
                    className="h-6 w-6"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              </div>
            )}

            {!isMobile && (
              <nav className="hidden md:flex space-x-10">
                <div className="relative" ref={solutionsRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setSolutionsOpen(!solutionsOpen);
                      setMoreOpen(false);
                    }}
                    className={`group bg-white rounded-md inline-flex items-center text-base font-medium hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${solutionsOpen ? "text-gray-900" : "text-gray-500"
                      }`}
                  >
                    <span>
                      <EditableText
                        sectionId={sectionId}
                        defaultValue="Solutions"
                        field="solutions"
                      />
                    </span>
                    <svg
                      className={`ml-2 h-5 w-5 group-hover:text-gray-500 ${solutionsOpen ? "text-gray-600" : "text-gray-400"
                        }`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {solutionsOpen && (
                    <div className="absolute z-10 -ml-4 mt-3 transform px-2 w-screen max-w-md sm:px-0 lg:ml-0 lg:left-1/2 lg:-translate-x-1/2">
                      <div className="rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden">
                        <div className="relative grid gap-6 bg-white px-5 py-6 sm:gap-8 sm:p-8">
                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Analytics"
                                  field="analytics"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Get a better understanding of where your traffic is coming from."
                                  field="analyticsDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Engagement"
                                  field="engagement"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Speak directly to your customers in a more meaningful way."
                                  field="engagementDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Security"
                                  field="security"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Your customers' data will be safe and secure."
                                  field="securityDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Integrations"
                                  field="integrations"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Connect with third-party tools that you're already using."
                                  field="integrationsDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Automations"
                                  field="automations"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Build strategic funnels that will drive your customers to convert"
                                  field="automationsDescription"
                                />
                              </p>
                            </div>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <a href="#" className="text-base font-medium text-gray-500 hover:text-gray-900">
                  <EditableText
                    sectionId={sectionId}
                    defaultValue="Pricing"
                    field="pricing"
                  />
                </a>
                <a href="#" className="text-base font-medium text-gray-500 hover:text-gray-900">
                  <EditableText
                    sectionId={sectionId}
                    defaultValue="Docs"
                    field="docs"
                  />
                </a>

                <div className="relative" ref={moreRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(!moreOpen);
                      setSolutionsOpen(false);
                    }}
                    className={`group rounded-md inline-flex items-center text-base font-medium hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${moreOpen ? "text-gray-900" : "text-gray-500"
                      }`}
                  >
                    <span>
                      <EditableText
                        sectionId={sectionId}
                        defaultValue="More"
                        field="more"
                      />
                    </span>
                    <svg
                      className={`ml-2 h-5 w-5 group-hover:text-gray-500 ${moreOpen ? "text-gray-600" : "text-gray-400"
                        }`}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  {moreOpen && (
                    <div className="absolute z-10 left-1/2 transform -translate-x-1/2 mt-3 px-2 w-screen max-w-md sm:px-0">
                      <div className="rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden">
                        <div className="relative grid gap-6 bg-white px-5 py-6 sm:gap-8 sm:p-8">
                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Help Center"
                                  field="helpCenter"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Get all of your questions answered in our forums or contact support."
                                  field="helpCenterDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Guides"
                                  field="guides"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Learn how to maximize our platform to get the most out of it."
                                  field="guidesDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Events"
                                  field="events"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="See what meet-ups and other events we might be planning near you."
                                  field="eventsDescription"
                                />
                              </p>
                            </div>
                          </a>

                          <a href="#" className="-m-3 p-3 flex items-start rounded-lg hover:bg-gray-50">
                            <svg
                              className="flex-shrink-0 h-6 w-6 text-indigo-600"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                              />
                            </svg>
                            <div className="ml-4">
                              <p className="text-base font-medium text-gray-900">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Security"
                                  field="security"
                                />
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                <EditableText
                                  sectionId={sectionId}
                                  defaultValue="Understand how we take your privacy seriously."
                                  field="securityDescription"
                                />
                              </p>
                            </div>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </nav>
            )}

            {!isMobile && (
              <div className="hidden md:flex items-center justify-end md:flex-1 lg:w-0">
                <a href="#" className="whitespace-nowrap text-base font-medium text-gray-500 hover:text-gray-900">
                  <EditableText
                    sectionId={sectionId}
                    defaultValue="Sign in"
                    field="signIn"
                  />
                </a>
                <a
                  href="#"
                  className="ml-8 whitespace-nowrap inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <EditableText
                    sectionId={sectionId}
                    defaultValue="Sign up"
                    field="signUp"
                  />
                </a>
              </div>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="absolute top-0 inset-x-0 p-2 transition transform origin-top-right md:hidden z-50">
            <div className="rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 bg-white divide-y-2 divide-gray-50" ref={mobileMenuRef}>
              <div className="pt-5 pb-6 px-5">
                <div className="flex items-center justify-between">
                  <div>
                    <img
                      className="h-8 w-auto"
                      src="https://tailwindui.com/img/logos/workflow-mark-indigo-600.svg"
                      alt="Workflow"
                    />
                  </div>
                  <div className="-mr-2">
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="rounded-md p-2 inline-flex items-center justify-center text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                    >
                      <span className="sr-only">Close menu</span>
                      <svg
                        className="h-6 w-6"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="mt-6">
                  <nav className="grid gap-y-8">
                    <a href="#" className="-m-3 p-3 flex items-center rounded-md hover:bg-gray-50">
                      <svg
                        className="flex-shrink-0 h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <span className="ml-3 text-base font-medium text-gray-900">
                        <EditableText
                          sectionId={sectionId}
                          defaultValue="Analytics"
                          field="analytics"
                        />
                      </span>
                    </a>

                    <a href="#" className="-m-3 p-3 flex items-center rounded-md hover:bg-gray-50">
                      <svg
                        className="flex-shrink-0 h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                        />
                      </svg>
                      <span className="ml-3 text-base font-medium text-gray-900">
                        <EditableText
                          sectionId={sectionId}
                          defaultValue="Engagement"
                          field="engagement"
                        />
                      </span>
                    </a>

                    <a href="#" className="-m-3 p-3 flex items-center rounded-md hover:bg-gray-50">
                      <svg
                        className="flex-shrink-0 h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                        />
                      </svg>
                      <span className="ml-3 text-base font-medium text-gray-900">
                        <EditableText
                          sectionId={sectionId}
                          defaultValue="Security"
                          field="security"
                        />
                      </span>
                    </a>

                    <a href="#" className="-m-3 p-3 flex items-center rounded-md hover:bg-gray-50">
                      <svg
                        className="flex-shrink-0 h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                      </svg>
                      <span className="ml-3 text-base font-medium text-gray-900">
                        <EditableText
                          sectionId={sectionId}
                          defaultValue="Integrations"
                          field="integrations"
                        />
                      </span>
                    </a>

                    <a href="#" className="-m-3 p-3 flex items-center rounded-md hover:bg-gray-50">
                      <svg
                        className="flex-shrink-0 h-6 w-6 text-indigo-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span className="ml-3 text-base font-medium text-gray-900">
                        <EditableText
                          sectionId={sectionId}
                          defaultValue="Automations"
                          field="automations"
                        />
                      </span>
                    </a>
                  </nav>
                </div>
              </div>
              <div className="py-6 px-5 space-y-6">
                <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Pricing"
                      field="pricing"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Docs"
                      field="docs"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Enterprise"
                      field="enterprise"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Blog"
                      field="blog"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Help Center"
                      field="helpCenter"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Guides"
                      field="guides"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Security"
                      field="security"
                    />
                  </a>
                  <a href="#" className="text-base font-medium text-gray-900 hover:text-gray-700">
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Events"
                      field="events"
                    />
                  </a>
                </div>
                <div>
                  <a
                    href="#"
                    className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <EditableText
                      sectionId={sectionId}
                      defaultValue="Sign up"
                      field="signUp"
                    />
                  </a>
                  <p className="mt-6 text-center text-base font-medium text-gray-500">
                    Existing customer?{" "}
                    <a href="#" className="text-indigo-600 hover:text-indigo-500">
                      <EditableText
                        sectionId={sectionId}
                        defaultValue="Sign in"
                        field="signIn"
                      />
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export const Navbar2 = ({
  activeDevice,
  sectionId,
}: {
  activeDevice: DeviceType;
  sectionId: string;
}) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const isDark = sectionId.includes("page-1");
  const isMobile = activeDevice === "mobile";

  return (
    <header
      className="absolute left-0 right-0 z-50 top-4"
      style={{ padding: isMobile ? "0 8px" : "0 16px" }}
    >
      <nav
        className="p-2 mx-auto w-full rounded-full backdrop-blur-md h-fit shadow-lg transition-all duration-300"
        style={{
          backgroundColor: isDark
            ? "rgba(26, 26, 46, 0.9)"
            : "rgba(255, 255, 255, 0.95)",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          maxWidth: isMobile ? "100%" : "fit-content",
        }}
      >
        <div className="flex gap-8 justify-between items-center mx-auto h-full transition-all">
          <div className="flex items-center">
            <div className="flex items-center gap-2 cursor-pointer">
              <span
                className="font-bold text-lg pl-2"
                style={{ color: isDark ? "#fff" : "#1a1a2e" }}
              >
                <EditableText
                  sectionId={sectionId}
                  field="logo"
                  defaultValue="Wirely"
                />
              </span>
            </div>

            {!isMobile && (
              <div className="flex ml-6">
                <ul className="flex items-center space-x-1">
                  {["Product", "Solutions", "Resources", "Pricing"].map(
                    (item) => (
                      <li key={item}>
                        <span
                          className="px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-200 rounded-lg hover:outline-2 hover:outline-blue-500"
                          style={{
                            color: isDark ? "#ccc" : "#4b5563",
                          }}
                        >
                          <EditableText
                            sectionId={sectionId}
                            field={`link-${item}`}
                            defaultValue={item}
                          />
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>

          {!isMobile && (
            <div className="flex items-center">
              <button className="px-5 py-2 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 hover:outline-2 hover:outline-blue-500">
                <EditableText
                  sectionId={sectionId}
                  field="cta"
                  defaultValue="Get Started"
                />
              </button>
            </div>
          )}

          {isMobile && (
            <button
              type="button"
              className="flex p-2"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Toggle menu"
            >
              <div className="flex flex-col gap-1.5">
                <div
                  className="w-6 h-0.5 transition-all duration-200 origin-center rounded-full"
                  style={{
                    backgroundColor: isDark ? "#fff" : "#1a1a2e",
                    transform: showMobileMenu
                      ? "rotate(45deg) translateY(7px)"
                      : "rotate(0) translateY(0)",
                  }}
                />
                <div
                  className="w-6 h-0.5 transition-all duration-200 rounded-full"
                  style={{
                    backgroundColor: isDark ? "#fff" : "#1a1a2e",
                    opacity: showMobileMenu ? 0 : 1,
                    transform: showMobileMenu
                      ? "translateX(-5px)"
                      : "translateX(0)",
                  }}
                />
                <div
                  className="w-6 h-0.5 transition-all duration-200 origin-center rounded-full"
                  style={{
                    backgroundColor: isDark ? "#fff" : "#1a1a2e",
                    transform: showMobileMenu
                      ? "rotate(-45deg) translateY(-7px)"
                      : "rotate(0) translateY(0)",
                  }}
                />
              </div>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobile && showMobileMenu && (
        <div
          className="mt-2 mx-auto w-full rounded-2xl border p-4 shadow-lg transition-all duration-200"
          style={{
            backgroundColor: isDark
              ? "rgba(26, 26, 46, 0.95)"
              : "rgba(255, 255, 255, 0.95)",
            borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          }}
        >
          <ul className="flex flex-col space-y-1">
            {["Product", "Solutions", "Resources", "Pricing"].map((item) => (
              <li key={item}>
                <span
                  className="block px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 cursor-pointer hover:outline-2 hover:outline-blue-500"
                  style={{ color: isDark ? "#ccc" : "#4b5563" }}
                >
                  <EditableText
                    sectionId={sectionId}
                    field={`mobile-link-${item}`}
                    defaultValue={item}
                  />
                </span>
              </li>
            ))}
          </ul>
          <div
            className="mt-4 pt-4 flex flex-col space-y-2"
            style={{
              borderTop: isDark
                ? "1px solid rgba(255,255,255,0.1)"
                : "1px solid rgba(0,0,0,0.1)",
            }}
          >
            <button className="w-full px-5 py-2.5 rounded-full text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors hover:outline-2 hover:outline-blue-500">
              <EditableText
                sectionId={sectionId}
                field="mobile-cta"
                defaultValue="Get Started"
              />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export const Navbar3 = ({
  activeDevice,
  sectionId,
}: {
  activeDevice: DeviceType;
  sectionId: string;
}) => {
  const isDark = sectionId.includes("page-1");
  const isMobile = activeDevice === "mobile";

  return (
    <nav
      className="w-full flex items-center justify-between px-8 py-4 bg-transparent absolute top-0 left-0 right-0 z-50"
      style={{ paddingTop: isMobile ? "16px" : "24px" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
          O
        </div>
        <span
          className="font-bold text-xl hover:outline-2 hover:outline-blue-500"
          style={{ color: isDark ? "#fff" : "#1a1a2e" }}
        >
          <EditableText
            sectionId={sectionId}
            field="logo"
            defaultValue="Wirely"
          />
        </span>
      </div>

      {!isMobile && (
        <div className="flex items-center gap-1">
          {["Features", "Pricing", "About", "Blog"].map((item, i) => (
            <span
              key={item}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:bg-white/10 hover:outline-2 hover:outline-blue-500"
              style={{ color: isDark ? "rgba(255,255,255,0.8)" : "#4b5563" }}
            >
              <EditableText
                sectionId={sectionId}
                field={`link-${i}`}
                defaultValue={item}
              />
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isMobile && (
          <button
            className="px-4 py-2 text-sm font-medium transition-colors rounded-lg hover:outline-2 hover:outline-blue-500"
            style={{ color: isDark ? "rgba(255,255,255,0.8)" : "#4b5563" }}
          >
            <EditableText
              sectionId={sectionId}
              field="signIn"
              defaultValue="Sign In"
            />
          </button>
        )}
        <button className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg shadow-purple-500/25 hover:outline-2 hover:outline-blue-500">
          <EditableText
            sectionId={sectionId}
            field="cta"
            defaultValue="Get Started"
          />
        </button>
      </div>
    </nav>
  );
};

export const Navbar4 = ({
  activeDevice,
  sectionId,
}: {
  activeDevice: DeviceType;
  sectionId: string;
}) => {
  const isDark = sectionId.includes("page-1");
  const isMobile = activeDevice === "mobile";

  return (
    <nav
      className="w-full px-8 py-5 border-b"
      style={{
        backgroundColor: isDark ? "#0a0a0a" : "#fff",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {!isMobile && (
          <div className="flex-1 flex items-center gap-8">
            {["Products", "Solutions"].map((item, i) => (
              <span
                key={item}
                className="text-sm font-medium cursor-pointer transition-colors hover:outline-2 hover:outline-blue-500"
                style={{ color: isDark ? "rgba(255,255,255,0.7)" : "#6b7280" }}
              >
                <EditableText
                  sectionId={sectionId}
                  field={`left-link-${i}`}
                  defaultValue={item}
                />
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center">
          <span
            className="font-black text-2xl tracking-tighter hover:outline-2 hover:outline-blue-500"
            style={{ color: isDark ? "#fff" : "#0a0a0a" }}
          >
            <EditableText
              sectionId={sectionId}
              field="logo"
              defaultValue="WIRE"
            />
          </span>
        </div>

        {!isMobile && (
          <div className="flex-1 flex items-center justify-end gap-8">
            {["Resources", "Company"].map((item, i) => (
              <span
                key={item}
                className="text-sm font-medium cursor-pointer transition-colors hover:outline-2 hover:outline-blue-500"
                style={{ color: isDark ? "rgba(255,255,255,0.7)" : "#6b7280" }}
              >
                <EditableText
                  sectionId={sectionId}
                  field={`right-link-${i}`}
                  defaultValue={item}
                />
              </span>
            ))}
            <button
              className="px-5 py-2 rounded-full text-sm font-semibold transition-colors hover:outline-2 hover:outline-blue-500"
              style={{
                backgroundColor: isDark ? "#fff" : "#0a0a0a",
                color: isDark ? "#0a0a0a" : "#fff",
              }}
            >
              <EditableText
                sectionId={sectionId}
                field="cta"
                defaultValue="Try Free"
              />
            </button>
          </div>
        )}

        {isMobile && (
          <div className="flex flex-col gap-1.5 cursor-pointer">
            <span
              className={`w-6 h-0.5 rounded-full ${isDark ? "bg-white" : "bg-gray-800"}`}
            ></span>
            <span
              className={`w-6 h-0.5 rounded-full ${isDark ? "bg-white" : "bg-gray-800"}`}
            ></span>
            <span
              className={`w-6 h-0.5 rounded-full ${isDark ? "bg-white" : "bg-gray-800"}`}
            ></span>
          </div>
        )}
      </div>
    </nav>
  );
};
