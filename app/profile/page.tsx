import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Profile | Wirely",
  description: "Manage your Wirely profile details.",
};

export default async function ProfilePage() {
  redirect("/setting/profile");
}
