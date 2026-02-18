"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export const Toaster = (props: ToasterProps) => {
  return (
    <SonnerToaster
      theme="dark"
      closeButton
      richColors
      position="top-right"
      {...props}
    />
  );
};

export { toast } from "sonner";

