"use client";

import { useState } from "react";
import { EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PageOptionsMenuProps {
  pageTitle: string;
  isOnlyPage: boolean;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onPreview: () => void;
}

export default function PageOptionsMenu({
  pageTitle,
  isOnlyPage,
  onRename,
  onDelete,
  onPreview,
}: PageOptionsMenuProps) {
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newTitle, setNewTitle] = useState(pageTitle);

  const handleRenameSubmit = () => {
    if (newTitle.trim()) {
      onRename(newTitle.trim());
    }
    setShowRenameDialog(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPreview}
          title="Preview page"
        >
          <EyeIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setNewTitle(pageTitle);
            setShowRenameDialog(true);
          }}
          title="Rename page"
        >
          <PencilIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowDeleteDialog(true)}
          title="Delete page"
          className="text-destructive hover:text-destructive"
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="border-none">
          <DialogHeader>
            <DialogTitle>Rename Page</DialogTitle>
            <DialogDescription>Enter a new name for this page.</DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Page title"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRenameSubmit();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOnlyPage ? "Cannot Delete Page" : "Delete Page"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOnlyPage
                ? "This is the only page in your project. You need at least one page."
                : `Are you sure you want to delete "${pageTitle}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isOnlyPage ? (
              <AlertDialogCancel>OK</AlertDialogCancel>
            ) : (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onDelete();
                    setShowDeleteDialog(false);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
