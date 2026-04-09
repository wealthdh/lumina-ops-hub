import { createClient } from '@supabase/supabase-js';

const log = (level, msg, data) => {
  const ts = new Date().toISOString();
  console[level](`[STRIPE][${ts}] ${msg}`, data ? JSON.stringify(data) : '');
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Missing Supabase env vars', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
    return res.status(500).json({ error: 'Supabase not configured on server' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    log('info', 'Fetching active products');

    const { data: products, error } = await supabase
      .from('stripe_products')
      .select('id, product_name, payment_url, price_cents, status, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedProducts = products.map((product) => ({
      ...product,
      price_dollars: (product.price_cents / 100).toFixed(2),
    }));

    log('info', 'Products fetched', { count: formattedProducts.length });

    return res.status(200).json({
      success: true,
      products: formattedProducts,
    });
  } catch (error) {
    log('error', 'Failed to fetch products', { error: error.message });
    return res.status(500).json({
      error: 'Failed to fetch products',
      details: error.message,
    });
  }
}
