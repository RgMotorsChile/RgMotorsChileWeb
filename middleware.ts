import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/auth/session";
import { isPublicApi } from "@/lib/auth/apiAccess";
import { isMachineAuthPath } from "@/lib/auth/machineAuth";
import { applySecurityHeaders, rejectUntrustedOrigin } from "@/lib/server/security";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // CSRF básico en mutaciones públicas. Cron/webhook usan Bearer (sin Origin).
  if (
    pathname.startsWith("/api/") &&
    MUTATING.has(method) &&
    isPublicApi(pathname, method, request.nextUrl.searchParams) &&
    !isMachineAuthPath(pathname)
  ) {
    const blocked = rejectUntrustedOrigin(request);
    if (blocked) return applySecurityHeaders(blocked);
  }

  const isProtectedAdminPath =
    pathname.startsWith("/admin") && pathname !== "/admin/login";

  const isProtectedApi =
    pathname.startsWith("/api/") &&
    !isPublicApi(pathname, method, request.nextUrl.searchParams);

  if (isProtectedAdminPath || isProtectedApi) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const session = await verifyAdminSessionToken(token);

    if (!session) {
      if (isProtectedApi) {
        return applySecurityHeaders(
          NextResponse.json({ error: "No autorizado" }, { status: 401 }),
        );
      }
      return applySecurityHeaders(
        NextResponse.redirect(new URL("/admin/login", request.url)),
      );
    }

    if (session.mustChange) {
      const allowedWhileMustChange =
        pathname === "/admin/login" || pathname.startsWith("/api/auth");
      if (!allowedWhileMustChange) {
        if (isProtectedApi) {
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "Debes cambiar usuario y contraseña antes de continuar",
                mustChange: true,
              },
              { status: 403 },
            ),
          );
        }
        return applySecurityHeaders(
          NextResponse.redirect(new URL("/admin/login?change=1", request.url)),
        );
      }
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
