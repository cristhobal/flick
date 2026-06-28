"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "border-0 bg-transparent p-0 text-white shadow-none",
          title: "text-sm font-medium text-white",
          description: "text-xs text-neutral-400",
          actionButton: "bg-white text-black",
          cancelButton: "bg-neutral-900 text-white",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
