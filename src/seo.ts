import pages from "./seo.json";

/** Keep document routes and old hash bookmarks consistent with the static HTML. */
export function updatePageMetadata(route: string): void {
  const key = Object.hasOwn(pages, route) ? route as keyof typeof pages : "portfolio";
  const page = pages[key];
  const base = "https://shutterhausvisuals.co.za/";
  const url = base + (key === "home" ? "" : page.filename);
  document.title = page.title;
  for (const [selector, content] of [
    ['meta[name="description"]', page.description],
    ['meta[property="og:title"]', page.title],
    ['meta[property="og:description"]', page.description],
    ['meta[property="og:url"]', url],
    ['meta[name="twitter:title"]', page.title],
    ['meta[name="twitter:description"]', page.description],
  ]) document.querySelector(selector)?.setAttribute("content", content);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);

  const schema = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (!schema?.textContent) return;
  const data = JSON.parse(schema.textContent);
  const graph = data["@graph"].filter((node: Record<string, unknown>) => node["@type"] !== "BreadcrumbList");
  const webPage = graph.find((node: Record<string, unknown>) => node["@type"] === "WebPage");
  Object.assign(webPage, { "@id": `${url}#webpage`, url, name: page.title, description: page.description });
  if (key !== "home") graph.push({
    "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base },
      { "@type": "ListItem", position: 2, name: page.title.split(" | ")[0], item: url },
    ],
  });
  schema.textContent = JSON.stringify({ ...data, "@graph": graph });
}
