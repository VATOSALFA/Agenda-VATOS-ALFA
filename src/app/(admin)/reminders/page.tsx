
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, CheckCircle, DollarSign, Send } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";

export default function RemindersPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Recordatorios de Citas</h2>
        <div className="flex items-center space-x-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={"outline"}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span>Seleccionar Rango de Fechas</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={new Date()}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos por Confirmación</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$1,250,000</div>
            <p className="text-xs text-muted-foreground">+20.1% desde el mes pasado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Citas Confirmadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">85%</div>
            <p className="text-xs text-muted-foreground">125 de 147 citas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensajes Enviados (WhatsApp)</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+235</div>
            <p className="text-xs text-muted-foreground">95% de tasa de entrega</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensajes Enviados (Email)</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+180</div>
            <p className="text-xs text-muted-foreground">99% de tasa de entrega</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Estadísticas de Envío</CardTitle>
            <CardDescription>Detalle de los estados de los recordatorios enviados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-base font-medium text-green-600">Enviados y Entregados</span>
                    <span className="text-sm font-medium text-green-600">139 (94.5%)</span>
                </div>
                <Progress value={94.5} className="[&>div]:bg-green-500" />
            </div>
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-base font-medium text-red-600">Envíos Fallidos</span>
                    <span className="text-sm font-medium text-red-600">5 (3.4%)</span>
                </div>
                <Progress value={3.4} className="[&>div]:bg-red-500" />
            </div>
            <div>
                <div className="flex justify-between mb-1">
                    <span className="text-base font-medium text-yellow-600">Pendientes de Envío</span>
                    <span className="text-sm font-medium text-yellow-600">3 (2.1%)</span>
                </div>
                <Progress value={2.1} className="[&>div]:bg-yellow-500" />
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
