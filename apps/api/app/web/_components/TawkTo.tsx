import Script from 'next/script';

/**
 * tawk.to live-chat widget for the web interface.
 *
 * Opt-in: renders nothing unless BOTH ids are set in `.env`, so the site works
 * unchanged on a server where chat was never set up. Read on the server (not
 * NEXT_PUBLIC_) and handed to the page as a plain script URL; changing them
 * needs a rebuild/restart because the layout is prerendered.
 */
export function TawkTo() {
  const propertyId = process.env.TAWK_PROPERTY_ID?.trim();
  const widgetId = process.env.TAWK_WIDGET_ID?.trim() || 'default';
  if (!propertyId) return null;

  const src = `https://embed.tawk.to/${encodeURIComponent(propertyId)}/${encodeURIComponent(widgetId)}`;

  return (
    <Script id="tawk-to" strategy="lazyOnload">
      {`var Tawk_API=Tawk_API||{},Tawk_LoadStart=new Date();
(function(){var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;s1.src=${JSON.stringify(src)};s1.charset="UTF-8";s1.setAttribute("crossorigin","*");
s0.parentNode.insertBefore(s1,s0);})();`}
    </Script>
  );
}
