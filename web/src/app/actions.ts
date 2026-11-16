"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteItems } from "@/lib/items";

/** Bulk delete for the storefront's "select" mode — P0 in the PRD, so a bad ingestion
 * pass can be cleared quickly instead of deleting items one at a time. */
export async function bulkDeleteAction(ids: string[]) {
  const user = await requireUser();
  await deleteItems(user.id, ids);
  revalidatePath("/");
}
