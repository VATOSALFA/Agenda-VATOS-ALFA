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
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

export const SidebarNav = React.memo(function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const pathname = usePathname()
  const activeItem = items.find((item) => pathname === item.href) || items[0]
  const ActiveIcon = activeItem?.icon

  return (
    <>
      {/* Mobile view: Dropdown button */}
      <div className={cn("md:hidden mb-3", className)} {...props}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-10 px-3.5 bg-background shadow-xs border-border/80 hover:bg-muted/40 transition-colors rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                {ActiveIcon && <ActiveIcon className="h-4 w-4 text-slate-400 shrink-0" />}
                <span className="font-semibold text-xs sm:text-sm text-foreground truncate">{activeItem?.title}</span>
              </div>
              <Menu className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[calc(100vw-2rem)] sm:w-[320px] max-w-sm max-h-[60vh] overflow-y-auto p-1.5 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card space-y-0.5" align="start">
            {items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.href} asChild className="p-0">
                  <Link
                    href={item.href}
                    className={cn(
                      "w-full flex items-center justify-between py-2 px-3 text-xs font-semibold rounded-lg cursor-pointer transition-colors",
                      isActive 
                        ? "bg-[#202A49] text-white shadow-xs" 
                        : "text-foreground/90 hover:bg-muted/70 focus:bg-muted/70"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {Icon && <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : "text-slate-400")} />}
                      <span className="truncate">{item.title}</span>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880] shrink-0 ml-2" />
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Desktop view: Sidebar links */}
      <nav
        className={cn(
          "hidden md:flex md:flex-col md:space-x-0 md:space-y-0.5 md:flex-nowrap",
          className
        )}
        {...props}
      >
        {items.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all select-none",
                isActive
                  ? "bg-[#202A49] text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {Icon && (
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-foreground"
                  )}
                />
              )}
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </>
  )
})
