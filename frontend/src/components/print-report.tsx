// Print-to-PDF support: a report header that only appears on paper, plus the button that
// triggers window.print(). Screen layout is untouched; @media print rules live in index.css.
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtWita } from "@/lib/format";

export function PrintReportHeader({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <div className="hidden print:mb-6 print:block print:border-b print:border-slate-300 print:pb-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-lg font-bold">Indo Crypto Lens</p>
          <p className="text-[11px] text-slate-600">Platform Analisis Hybrid Kripto Indodax IDR</p>
        </div>
        <p className="text-[11px] text-slate-600">Dicetak {fmtWita(new Date().toISOString())}</p>
      </div>
      <h1 className="mt-3 text-base font-bold">{title}</h1>
      {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
      {meta && <p className="mt-1 text-[11px] text-slate-500">{meta}</p>}
    </div>
  );
}

export function PrintButton({ label = "PDF", testId }: { label?: string; testId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid={testId}
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="size-3.5" />
      {label}
    </Button>
  );
}
