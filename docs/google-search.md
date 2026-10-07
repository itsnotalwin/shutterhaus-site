# Google search setup

The site is prepared for search, but Google account verification and indexing
must be checked separately. Neither Search Console nor a Business Profile was
set up as of 7 October 2026.

## Search Console

1. Sign in at <https://search.google.com/search-console> with the Google account
   that will own the business.
2. Add a **Domain** property for `shutterhausvisuals.co.za`.
3. Copy Google's exact TXT verification record into the domain's DNS settings.
   Add a new record; keep existing email and website records. Then verify in Google.
4. Submit <https://shutterhausvisuals.co.za/sitemap.xml> under **Sitemaps**.
5. Use **URL inspection** on the homepage and the Portfolio, Services, About and
   Contact URLs from that sitemap. Run the live test, then request indexing if
   Google allows it. Submission does not guarantee inclusion or ranking.
6. Review **Page indexing** for exclusions and **Performance** for search terms,
   impressions and clicks once Google has collected data. Check Google's chosen
   canonical against the inspected page's URL.

The pages contain their content before JavaScript runs. Public pages have
individual canonical URLs, titles and descriptions, structured business data,
share images and a crawlable favicon. Admin is excluded from the sitemap and
uses `noindex`; robots.txt allows Google to read that directive.

## Google Business Profile

Start at <https://www.google.com/business/>. Check for an existing listing before
creating one. Use the real business name **Shutterhaus Visuals**, category
**Photographer**, and <https://shutterhausvisuals.co.za/>.

For an on-location business where customers do not visit a staffed premises,
set up a service-area business and hide the residential address. Select actual
served places around Kempton Park within the agreed 25 km area; Google uses
named areas rather than a custom radius. Enter only real contact details and
actual appointment availability. Complete Google's requested verification.

Suggested factual description:

> On-location portraits, couples, family photography and social content by
> Alwin Newman, based in Kempton Park. Sessions are available in the evenings
> and on weekends by appointment. Travel within 25 km of Kempton Park is
> included in the photography packages.

Upload selected portfolio photographs you have permission to publish. Ask real
clients for honest reviews without incentives. Keep business name, website,
service areas and contact details consistent with the site.

## Verification limits

Public search checks did not return a relevant exact-brand/domain result during
this review. That is not proof that Google has not indexed the site. Direct live
site and Google search fetching were unavailable in the review environment.
Search Console and Business Profile are the authoritative next checks.

Local Lighthouse results are laboratory measurements, not live Google PageSpeed
or Core Web Vitals field data. Recheck the public URL in
<https://pagespeed.web.dev/> once the deployment is live; review both mobile and
desktop and distinguish real-user data from the simulated test.
