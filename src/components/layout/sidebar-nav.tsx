"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import React from "react"
import { ChevronDown, Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants, Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: {
    href: string
    title: string
  }[]
}

export const SidebarNav = React.memo(function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const pathname = usePathname()
  const activeItem = items.find((item) => pathname === item.href) || items[0]

  return (
    <>
      {/* Mobile view: Dropdown button */}
      <div className={cn("md:hidden mb-4", className)} {...props}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-14 bg-background shadow-sm border-primary/20">
              <span className="font-semibold text-primary">{activeItem?.title}</span>
              <Menu className="h-5 w-5 text-primary" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[90vw] sm:w-[80vw] max-h-[60vh] overflow-y-auto" align="start">
            {items.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  className={cn(
                    "w-full py-4 px-4 text-sm font-medium cursor-pointer transition-colors",
                    pathname === item.href 
                      ? "bg-primary/10 text-primary focus:bg-primary/15" 
                      : "focus:bg-muted"
                  )}
                >
                  {item.title}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop view: Sidebar links */}
      <nav
        className={cn(
          "hidden md:flex md:flex-col md:space-x-0 md:space-y-1 md:flex-nowrap md:gap-1",
          className
        )}
        {...props}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              pathname === item.href
                ? "bg-muted hover:bg-muted font-medium"
                : "hover:bg-transparent hover:underline",
              "justify-start"
            )}
          >
            {item.title}
          </Link>
        ))}
      </nav>
    </>
  )
})
