import { ToxiFlowDashboard } from "@/components/ToxiFlowDashboard";
import { getDrugs } from "@/lib/drugs";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const drugs = await getDrugs();

  return <ToxiFlowDashboard drugs={drugs} />;
}