import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Helper to check if a JWT token is expired
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    
    // Decode base64url payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    
    const payload = JSON.parse(jsonPayload);
    if (payload && payload.exp) {
      // Buffer of 10 seconds
      return Date.now() >= (payload.exp - 10) * 1000;
    }
    return true;
  } catch (e) {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Exclude static assets, next internals, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  
  const sessionToken = request.cookies.get("sb-access-token")?.value;
  const isAuthenticated = sessionToken && !isTokenExpired(sessionToken);
  
  const isAuthRoute = pathname === "/login" || pathname === "/register";
  const isSetupRoute = pathname.startsWith("/register/email-setup") || pathname.startsWith("/register/done");
  
  if (!isAuthenticated) {
    // Unauthenticated users attempting to access dashboard or setup pages are sent to login
    if (!isAuthRoute) {
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  } else {
    // Authenticated users attempting to go to login or register (step 1) are sent to dashboard
    if (isAuthRoute) {
      const dashboardUrl = new URL("/", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }
  
  return NextResponse.next();
}
