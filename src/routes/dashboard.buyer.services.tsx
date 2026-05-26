import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import ServiceSelector from "@/components/ServiceSelector";

export const Route = createFileRoute("/dashboard/buyer/services")({
  component: BuyerServicesPage,
});

function BuyerServicesPage() {
  return (
    <>
      <PageHeader
        title="Select Services"
        description="Choose a due diligence bundle or individual services."
      />
      <ServiceSelector onSelectionChange={(s) => console.log("selection", s)} />
    </>
  );
}
