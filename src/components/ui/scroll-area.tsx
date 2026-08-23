import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
    /** Access to the actual scrolling element — needed by anything that used to read/drive `window`/`document` scroll (scroll-position effects, `scrollTo`, "close on scroll", etc.) and now needs the Viewport instead. */
    viewportRef?: React.Ref<HTMLDivElement>
    viewportClassName?: string
  }
>(({ className, viewportClassName, children, viewportRef, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport ref={viewportRef} className={cn("size-full rounded-[inherit] outline-none", viewportClassName)}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Scrollbar>,
  React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.Scrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-px",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-px",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-foreground/30" />
  </ScrollAreaPrimitive.Scrollbar>
))
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
