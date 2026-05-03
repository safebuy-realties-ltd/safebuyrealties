import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout, PageHeader } from "@/components/dashboard/DashboardLayout";
import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/dashboard/seller/documents")({ component: SellerDocuments });

type Listing = { id:string; title:string };
type Doc = { id:string; fileName:string; category:string; sizeBytes:number; createdAt:string };

type Step = { id:string; type:string; status:string; assignedProfessionalId:string | null };

function SellerDocuments(){
  const qc = useQueryClient();
  const [listingId, setListingId] = useState("");
  const [category, setCategory] = useState("title_deed");
  const [file, setFile] = useState<File | null>(null);
  const { data: listings=[] } = useQuery({ queryKey:["seller-listings"], queryFn: async()=> (await apiRequest<Listing[]>("/listings")).data });
  const docsQuery = useQuery({ queryKey:["listing-docs", listingId], enabled: !!listingId, queryFn: async()=> (await apiRequest<Doc[]>(`/documents/listing/${listingId}`)).data });
  const stepQuery = useQuery({ queryKey:["listing-steps", listingId], enabled: !!listingId, queryFn: async()=> (await apiRequest<Step[]>(`/verification/listing/${listingId}`)).data });

  const upload = useMutation({ mutationFn: async()=>{ if(!file || !listingId) return; const fd = new FormData(); fd.append("listingId", listingId); fd.append("category", category); fd.append("file", file); return apiRequest("/documents/upload", {method:"POST", body:fd}); }, onSuccess: async()=>{ setFile(null); await qc.invalidateQueries({queryKey:["listing-docs", listingId]}); } });
  const submit = useMutation({ mutationFn: async()=> apiRequest("/verification/assign", {method:"POST", body: JSON.stringify({ listingId, stepType:"SUBMISSION" })}) , onSuccess: async()=> qc.invalidateQueries({queryKey:["listing-steps", listingId]})});

  return <DashboardLayout role="seller"><PageHeader title="Documents" description="Upload listing documents and submit for verification." />
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <select className="h-10 rounded border px-2" value={listingId} onChange={(e)=>setListingId(e.target.value)}>
        <option value="">Select listing</option>
        {listings.map((l)=><option key={l.id} value={l.id}>{l.title}</option>)}
      </select>
      {listingId && <Link className="text-sm underline" to="/listings/$listingId" params={{listingId}}>Open listing detail</Link>}
      <div className="flex gap-2 items-center">
        <input value={category} onChange={(e)=>setCategory(e.target.value)} className="h-10 rounded border px-2" placeholder="category" />
        <input type="file" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />
        <Button onClick={()=>upload.mutate()} disabled={!file || !listingId || upload.isPending}>Upload</Button>
      </div>
      {upload.isError && <p className="text-sm text-destructive">{upload.error instanceof Error ? upload.error.message : "Upload failed"}</p>}
      <Button onClick={()=>submit.mutate()} disabled={!listingId || submit.isPending}>Submit for verification</Button>
      {submit.isError && <p className="text-sm text-destructive">{submit.error instanceof Error ? submit.error.message : "Submit failed"}</p>}
    </div>
    <div className="mt-6 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Documents</h3>
      <ul className="mt-3 space-y-2 text-sm">{(docsQuery.data ?? []).map((d)=><li key={d.id}>{d.fileName} · {d.category}</li>)}</ul>
    </div>
    <div className="mt-6 rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Verification status</h3>
      <ul className="mt-3 space-y-2 text-sm">{(stepQuery.data ?? []).map((s)=><li key={s.id}>{s.type}: {s.status}</li>)}</ul>
    </div>
  </DashboardLayout>
}
