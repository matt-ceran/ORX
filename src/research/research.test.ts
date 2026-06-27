import test from "node:test";
import assert from "node:assert/strict";
import {
  extractContent,
  fetchUrl,
  formatEvidenceSources,
  formatFetchedUrlResult,
  formatResearchFetchError,
  guardFetchUrl,
} from "./index.js";

test("URL guard allows only public http and https URLs", () => {
  const allowed = guardFetchUrl("https://example.com/docs/sk-or-v1-secret?api_key=secret&value=ghp_secret#section");
  assert.equal(allowed.ok, true);
  assert.equal(
    allowed.ok ? allowed.canonicalUrl : "",
    "https://example.com/docs/REDACTED?api_key=REDACTED&value=REDACTED",
  );

  for (const url of [
    "file:///etc/passwd",
    "http://localhost/",
    "http://localhost./",
    "http://service.localhost/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://192.0.0.1/",
    "http://192.0.2.1/",
    "http://192.168.1.1/",
    "http://198.18.0.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://169.254.169.254/",
    "http://169.254.170.2/",
    "http://100.100.100.200/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://metadata.google.internal/",
    "https://user:pass@example.com/",
  ]) {
    assert.equal(guardFetchUrl(url).ok, false, url);
  }
});

test("fetchUrl blocks DNS results that resolve to local or reserved addresses", async () => {
  await assert.rejects(
    fetchUrl({
      url: "https://example.com/research",
      sourceId: "src-1",
      resolveHost: async (hostname) => {
        assert.equal(hostname, "example.com");
        return [{ address: "127.0.0.1", family: 4 }];
      },
    }),
    /Blocked resolved local or private IP address: 127\.0\.0\.1/,
  );
});

test("fetchUrl timeout covers DNS resolution", async () => {
  await assert.rejects(
    fetchUrl({
      url: "https://example.com/slow-dns",
      sourceId: "src-1",
      timeoutMs: 20,
      resolveHost: async () => new Promise(() => undefined),
    }),
    /Fetch timed out after 20ms/,
  );
});

test("fetchUrl blocks guarded URLs before network", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    fetchUrl({
      url: "http://127.0.0.1/latest/meta-data",
      sourceId: "src-1",
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("should not fetch");
      },
    }),
    /Blocked local or private IPv4 address/,
  );
  assert.equal(fetchCalls, 0);
});

test("fetchUrl guards redirects before following them", async () => {
  const seenUrls: string[] = [];
  const result = await fetchUrl({
    url: "https://example.com/start",
    sourceId: "src-1",
    fetch: async (input) => {
      seenUrls.push(String(input));
      if (String(input) === "https://example.com/start") {
        return new Response("", {
          status: 302,
          headers: { location: "/final?token=secret-token" },
        });
      }

      return new Response("final text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  assert.deepEqual(seenUrls, [
    "https://example.com/start",
    "https://example.com/final?token=secret-token",
  ]);
  assert.equal(result.source.canonicalUrl, "https://example.com/final?token=REDACTED");
  assert.equal(result.extracted.text, "final text");

  let blockedFetchCalls = 0;
  await assert.rejects(
    fetchUrl({
      url: "https://example.com/start",
      sourceId: "src-1",
      fetch: async () => {
        blockedFetchCalls += 1;
        return new Response("", {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data" },
        });
      },
    }),
    /Blocked redirect: Blocked local or private IPv4 address/,
  );
  assert.equal(blockedFetchCalls, 1);
});

test("fetchUrl timeout covers body reads after headers arrive", async () => {
  await assert.rejects(
    fetchUrl({
      url: "https://example.com/slow-body",
      sourceId: "src-1",
      timeoutMs: 20,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            async pull() {
              await new Promise(() => undefined);
            },
          }),
          {
            status: 200,
            headers: { "content-type": "text/plain" },
          },
        ),
    }),
    /Fetch timed out after 20ms/,
  );
});

test("fetchUrl extracts bounded HTML as unknown-trust evidence", async () => {
  const html = [
    "<!doctype html>",
    "<html><head><title>Example &amp; Docs</title><style>.x{}</style></head>",
    "<body><main><h1>Heading</h1><p>Readable text &amp; details.</p>",
    "<script>secret()</script></main></body></html>",
  ].join("");

  const result = await fetchUrl({
    url: "https://example.com/docs",
    sourceId: "src-1",
    now: new Date("2026-06-26T12:00:00.000Z"),
    maxExtractedTextChars: 24,
    fetch: async () =>
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });

  assert.equal(result.source.id, "src-1");
  assert.equal(result.source.kind, "web");
  assert.equal(result.source.provider, "direct-fetch");
  assert.equal(result.source.trustTier, "unknown");
  assert.equal(result.source.canonicalUrl, "https://example.com/docs");
  assert.equal(result.source.title, "Example & Docs");
  assert.equal(result.source.fetchedAt, "2026-06-26T12:00:00.000Z");
  assert.match(result.source.contentHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.source.spans[0].textHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.extracted.text, "Heading\n\nReadable text &");
  assert.equal(result.extracted.truncated, true);
  assert.doesNotMatch(result.extracted.text, /secret/);
});

test("fetched title and text strip terminal control characters before rendering", async () => {
  const result = await fetchUrl({
    url: "https://example.com/control",
    sourceId: "src-1",
    fetch: async () =>
      new Response(
        [
          "<html><head><title>Bad \u001b[31m\u009b32mTitle</title></head>",
          "<body><p>Visible \u001b]0;owned\u0007\u009b31mtext.</p></body></html>",
        ].join(""),
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      ),
  });

  assert.doesNotMatch(result.source.title ?? "", /[\x00-\x1f\x7f-\x9f]/);
  assert.doesNotMatch(result.extracted.text, /[\x00-\x1f\x7f-\x9f]/);
  assert.doesNotMatch(formatFetchedUrlResult(result), /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/);
  assert.doesNotMatch(
    formatEvidenceSources([
      {
        ...result.source,
        id: "src-\u001b[31m\u009b32m1",
        title: "Poisoned \u001b[31m\u009b32mTitle",
      },
    ]),
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/,
  );
});

test("fetchUrl bounds bytes for plain text responses", async () => {
  const result = await fetchUrl({
    url: "https://example.com/plain.txt",
    sourceId: "src-1",
    maxBytes: 10,
    fetch: async () =>
      new Response("0123456789abcdef", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
  });

  assert.equal(result.returnedBytes, 10);
  assert.equal(result.truncatedBytes, true);
  assert.equal(result.extracted.text, "0123456789");
});

test("extractContent handles plain text without HTML stripping", () => {
  const result = extractContent({
    body: "Line one\n\nLine two",
    contentType: "text/plain",
  });

  assert.equal(result.title, undefined);
  assert.equal(result.text, "Line one\n\nLine two");
  assert.equal(result.truncated, false);
});

test("fetch errors are sanitized", async () => {
  try {
    await fetchUrl({
      url: "https://example.com/?token=secret-token",
      sourceId: "src-1",
      fetch: async () => {
        throw new Error(
          "failed with Bearer sk-or-v1-secret and token=secret-token at https://user:pass@example.com",
        );
      },
    });
    assert.fail("expected fetchUrl to throw");
  } catch (error) {
    const message = formatResearchFetchError(error);
    assert.doesNotMatch(message, /sk-or-v1-secret/);
    assert.doesNotMatch(message, /secret-token/);
    assert.doesNotMatch(message, /user:pass/);
    assert.match(message, /Bearer REDACTED/);
    assert.match(message, /token=REDACTED/);
  }
});
