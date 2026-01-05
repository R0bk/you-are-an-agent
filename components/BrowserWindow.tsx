import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "iframe" | "fetch";

type BrowserWindowProps = {
  initialUrl?: string;
  homeUrl?: string;
  mode?: Mode;

  /**
   * Optional safety rail: only allow navigating to these hosts (exact match or subdomain match).
   * Example: ["example.com", "docs.mycorp.internal"]
   */
  allowedHosts?: string[];

  className?: string;
  style?: React.CSSProperties;
};

type NavOptions = { pushHistory?: boolean };

function looksLikeUrl(input: string) {
  // Very loose heuristic: either has a scheme, or looks like a domain.tld[/...]
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) return true;
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(input);
}

function normalizeToUrl(input: string) {
  const raw = input.trim();

  // allow a couple “special” internal pages if you want to extend later
  if (raw === "" || raw === "about:blank") return "about:blank";

  // already has scheme
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) return raw;

  // looks like a hostname/path
  if (looksLikeUrl(raw)) return `https://${raw}`;

  // otherwise treat as search
  const q = encodeURIComponent(raw);
  return `https://www.google.com/search?q=${q}`;
}

function hostAllowed(urlStr: string, allowedHosts?: string[]) {
  if (!allowedHosts || allowedHosts.length === 0) return true;

  try {
    const u = new URL(urlStr);
    const h = u.hostname.toLowerCase();
    return allowedHosts.some((allowed) => {
      const a = allowed.toLowerCase();
      return h === a || h.endsWith(`.${a}`);
    });
  } catch {
    return false;
  }
}

function injectBaseTag(html: string, baseHref: string) {
  const base = `<base href="${baseHref}">`;
  if (/<base\b/i.test(html)) return html;

  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (m) => `${m}\n${base}`);
  }

  // no <head> → add one
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (m) => `${m}\n<head>${base}</head>`);
  }

  // worst case: prepend
  return `<head>${base}</head>\n${html}`;
}

function injectLinkInterceptor(html: string) {
  // Intercepts <a href> clicks and tells parent to navigate (so we can keep history/address in sync in fetch mode).
  const script = `
<script>
(function () {
  function closestAnchor(el) {
    while (el && el !== document.documentElement) {
      if (el.tagName && el.tagName.toLowerCase() === 'a' && el.getAttribute('href')) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('click', function (e) {
    try {
      var a = closestAnchor(e.target);
      if (!a) return;

      var href = a.getAttribute('href');
      if (!href) return;

      // Respect modifier keys / new-tab intents
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      var abs = new URL(href, document.baseURI).href;
      window.parent.postMessage({ __BW_NAVIGATE: abs }, '*');
    } catch (_) {}
  }, true);
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}\n</body>`);
  }
  return `${html}\n${script}`;
}

