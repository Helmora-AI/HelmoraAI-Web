import { handlePagesHubProxy, type PagesProxyEnv } from "../src/cloudflare/pagesProxy";

interface Env extends PagesProxyEnv {}

/**
 * Cloudflare Pages catch-all Function. Invocation scope is narrowed by
 * public/_routes.json; the handler still enforces the Hub path allowlist.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const pagesOrigin = new URL(context.request.url).origin;
  return handlePagesHubProxy({
    request: context.request,
    env: context.env,
    pagesOrigin,
  });
};
