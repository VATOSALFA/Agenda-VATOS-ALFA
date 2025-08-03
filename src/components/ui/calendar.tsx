
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { ScrollArea } from "./scroll-area"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        caption_dropdowns: "flex justify-center gap-1",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-8 w-8 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
        Dropdown: (props: DropdownProps) => {
            const { fromYear, toYear, fromMonth, toMonth } = props;
            const options: { label: string; value: number }[] = [];

            if (props.name === 'months') {
                const currentYear = new Date().getFullYear();
                for (let i = 0; i < 12; i++) {
                    options.push({
                        value: i,
                        label: new Date(currentYear, i).toLocaleString('default', { month: 'long' })
                    });
                }
            } else if (props.name === 'years') {
                const startYear = fromYear || new Date().getFullYear() - 100;
                const endYear = toYear || new Date().getFullYear();
                 for (let i = startYear; i <= endYear; i++) {
                    options.push({ value: i, label: i.toString() });
                }
            }
            
            const handleValueChange = (newValue: string) => {
                if (props.onChange) {
                    const newDate = new Date();
                    if (props.name === 'months') {
                        // When changing month, we need to know the currently selected year
                        const currentMonthDate = (props.value !== undefined) ? new Date().setMonth(props.value as number) : new Date();
                        const currentYear = new Date(currentMonthDate).getFullYear();
                        newDate.setFullYear(currentYear, parseInt(newValue, 10));
                    } else if (props.name === 'years') {
                        // When changing year, we need to know the currently selected month
                        const currentMonth = (props.value !== undefined) ? new Date().setFullYear(props.value as number) : new Date();
                        const month = new Date(currentMonth).getMonth();
                        newDate.setFullYear(parseInt(newValue, 10), month);
                    }
                    props.onChange(newDate);
                }
            };
            
            const selectedValue = props.value?.toString();
            
            // Get the display name for the trigger
            let triggerDisplayValue = selectedValue;
            if (props.name === 'months' && selectedValue) {
                triggerDisplayValue = new Date(new Date().getFullYear(), parseInt(selectedValue)).toLocaleString('default', {month: 'long'})
            }

            return (
                 <Select
                    onValueChange={handleValueChange}
                    value={selectedValue}
                >
                    <SelectTrigger>{triggerDisplayValue}</SelectTrigger>
                    <SelectContent>
                        <ScrollArea className="h-80">
                            {options.map((option) => (
                                <SelectItem key={option.value} value={option.value.toString()}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </ScrollArea>
                    </SelectContent>
                </Select>
            )
        }
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
