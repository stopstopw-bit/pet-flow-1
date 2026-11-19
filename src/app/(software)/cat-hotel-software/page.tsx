import { getSeoSoftwarePage } from "@/lib/seo-software-pages";
import { SoftwareLanding, softwareMetadata } from "../SoftwareLanding";

const page = getSeoSoftwarePage("cat-hotel-software");

export const metadata = softwareMetadata(page);

export default function Page() {
  return <SoftwareLanding page={page} />;
}
