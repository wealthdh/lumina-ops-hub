import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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

  try {
    const { data: products, error } = await supabase
      .from('stripe_products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (products || []).map((p) => ({
      id: p.id,
      name: p.product_name,
      price_cents: p.price_cents,
      price_dollars: (p.price_cents / 100).toFixed(2),
      payment_url: p.payment_url,
      stripe_product_id: p.stripe_product_id,
      status: p.status,
      created_at: p.created_at,
    }));

    return res.status(200).json({
      success: true,
      products: formatted,
      count: formatted.length,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({
      error: 'Failed to fetch products',
      details: error.message,
    });
  }
}
