import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/StatusScreen";

export const metadata: Metadata = { title: "Not found · TraceIt" };

// notFound() anywhere in the app (an unknown session, lecture…).
export default function NotFound() {
  return <NotFoundScreen />;
}
