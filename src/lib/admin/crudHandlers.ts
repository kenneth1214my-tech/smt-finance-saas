import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { requireUser, canApprove } from "@/lib/dal";

/**
 * Generic REST handler factory for admin-managed tables. Every handler scopes by the caller's
 * organizationId — GET/POST/PUT/DELETE can never read or touch another tenant's rows, even if
 * the caller passes/guesses another tenant's id. `delegate` is a Prisma model delegate (e.g.
 * db.subsidiary); `createSchema`/`updateSchema` validate the request body. Every route requires
 * ADMIN or DIRECTOR.
 */
export function listCreateHandlers<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: any,
  createSchema: ZodType<T>,
  findManyArgs?: Record<string, unknown>
) {
  async function GET() {
    const user = await requireUser();
    if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { where, ...rest } = findManyArgs ?? {};
    const rows = await delegate.findMany({
      ...rest,
      where: { ...(where as object | undefined), organizationId: user.organizationId },
    });
    return NextResponse.json({ rows });
  }

  async function POST(req: Request) {
    const user = await requireUser();
    if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const raw = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
    const row = await delegate.create({ data: { ...parsed.data, organizationId: user.organizationId } });
    return NextResponse.json({ row });
  }

  return { GET, POST };
}

export function itemHandlers<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: any,
  updateSchema: ZodType<T>
) {
  async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await requireUser();
    if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
    // updateMany (not update) so the where clause can carry organizationId without needing a
    // compound unique index — a mismatched org means 0 rows affected, not another tenant's row.
    const result = await delegate.updateMany({ where: { id, organizationId: user.organizationId }, data: parsed.data });
    if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const row = await delegate.findUnique({ where: { id } });
    return NextResponse.json({ row });
  }

  async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await requireUser();
    if (!canApprove(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const { id } = await ctx.params;
    const result = await delegate.deleteMany({ where: { id, organizationId: user.organizationId } });
    if (result.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return { PUT, DELETE };
}
