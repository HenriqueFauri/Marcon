import { Landing, metadataDo } from "./landing";

export const metadata = metadataDo("geral");

export default function LandingPage() {
  return <Landing publico="geral" />;
}
