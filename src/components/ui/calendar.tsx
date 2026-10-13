
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, DropdownProps, DateRange } from "react-day-picker"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { ScrollArea } from "./scroll-area"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale = es,
  ...props
}: CalendarProps) {
  const [hoveredDay, setHoveredDay] = React.useState<Date | undefined>(undefined);

  const isRangeMode = props.mode === "range";
  const selectedRange = isRangeMode ? (props.selected as DateRange | undefined) : undefined;
  const isSelectingRange = Boolean(isRangeMode && selectedRange?.from && !selectedRange?.to && hoveredDay);

  const dynamicModifiers = React.useMemo(() => {
    const mods: Record<string, any> = { ...props.modifiers };

    if (isSelectingRange && selectedRange?.from && hoveredDay) {
      const fromTime = new Date(selectedRange.from.getFullYear(), selectedRange.from.getMonth(), selectedRange.from.getDate()).getTime();
      const hoverTime = new Date(hoveredDay.getFullYear(), hoveredDay.getMonth(), hoveredDay.getDate()).getTime();

      if (hoverTime > fromTime) {
        mods.preview_middle = { after: selectedRange.from, before: hoveredDay };
        mods.preview_end = hoveredDay;
      } else if (hoverTime < fromTime) {
        mods.preview_middle = { after: hoveredDay, before: selectedRange.from };
        mods.preview_start = hoveredDay;
      }
    }

    return mods;
  }, [isSelectingRange, selectedRange?.from, hoveredDay, props.modifiers]);

  return (
    <DayPicker
      locale={locale}
      showOutsideDays={showOutsideDays}
      className={cn("p-3 select-none", className)}
      onDayMouseEnter={(day, activeModifiers, e) => {
        if (selectedRange?.from && !selectedRange?.to) {
          setHoveredDay(day);
        }
        props.onDayMouseEnter?.(day, activeModifiers, e);
      }}
      onDayMouseLeave={(day, activeModifiers, e) => {
        setHoveredDay(undefined);
        props.onDayMouseLeave?.(day, activeModifiers, e);
      }}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-3",
        caption: "flex justify-center pt-1 relative items-center mb-1",
        caption_label: "text-sm font-bold capitalize tracking-wide text-foreground",
        caption_dropdowns: "flex justify-center gap-1.5",
        nav: "space-x-1 flex items-center",
        nav_button:
          "h-7 w-7 bg-transparent p-0 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors flex items-center justify-center border-0 cursor-pointer",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-between w-full border-b border-border/40 pb-2 mb-1.5",
        head_cell:
          "text-slate-400 w-9 text-center font-bold text-[11px] uppercase tracking-wider",
        row: "flex w-full mt-1 justify-between",
        cell: "h-9 w-9 text-center text-xs p-0 relative [&:has(.day-range-middle)]:bg-blue-500/15 [&:has(.day-range-start)]:bg-blue-500/15 [&:has(.day-range-end)]:bg-blue-500/15 [&:has(.preview-middle)]:bg-blue-500/15 [&:has(.preview-end)]:bg-blue-500/15 [&:has(.preview-start)]:bg-blue-500/15 [&:has(.day-range-start)]:rounded-l-xl [&:has(.day-range-end)]:rounded-r-xl [&:has(.preview-start)]:rounded-l-xl [&:has(.preview-end)]:rounded-r-xl [&:has(.day-range-start.day-range-end)]:bg-transparent first:[&:has([aria-selected])]:rounded-l-xl last:[&:has([aria-selected])]:rounded-r-xl focus-within:relative focus-within:z-20",
        day: "h-9 w-9 p-0 font-semibold text-xs rounded-xl transition-all hover:bg-blue-500/15 hover:text-blue-500 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 aria-selected:opacity-100 flex items-center justify-center cursor-pointer",
        day_range_start: "day-range-start !rounded-l-xl !rounded-r-none !bg-blue-600 !text-white font-bold shadow-sm z-10 relative [&.day-range-end]:!rounded-xl",
        day_range_end: "day-range-end !rounded-r-xl !rounded-l-none !bg-blue-600 !text-white font-bold shadow-sm z-10 relative [&.day-range-start]:!rounded-xl",
        day_selected:
          "!bg-blue-600 !text-white hover:!bg-blue-500 focus:!bg-blue-600 focus:!text-white font-bold shadow-md rounded-xl",
        day_today:
          "font-bold text-blue-600 dark:text-blue-400 bg-blue-500/15 border border-blue-500/40 rounded-xl aria-selected:!bg-blue-600 aria-selected:!text-white aria-selected:!border-transparent",
        day_outside:
          "day-outside text-muted-foreground/30 opacity-40 aria-selected:bg-blue-600/20 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground/30 opacity-30 cursor-not-allowed hover:bg-transparent",
        day_range_middle:
          "day-range-middle !bg-blue-500/15 !text-blue-700 dark:!text-blue-300 !rounded-none font-semibold",
        day_hidden: "invisible",
        ...classNames,
      }}
      modifiers={dynamicModifiers}
      modifiersClassNames={{
        range_start: "day-range-start !rounded-l-lg !rounded-r-none !bg-blue-600 !text-white font-bold shadow-sm z-10 relative [&.range_end]:!rounded-lg",
        range_end: "day-range-end !rounded-r-lg !rounded-l-none !bg-blue-600 !text-white font-bold shadow-sm z-10 relative [&.range_start]:!rounded-lg",
        range_middle: "day-range-middle !bg-blue-500/15 !text-blue-700 dark:!text-blue-300 !rounded-none font-semibold",
        preview_middle: "preview-middle !bg-blue-500/15 !text-blue-700 dark:!text-blue-300 !rounded-none font-semibold",
        preview_end: "preview-end !bg-blue-600/85 !text-white !rounded-r-lg !rounded-l-none font-bold shadow-sm z-10 relative",
        preview_start: "preview-start !bg-blue-600/85 !text-white !rounded-l-lg !rounded-r-none font-bold shadow-sm z-10 relative",
        ...props.modifiersClassNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4 text-slate-400 hover:text-foreground transition-colors" />,
        IconRight: () => <ChevronRight className="h-4 w-4 text-slate-400 hover:text-foreground transition-colors" />,
        Dropdown: ({ name, value, onChange, children }: DropdownProps) => {
          const options = React.Children.toArray(children) as React.ReactElement<React.HTMLProps<HTMLOptionElement>>[];
          const handleValueChange = (newValue: string) => {
            const changeEvent = {
              target: { value: newValue },
            } as React.ChangeEvent<HTMLSelectElement>;
            if (onChange) onChange(changeEvent);
          };

          let selectValue: string | undefined;
          let triggerDisplayValue = value;

          if (name === 'months' && value !== undefined) {
            selectValue = String(value);
            const monthName = new Date(new Date().getFullYear(), value as number).toLocaleString('es-ES', { month: 'long' });
            triggerDisplayValue = monthName.charAt(0).toUpperCase() + monthName.slice(1);
          } else if (name === 'years' && value !== undefined) {
            selectValue = String(value);
            triggerDisplayValue = String(value);
          }

          return (
            <Select onValueChange={handleValueChange} value={selectValue}>
              <SelectTrigger className="w-[120px]">{triggerDisplayValue}</SelectTrigger>
              <SelectContent className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]">
                <ScrollArea className="h-80">
                  {options.map((option, index) => (
                    <SelectItem key={`${option.props.value}-${index}`} value={String(option.props.value)}>
                      {option.props.children}
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          );
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
