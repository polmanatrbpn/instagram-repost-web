// Cloudflare Worker: _worker.js
// Handles /api/fetch for Instagram extraction and serves static assets

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route: /api/proxy (Image proxy to prevent CORS issues)
    if (url.pathname === '/api/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url query parameter', { status: 400 });
      try {
        const resp = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        });
        return new Response(resp.body, {
          status: resp.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': resp.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=86400'
          }
        });
      } catch (err) {
        return new Response('Proxy error: ' + err.message, { status: 500 });
      }
    }

    // Route: /api/fetch
    if (url.pathname === '/api/fetch') {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }

      if (request.method === 'POST' || request.method === 'GET') {
        return handleInstagramFetch(request);
      }
    }

    // Default: serve static assets if available
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleInstagramFetch(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const reqUrl = new URL(request.url);
    let rawUrl = '';
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      rawUrl = (body.url || '').trim();
    } else {
      rawUrl = (reqUrl.searchParams.get('url') || '').trim();
    }

    if (!rawUrl) {
      return new Response(JSON.stringify({ error: 'URL Instagram wajib diisi.' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const match = rawUrl.match(/instagram\.com\/(?:p|reel|tv)\/([^/?#&]+)/);
    const shortcode = match ? match[1] : rawUrl;

    if (!shortcode || shortcode.length < 3) {
      return new Response(JSON.stringify({ error: 'Format link Instagram tidak valid.' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // Query Instagram GraphQL doc_id endpoint with GET
    const variables = JSON.stringify({
      shortcode: shortcode,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false
    });

    const igUrl = `https://www.instagram.com/graphql/query/?doc_id=27128499623469141&variables=${encodeURIComponent(variables)}`;

    const igResp = await fetch(igUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-IG-App-ID': '936619743392459',
        'Accept': '*/*'
      }
    });

    if (!igResp.ok) {
      throw new Error(`Instagram server merespons dengan status ${igResp.status}`);
    }

    const data = await igResp.json();
    const webInfo = data?.data?.xdt_api__v1__media__shortcode__web_info || {};
    const items = webInfo.items || [];

    if (!items.length) {
      throw new Error('Postingan tidak ditemukan atau akun bersifat privat.');
    }

    const item = items[0];
    const author = item.user?.username || 'instagram_user';
    const authorFullName = item.user?.full_name || author;
    const caption = item.caption?.text || '';

    const imageUrls = [];
    if (item.carousel_media && item.carousel_media.length > 0) {
      for (const cm of item.carousel_media) {
        const candidates = cm.image_versions2?.candidates || [];
        if (candidates.length > 0) {
          imageUrls.push(candidates[0].url);
        }
      }
    } else if (item.image_versions2?.candidates?.length > 0) {
      imageUrls.push(item.image_versions2.candidates[0].url);
    }

    if (!imageUrls.length) {
      throw new Error('Tidak ditemukan gambar dalam postingan ini.');
    }

    return new Response(JSON.stringify({
      success: true,
      shortcode: shortcode,
      author: author,
      author_full_name: authorFullName,
      caption: caption,
      images: imageUrls
    }), {
      status: 200,
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message || 'Gagal memproses postingan Instagram.'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
