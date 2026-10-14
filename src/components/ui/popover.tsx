"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { dropdownCoordinator } from "@/lib/dropdown-coordinator"

interface PopoverProps extends PopoverPrimitive.PopoverProps {}

const Popover = ({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const popoverId = React.useId();
  const isOpenRef = React.useRef(isOpen);

  React.useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        dropdownCoordinator.notifyOpen(popoverId);
      }
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      controlledOnOpenChange?.(nextOpen);
    },
    [popoverId, isControlled, controlledOnOpenChange]
  );

  React.useEffect(() => {
    return dropdownCoordinator.subscribe((activeId) => {
      if (activeId !== popoverId && isOpenRef.current) {
        if (!isControlled) {
          setUncontrolledOpen(false);
        }
        controlledOnOpenChange?.(false);
      }
    });
  }, [popoverId, isControlled, controlledOnOpenChange]);

  return (
    <PopoverPrimitive.Root
      open={isOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  );
};

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-xl border-2 border-blue-500 bg-popover p-4 text-popover-foreground shadow-[0_10px_30px_rgba(59,130,246,0.18)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
