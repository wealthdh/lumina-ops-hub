// Stripe Payment Links API - creates products + payment URLs
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const products = [
  {
    name: 'MT5 Gold Scalper EA',
    price: 9700,
    description: 'Professional MT5 Expert Advisor for gold scalping with Kelly criterion sizing',
  },
  {
    name: 'Polymarket Edge Scanner',
    price: 4700,
    description: 'AI-powered scanner for high-edge prediction market opportunities',
  },
  {
    name: 'AI Prompt Engineering Toolkit',
    price: 2900,
    description: '200+ tested prompts for trading, content creation, and automation',
  },
  {
    name: 'Content Swarm Templates',
    price: 1900,
    description: 'Ready-to-deploy templates for multi-platform content distribution',
  },
  {
    name: 'Kelly Calculator Pro',
    price: 1499,
    description: 'Advanced position sizing calculator with Monte Carlo simulation',
  },
];

export default async function handler(req, res) {
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = [];

    for (const product of products) {
      const { data: existing } = await supabase
        .from('stripe_products')
        .select('*')
        .eq('product_name', product.name)
        .single();

      if (existing) {
        results.push({
          product_name: product.name,
          payment_url: existing.payment_url,
          status: 'already_exists',
        });
        continue;
      }

      const stripeProduct = await stripe.products.create({
        name: product.name,
        description: product.description,
        metadata: { internal_product_name: product.name },
      });

      const price = await stripe.prices.create({
        product: stripeProduct.id,
        unit_amount: product.price,
        currency: 'usd',
      });

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
      });

      const { error } = await supabase.from('stripe_products').insert({
        product_name: product.name,
        stripe_product_id: stripeProduct.id,
        stripe_price_id: price.id,
        stripe_payment_link_id: paymentLink.id,
        payment_url: paymentLink.url,
        price_cents: product.price,
        status: 'active',
      });

      if (error) throw error;

      results.push({
        product_name: product.name,
        payment_url: paymentLink.url,
        status: 'created',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment links created successfully',
      products: results,
    });
  } catch (error) {
    console.error('Error creating payment links:', error);
    return res.status(500).json({
      error: 'Failed to create payment links',
      details: error.message,
    });
  }
}
