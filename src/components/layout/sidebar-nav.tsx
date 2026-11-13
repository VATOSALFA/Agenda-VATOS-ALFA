"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import React, { Suspense, useEffect, useState } from "react"
import { ChevronDown, Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export interface SidebarNavItem {
  href: string
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children?: {
    href: string
    title: string
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: SidebarNavItem[]
}

function SidebarNavInner({ className, items, ...props }: SidebarNavProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const currentFullUrl = currentTab ? `${pathname}?tab=${currentTab}` : pathname

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    items.forEach((item) => {
      if (item.children && pathname === item.href) {
        initial[item.href] = true
      }
    })
    return initial
  })

  useEffect(() => {
    items.forEach((item) => {
      if (item.children && pathname === item.href) {
        setExpandedItems((prev) => (prev[item.href] ? prev : { ...prev, [item.href]: true }))
      }
    })
  }, [pathname, items])

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) => ({ ...prev, [href]: !prev[href] }))
  }

  const activeItem = items.find((item) => pathname === item.href) || items[0]
  const activeChild = activeItem?.children?.find(
    (child, idx) => currentFullUrl === child.href || (!currentTab && idx === 0)
  )
  const ActiveIcon = activeChild?.icon || activeItem?.icon
  const activeLabel = activeChild ? `${activeItem.title} • ${activeChild.title}` : activeItem?.title

  return (
    <>
      {/* Mobile view: Dropdown button */}
      <div className={cn("md:hidden mb-3", className)} {...props}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-10 px-3.5 bg-background shadow-xs border-border/80 hover:bg-muted/40 transition-colors rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                {ActiveIcon && <ActiveIcon className="h-4 w-4 text-slate-400 shrink-0" />}
                <span className="font-semibold text-xs sm:text-sm text-foreground truncate">{activeLabel}</span>
              </div>
              <Menu className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[calc(100vw-2rem)] sm:w-[320px] max-w-sm max-h-[60vh] overflow-y-auto p-1.5 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-card space-y-0.5" align="start">
            {items.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <React.Fragment key={item.href}>
                  <DropdownMenuItem asChild className="p-0">
                    <Link
                      href={item.children?.[0]?.href || item.href}
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
                      {isActive && !item.children && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880] shrink-0 ml-2" />
                      )}
                    </Link>
                  </DropdownMenuItem>
                  {item.children && (
                    <div className="ml-3 pl-2.5 border-l border-border/60 space-y-0.5 my-0.5">
                      {item.children.map((child, idx) => {
                        const ChildIcon = child.icon
                        const isChildActive =
                          isActive && (currentFullUrl === child.href || (!currentTab && idx === 0))
                        return (
                          <DropdownMenuItem key={child.href} asChild className="p-0">
                            <Link
                              href={child.href}
                              className={cn(
                                "w-full flex items-center justify-between py-1.5 px-2.5 text-xs font-medium rounded-lg cursor-pointer transition-colors",
                                isChildActive
                                  ? "bg-muted text-foreground font-semibold"
                                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {ChildIcon && (
                                  <ChildIcon
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0",
                                      isChildActive ? "text-[#202A49] dark:text-blue-400" : "text-slate-400"
                                    )}
                                  />
                                )}
                                <span className="truncate">{child.title}</span>
                              </div>
                              {isChildActive && (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880] shrink-0 ml-2" />
                              )}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </div>
                  )}
                </React.Fragment>
              )
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
          const isActive = pathname === item.href
          const Icon = item.icon
          const hasChildren = Boolean(item.children && item.children.length > 0)
          const isExpanded = Boolean(expandedItems[item.href])

          if (hasChildren && item.children) {
            return (
              <div key={item.href} className="space-y-0.5">
                <Link
                  href={item.children[0].href}
                  onClick={(e) => {
                    if (isActive) {
                      e.preventDefault()
                      toggleExpand(item.href)
                    } else {
                      setExpandedItems((prev) => ({ ...prev, [item.href]: true }))
                    }
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all select-none",
                    isActive
                      ? "bg-[#202A49] text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-white" : "text-slate-400 group-hover:text-foreground"
                        )}
                      />
                    )}
                    <span className="truncate">{item.title}</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                      isExpanded ? "rotate-180" : "",
                      isActive ? "text-white/80" : "text-slate-400"
                    )}
                  />
                </Link>
                {isExpanded && (
                  <div className="ml-3 pl-2.5 border-l border-border/60 space-y-0.5 py-0.5">
                    {item.children.map((child, idx) => {
                      const ChildIcon = child.icon
                      const isChildActive =
                        isActive && (currentFullUrl === child.href || (!currentTab && idx === 0))
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all select-none",
                            isChildActive
                              ? "bg-muted/80 text-foreground font-semibold"
                              : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {ChildIcon && (
                              <ChildIcon
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 transition-colors",
                                  isChildActive
                                    ? "text-[#202A49] dark:text-blue-400"
                                    : "text-slate-400 group-hover:text-foreground"
                                )}
                              />
                            )}
                            <span className="truncate">{child.title}</span>
                          </div>
                          {isChildActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880] shrink-0 ml-1.5" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

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
          )
        })}
      </nav>
    </>
  )
}

export const SidebarNav = React.memo(function SidebarNav(props: SidebarNavProps) {
  return (
    <Suspense fallback={null}>
      <SidebarNavInner {...props} />
    </Suspense>
  )
})
