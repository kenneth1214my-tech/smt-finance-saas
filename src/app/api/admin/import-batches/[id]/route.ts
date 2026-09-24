import { z } from "zod";
import { db } from "@/lib/db";
import { itemHandlers } from "@/lib/admin/crudHandlers";

// ImportBatch is a log-only record (no other table references it), so deleting a row here is
// purely cosmetic cleanup of the "Recent imports" list — it never touches the data that import
// actually wrote (AR customers, P&L, etc.).
export const { DELETE } = itemHandlers(db.importBatch, z.object({}));
