import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/server", "/account", "/account/usage", "/account/subscription", "/account/subscription/success", "/chat/:threadId"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // Home page ("/") is always public now. Only protect account and thread routes.
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
