import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExecutePoaMutation, type PowerOfAttorneyDto } from "@/hooks/use-poa";
import {
  POA_CONSENT_ITEMS,
  POA_INSTRUMENT_SECTIONS,
  type PoaConsentFlags,
} from "@/lib/poa-instrument";
import { cn } from "@/lib/utils";

export type PoAExecutionScreenProps = {
  transactionId: string;
  buyerName?: string;
  listingTitle?: string;
  listingAddress?: string;
  className?: string;
  onSuccess?: (poa: PowerOfAttorneyDto) => void;
};

const EMPTY_CONSENTS: PoaConsentFlags = {
  legalCapacity: false,
  witnessingRequired: false,
  landRegistryRegistration: false,
  irrevocability: false,
};

function SignatureCanvas({
  onChange,
}: {
  onChange: (hasSignature: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(false);
  }, [onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width));
      canvas.height = Math.max(1, Math.floor(rect.height));
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "hsl(var(--foreground))";
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getPoint(event);
    if (!canvas || !ctx || !point) return;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getPoint(event);
    if (!canvas || !ctx || !point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    onChange(true);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current?.releasePointerCapture(event.pointerId);
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border border-border bg-background"
        aria-label="Draw your signature"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
        Clear signature
      </Button>
    </div>
  );
}

export function PoAExecutionScreen({
  transactionId,
  buyerName,
  listingTitle,
  listingAddress,
  className,
  onSuccess,
}: PoAExecutionScreenProps) {
  const executePoa = useExecutePoaMutation();
  const [consents, setConsents] = useState<PoaConsentFlags>({ ...EMPTY_CONSENTS });
  const [signatureTab, setSignatureTab] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState(buyerName ?? "");
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const [result, setResult] = useState<PowerOfAttorneyDto | null>(null);

  useEffect(() => {
    if (buyerName && !typedName) {
      setTypedName(buyerName);
    }
  }, [buyerName, typedName]);

  const allConsentsChecked = POA_CONSENT_ITEMS.every((item) => consents[item.key]);
  const signatureReady =
    signatureTab === "draw" ? hasDrawnSignature : typedName.trim().length >= 2;
  const canExecute = allConsentsChecked && signatureReady && !executePoa.isPending;

  const handleExecute = async () => {
    const signatureName =
      signatureTab === "type" ? typedName.trim() : (buyerName?.trim() || "Signed");
    const payload = {
      transactionId,
      signatureMethod: signatureTab === "draw" ? ("DRAWN" as const) : ("TYPED" as const),
      signatureName,
      consentFlags: consents,
    };

    try {
      const poa = await executePoa.mutateAsync(payload);
      setResult(poa);
      onSuccess?.(poa);
    } catch {
      // Error surfaced via executePoa.error
    }
  };

  if (result) {
    return (
      <div className={cn("mx-auto flex max-w-2xl flex-col gap-6 p-6", className)}>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden />
          <h2 className="text-2xl font-semibold">Power of Attorney Executed</h2>
          <p className="text-muted-foreground">
            Your PoA has been recorded. Keep this document hash for verification.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Document hash (SHA-256)
          </p>
          <p className="mt-2 break-all font-mono text-sm">{result.documentHash}</p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Verify at{" "}
          <span className="font-mono">
            safebuyrealties.com/verify?hash={result.documentHash.slice(0, 12)}…
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto flex max-w-3xl flex-col gap-6 p-6", className)}>
      <header className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" aria-hidden />
          <span className="text-lg font-semibold">SafeBuyRealties</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Power of Attorney Execution</h1>
        <p className="text-sm text-muted-foreground">
          Authorise SafeBuyRealties to conduct verification and perfect title on your behalf for
          this property transaction.
        </p>
        {(listingTitle || listingAddress || buyerName) && (
          <dl className="mx-auto mt-4 grid max-w-xl gap-2 rounded-lg border bg-muted/30 p-4 text-left text-sm">
            {buyerName && (
              <div>
                <dt className="font-medium text-muted-foreground">Principal (Buyer)</dt>
                <dd>{buyerName}</dd>
              </div>
            )}
            {listingTitle && (
              <div>
                <dt className="font-medium text-muted-foreground">Property</dt>
                <dd>{listingTitle}</dd>
              </div>
            )}
            {listingAddress && (
              <div>
                <dt className="font-medium text-muted-foreground">Address</dt>
                <dd>{listingAddress}</dd>
              </div>
            )}
          </dl>
        )}
      </header>

      <section aria-labelledby="poa-instrument-heading">
        <h2 id="poa-instrument-heading" className="mb-3 text-lg font-semibold">
          Instrument Text
        </h2>
        <ScrollArea className="h-64 rounded-lg border bg-background p-4">
          <div className="space-y-4 pr-4 text-sm leading-relaxed">
            {POA_INSTRUMENT_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="font-semibold">{section.title}</h3>
                <p className="mt-1 text-muted-foreground">{section.body}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </section>

      <section aria-labelledby="poa-consents-heading">
        <h2 id="poa-consents-heading" className="mb-3 text-lg font-semibold">
          Mandatory Consents
        </h2>
        <ul className="space-y-3">
          {POA_CONSENT_ITEMS.map((item) => (
            <li key={item.key} className="flex items-start gap-3">
              <Checkbox
                id={`consent-${item.key}`}
                checked={consents[item.key]}
                onCheckedChange={(checked) =>
                  setConsents((prev) => ({ ...prev, [item.key]: checked === true }))
                }
              />
              <Label htmlFor={`consent-${item.key}`} className="cursor-pointer leading-snug">
                {item.label}
              </Label>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="poa-signature-heading">
        <h2 id="poa-signature-heading" className="mb-3 text-lg font-semibold">
          Signature
        </h2>
        <Tabs
          value={signatureTab}
          onValueChange={(value) => setSignatureTab(value as "draw" | "type")}
        >
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="draw">Draw</TabsTrigger>
            <TabsTrigger value="type">Type</TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="mt-4">
            <SignatureCanvas onChange={setHasDrawnSignature} />
          </TabsContent>
          <TabsContent value="type" className="mt-4 space-y-2">
            <Label htmlFor="typed-signature">Full legal name</Label>
            <Input
              id="typed-signature"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              placeholder="Enter your full legal name"
              autoComplete="name"
            />
          </TabsContent>
        </Tabs>
      </section>

      {executePoa.isError && (
        <p className="text-sm text-destructive" role="alert">
          {executePoa.error instanceof Error
            ? executePoa.error.message
            : "Failed to execute Power of Attorney. Please try again."}
        </p>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={!canExecute}
        onClick={() => void handleExecute()}
      >
        {executePoa.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Executing…
          </>
        ) : (
          "Execute Power of Attorney"
        )}
      </Button>
    </div>
  );
}

export default PoAExecutionScreen;
