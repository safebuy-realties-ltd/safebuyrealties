import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard/seller/listings")({ component: SellerListingsPage });

type Listing = { id:string; title:string; description:string; location:string; price:string; currency:string; status:string; createdAt:string; updatedAt:string };

const statusClass: Record<string,string> = { DRAFT:"border-warning/30 bg-warning/15", PENDING_REVIEW:"border-primary/20 bg-primary-soft", IN_VERIFICATION:"border-primary/20 bg-primary-soft", VERIFIED:"border-success/30 bg-success/15", LIVE:"border-success/30 bg-success/15", REJECTED:"border-destructive/30 bg-destructive/10" };

function SellerListingsPage(){
  const qc = useQueryClient();
  const nav = useNavigate();
  const [form, setForm] = useState({ title:"", description:"", location:"", price:"" });
  const { data, isLoading, error } = useQuery({ queryKey:["seller-listings"], queryFn: async()=> (await apiRequest<Listing[]>("/listings")).data });

  const create = useMutation({
    mutationFn: async()=> (await apiRequest<Listing>("/listings", { method:"POST", body: JSON.stringify({ title: form.title, description: form.description, location: form.location, price: Number(form.price), status: "DRAFT" }) })).data,
    onSuccess: async (listing)=>{ setForm({ title:"", description:"", location:"", price:""}); await qc.invalidateQueries({queryKey:["seller-listings"]}); nav({to:"/dashboard/seller/listings"}); }
  });

  const rows = useMemo(()=> data ?? [], [data]);
  return <DashboardLayout role="seller"><PageHeader title="My listings" description="Create and manage your property listings." />
    <div className="rounded-xl border p-5 bg-card space-y-3">
      <h2 className="font-semibold">Create listing</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input placeholder="Title" value={form.title} onChange={(e)=>setForm((f)=>({...f,title:e.target.value}))} />
        <Input placeholder="Location" value={form.location} onChange={(e)=>setForm((f)=>({...f,location:e.target.value}))} />
        <Input placeholder="Price" type="number" value={form.price} onChange={(e)=>setForm((f)=>({...f,price:e.target.value}))} />
        <Input placeholder="Description" value={form.description} onChange={(e)=>setForm((f)=>({...f,description:e.target.value}))} />
      </div>
      <Button disabled={create.isPending || !form.title || !form.description || !form.location || !form.price} onClick={()=>create.mutate()}>Create listing</Button>
      {create.isError && <p className="text-sm text-destructive">{create.error instanceof Error ? create.error.message : "Failed to create listing"}</p>}
    </div>

    <div className="mt-6 rounded-xl border bg-card overflow-hidden">
      <div className="p-4 border-b font-semibold">Your listings</div>
      {isLoading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
      {error && <div className="p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Failed"}</div>}
      <div className="divide-y">{rows.map((l)=><Link key={l.id} to="/listings/$listingId" params={{listingId:l.id}} className="block p-4 hover:bg-secondary/40"><div className="flex justify-between"><div><p className="font-medium">{l.title}</p><p className="text-xs text-muted-foreground">{l.location}</p></div><div className="text-right"><p className="font-semibold">{l.currency} {l.price}</p><Badge variant="outline" className={statusClass[l.status] ?? ""}>{l.status}</Badge></div></div></Link>)}</div>
    </div>
  </DashboardLayout>
}