export function BrowserWindow({
  initialUrl = "https://example.com",
  homeUrl = "https://example.com",
  mode = "iframe",
  allowedHosts,
  className,
  style,
}: BrowserWindowProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [address, setAddress] = useState<string>(initialUrl);
  const [currentUrl, setCurrentUrl] = useState<string>(normalizeToUrl(initialUrl));

  const [history, setHistory] = useState<string[]>(() => [normalizeToUrl(initialUrl)]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // For iframe reload remount
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // For fetch mode rendering
  const [srcDoc, setSrcDoc] = useState<string>("");

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const navigate = useCallback(
    async (rawInput: string, opts: NavOptions = {}) => {
      const pushHistory = opts.pushHistory ?? true;

      const url = normalizeToUrl(rawInput);

      if (!hostAllowed(url, allowedHosts)) {
        setError(`Navigation blocked: ${url}`);
        return;
      }

      setError(null);
      setLoading(true);
      setCurrentUrl(url);
      setAddress(url);

      if (pushHistory) {
        setHistory((prev) => {
          const trimmed = prev.slice(0, historyIndex + 1);
          trimmed.push(url);
          return trimmed;
        });
        setHistoryIndex((prev) => prev + 1);
      }

      if (mode === "iframe") {
        // remount iframe to force reload
        setReloadNonce((n) => n + 1);
        setLoading(false); // we'll re-set loading until onLoad fires
        setLoading(true);
        return;
      }

      // fetch mode
      try {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const res = await fetch(url, { signal: ac.signal, mode: "cors" });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
        if (!ct.includes("text/html")) {
          // Allow some non-html pages to still render as text
          const txt = await res.text();
          const escaped = txt
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          setSrcDoc(`<pre style="white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;padding:12px;">${escaped}</pre>`);
          setLoading(false);
          return;
        }

        let html = await res.text();
        html = injectBaseTag(html, url);
        html = injectLinkInterceptor(html);

        setSrcDoc(html);
        setLoading(false);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        // Most common case here is CORS being denied by the target site.
        setError(e?.message || "Failed to load page (likely blocked by CORS).");
        setLoading(false);
      }
    },
    [allowedHosts, historyIndex, mode]
  );

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    navigate(history[nextIndex], { pushHistory: false });
  }, [canGoBack, history, historyIndex, navigate]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    navigate(history[nextIndex], { pushHistory: false });
  }, [canGoForward, history, historyIndex, navigate]);

  const reload = useCallback(() => {
    setError(null);
    if (mode === "iframe") {
      setLoading(true);
      setReloadNonce((n) => n + 1);
      return;
    }
    navigate(currentUrl, { pushHistory: false });
  }, [currentUrl, mode, navigate]);

  const goHome = useCallback(() => {
    navigate(homeUrl);
  }, [homeUrl, navigate]);

  // Handle link-click navigation in fetch mode (from injected script)
  useEffect(() => {
    if (mode !== "fetch") return;

    const onMessage = (evt: MessageEvent) => {
      // Only accept messages from our iframe
      if (!iframeRef.current?.contentWindow) return;
      if (evt.source !== iframeRef.current.contentWindow) return;

      const data = evt.data;
      if (!data || typeof data !== "object") return;
      if (data.__BW_NAVIGATE && typeof data.__BW_NAVIGATE === "string") {
        navigate(data.__BW_NAVIGATE);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mode, navigate]);

  // initial load
  useEffect(() => {
    navigate(initialUrl, { pushHistory: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      navigate(address);
    },
    [address, navigate]
  );

  const openExternal = useCallback(() => {
    window.open(currentUrl, "_blank", "noopener,noreferrer");
  }, [currentUrl]);

  const iframeSandbox = useMemo(() => {
    // Reasonable “in-app browser” sandbox: prevents top-level navigation hijacks,
    // but still lets most sites run.
    // You can loosen/tighten as you like.
    return [
      "allow-forms",
      "allow-modals",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-downloads",
      "allow-pointer-lock",
      "allow-scripts",
      "allow-same-origin",
    ].join(" ");
  }, []);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        overflow: "hidden",
        background: "rgba(20,20,20,0.85)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: 10,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <button onClick={goBack} disabled={!canGoBack} style={btnStyle}>
          ←
        </button>
        <button onClick={goForward} disabled={!canGoForward} style={btnStyle}>
          →
        </button>
        <button onClick={reload} style={btnStyle}>
          ⟳
        </button>
        <button onClick={goHome} style={btnStyle}>
          ⌂
        </button>

        <form onSubmit={onSubmit} style={{ flex: 1, display: "flex", gap: 8 }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Type a URL or search…"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.35)",
              color: "white",
              outline: "none",
              fontSize: 14,
            }}
          />
          <button type="submit" style={btnStyle}>
            Go
          </button>
        </form>

        <button onClick={openExternal} style={btnStyle} title="Open in new tab">
          ↗
        </button>
      </div>

      {error ? (
        <div style={{ padding: 12, color: "#ffb4b4", fontSize: 13, lineHeight: 1.4 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>Couldn’t load that page.</div>
          <div style={{ opacity: 0.9 }}>{error}</div>
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Tip: if <code>mode="iframe"</code> shows a blank page, the site probably blocks embedding; try <code>↗</code> or switch to <code>mode="fetch"</code> (only works when the site allows CORS).
          </div>
        </div>
      ) : null}

      <div style={{ position: "relative", flex: 1, minHeight: 320, background: "black" }}>
        {loading ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.75)",
              fontSize: 13,
              pointerEvents: "none",
              background: "linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.10))",
              zIndex: 2,
            }}
          >
            Loading…
          </div>
        ) : null}

        {mode === "iframe" ? (
          <iframe
            key={`${currentUrl}::${reloadNonce}`}
            ref={iframeRef}
            src={currentUrl}
            style={{ width: "100%", height: "100%", border: 0 }}
            onLoad={() => setLoading(false)}
          />
        ) : (
          <iframe
            key={`${currentUrl}::${reloadNonce}`}
            ref={iframeRef}
            srcDoc={srcDoc}
            sandbox={iframeSandbox /* in fetch mode this is especially important */}
            referrerPolicy="no-referrer"
            style={{ width: "100%", height: "100%", border: 0, background: "white" }}
            onLoad={() => setLoading(false)}
          />
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
};
