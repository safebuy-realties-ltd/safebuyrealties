import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/listings/$listingId")({ component: ListingDetail });

type Listing = { id:string; sellerId:string; title:string; description:string; location:string; price:string; currency:string; status:string };
type Doc = { id:string; fileName:string; category:string; sizeBytes:number };
type Step = { id:string; type:string; status:string };

function ListingDetail(){
  const { listingId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const listingQ = useQuery({ queryKey:["listing", listingId], queryFn: async()=> (await apiRequest<Listing>(`/listings/${listingId}`)).data });
  const docsQ = useQuery({ queryKey:["docs", listingId], enabled: !!user, queryFn: async()=> (await apiRequest<Doc[]>(`/documents/listing/${listingId}`)).data });
  const stepsQ = useQuery({ queryKey:["steps", listingId], enabled: !!user, queryFn: async()=> (await apiRequest<Step[]>(`/verification/listing/${listingId}`)).data });
  const submit = useMutation({ mutationFn: async()=> apiRequest("/verification/assign", {method:"POST", body: JSON.stringify({ listingId, stepType:"SUBMISSION" })}), onSuccess: async()=> qc.invalidateQueries({queryKey:["steps", listingId]}) });

  if (listingQ.isLoading) return <div className="p-10">Loading…</div>;
  if (listingQ.isError) return <div className="p-10 text-destructive">{listingQ.error instanceof Error ? listingQ.error.message : "Failed"}</div>;
  const listing = listingQ.data;
  const isSellerOwner = user?.role === "seller" && user.id === listing.sellerId;

  return <div className="min-h-screen bg-background"><SiteHeader />
    <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div><Link to="/dashboard/seller/listings" className="text-sm underline">Back to listings</Link>
      <h1 className="text-2xl font-semibold">{listing.title}</h1>
      <p className="text-sm text-muted-foreground">{listing.location} · {listing.currency} {listing.price} · {listing.status}</p>
      <p className="mt-2">{listing.description}</p></div>

      {isSellerOwner && <div className="rounded-xl border p-4"><Button onClick={()=>submit.mutate()} disabled={submit.isPending}>Submit for Verification</Button></div>}

      <div className="rounded-xl border p-4"><h2 className="font-semibold">Documents</h2>
        <ul className="mt-2 text-sm space-y-1">{(docsQ.data ?? []).map((d)=><li key={d.id}>{d.fileName} · {d.category}</li>)}</ul>
      </div>
      <div className="rounded-xl border p-4"><h2 className="font-semibold">Verification status</h2>
        <ul className="mt-2 text-sm space-y-1">{(stepsQ.data ?? []).map((s)=><li key={s.id}>{s.type}: {s.status}</li>)}</ul>
      </div>
    </main></div>
}
