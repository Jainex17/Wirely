"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";

interface ProfileDetailsClientProps {
  userName: string | null;
  userEmail: string | null;
}

export default function ProfileDetailsClient({
  userName,
  userEmail,
}: ProfileDetailsClientProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(userName ?? "");
  const [savedDisplayName, setSavedDisplayName] = useState(userName ?? "");
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  const initials =
    (savedDisplayName || userEmail || "User")
      .split(" ")
      .map((segment) => segment[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  useEffect(() => {
    setDisplayName(userName ?? "");
    setSavedDisplayName(userName ?? "");
  }, [userName, userEmail]);

  const detailsChanged = useMemo(
    () => displayName.trim() !== savedDisplayName.trim(),
    [displayName, savedDisplayName],
  );

  const handleSaveDetails = async () => {
    if (isSavingDetails || !detailsChanged) return;

    setIsSavingDetails(true);
    try {
      const response = await fetch("/api/profile/details", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: displayName,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Unable to save profile details.");
      }

      const payload = (await response.json()) as {
        name?: string | null;
      };
      const nextName = (payload.name ?? "").trim();

      setDisplayName(nextName);
      setSavedDisplayName(nextName);
      setIsEditing(false);
      toast.success("Profile details saved.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save details.",
      );
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="gap-0 rounded-2xl py-0 shadow-none">
        <CardHeader className="gap-3 px-6 py-6">
          <div className="flex items-start gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-muted p-3 text-muted-foreground">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl">Profile Information</CardTitle>
                <CardDescription className="mt-1 max-w-2xl">
                  Your personal account information.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-6 pb-6">
          <div className="grid gap-6 lg:grid-cols-[120px_minmax(0,1fr)] lg:items-start">
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted text-xl font-semibold text-foreground">
              {initials}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Name</p>
                  {!isEditing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                      className="h-8 rounded-lg px-2 text-muted-foreground hover:text-foreground"
                    >
                      <PencilLine className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <Input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Your name"
                      disabled={isSavingDetails}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleSaveDetails();
                        }

                        if (event.key === "Escape") {
                          setDisplayName(savedDisplayName);
                          setIsEditing(false);
                        }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveDetails()}
                        disabled={!detailsChanged || isSavingDetails}
                      >
                        {isSavingDetails ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDisplayName(savedDisplayName);
                          setIsEditing(false);
                        }}
                        disabled={isSavingDetails}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-lg text-foreground">
                    {savedDisplayName || "Not set"}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Email</p>
                <p className="mt-2 break-all text-lg text-foreground">
                  {userEmail ?? "Not set"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
