import { ToxiFlowDashboard } from "@/components/ToxiFlowDashboard";
import { getDrugs } from "@/lib/drugs";

export default async function HomePage() {
  const drugs = await getDrugs();

  return <ToxiFlowDashboard drugs={drugs} />;
}