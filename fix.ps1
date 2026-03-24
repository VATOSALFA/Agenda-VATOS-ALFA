$p = 'src\app\(admin)\finanzas\[month]\page.tsx'
$c = Get-Content -Raw -LiteralPath $p
$c = $c -replace '<Tooltip[^>]*?>', ''
$c = $c -replace '</Tooltip>', ''
$c = $c -replace 'TooltipTrigger', 'PopoverTrigger'
$c = $c -replace 'TooltipProvider', 'Popover'
$c = $c -replace 'TooltipContent', 'PopoverContent'
$c | Set-Content -LiteralPath $p
