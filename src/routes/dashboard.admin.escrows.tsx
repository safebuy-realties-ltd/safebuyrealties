import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { useHeldEscrowsQuery, useReleaseEscrowMutation, useRefundEscrowMutation, escrowStatusLabel } from "@/hooks/use-escrow";
export const Route = createFileRoute("/dashboard/admin/escrows")({ component: () => {
  const { data } = useHeldEscrowsQuery(); const release = useReleaseEscrowMutation(); const refund = useRefundEscrowMutation();
  return (<><PageHeader title="Escrow management" description="Held escrows" />
    {(data??[]).map(r=>(<div key={r.id} className="mb-2 flex justify-between rounded border p-3"><div><p className="font-medium">{r.transaction.listing.title}</p><p className="text-sm text-muted-foreground">{escrowStatusLabel(r.status)} · ₦{r.heldAmount}</p></div><div className="flex gap-2"><Button size="sm" disabled={(r.unmetConditions?.length??0)>0} onClick={()=>release.mutate({transactionId:r.transactionId})}>Release</Button><Button size="sm" variant="outline" onClick={()=>refund.mutate({transactionId:r.transactionId})}>Refund</Button></div></div>))}
  </>);
}});
