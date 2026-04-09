/**
 * generate-lead-package — Lumina Ops Hub Edge Function
 *
 * Creates a real Stripe invoice + payment link, generates a proposal HTML,
 * and saves document URLs back to the leads table.
 *
 * POST body: { leadId: string }
 *
 * Returns: { proposalUrl, contractUrl, invoiceUrl, invoiceId, paymentLink }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    // Gateway validates Authorization (anon key or legacy JWT).
    // User identity comes from X-User-JWT (actual GoTrue access_token).
    // Falls back to Authorization for backward-compatibility.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Accept user JWT from X-User-JWT header (preferred) or Authorization header
    const userJwtHeader = req.headers.get('X-User-JWT')
    const userToken = userJwtHeader
      ? userJwtHeader.replace('Bearer ', '')
      : authHeader.replace('Bearer ', '')

    // Verify the user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token', detail: authError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const { leadId } = await req.json() as { leadId: string }
    if (!leadId) {
      return new Response(JSON.stringify({ error: 'leadId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch lead from DB ────────────────────────────────────────────────────
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single()

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Generate Proposal HTML ────────────────────────────────────────────────
    const proposalHtml = generateProposalHtml(lead, user)

    // Store proposal in Supabase Storage
    const proposalPath = `proposals/${user.id}/${leadId}-proposal.html`
    const { error: storageError } = await supabase.storage
      .from('lead-documents')
      .upload(proposalPath, proposalHtml, {
        contentType: 'text/html',
        upsert: true,
      })

    let proposalUrl = null
    if (!storageError) {
      const { data: { publicUrl } } = supabase.storage
        .from('lead-documents')
        .getPublicUrl(proposalPath)
      proposalUrl = publicUrl
    }

    // ── Create Stripe Invoice (if key is configured) ──────────────────────────
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    let invoiceUrl    = null
    let paymentLink   = null
    let stripeInvoiceId = null

    if (stripeKey && !stripeKey.includes('sk_live_...') && !stripeKey.includes('your_')) {
      const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' })

      // 1. Find or create a Stripe customer for this lead
      let customerId: string | null = null
      const existing = await stripe.customers.list({ email: lead.email, limit: 1 })
      if (existing.data.length > 0) {
        customerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email:    lead.email,
          name:     lead.name,
          metadata: { lead_id: leadId, source: lead.source ?? 'lumina-funnel' },
        })
        customerId = customer.id
      }

      // 2. Create invoice with line items
      const invoice = await stripe.invoices.create({
        customer:                customerId,
        collection_method:       'send_invoice',
        days_until_due:          14,
        auto_advance:            false,
        description:             `AI Services — ${lead.company ?? lead.name}`,
        footer:                  'Lumina AI Operations Hub | Powered by LuminaPulse',
        metadata:                { lead_id: leadId, lumina_user: user.id },
      })

      // 3. Add a line item
      await stripe.invoiceItems.create({
        customer:   customerId,
        invoice:    invoice.id,
        amount:     Math.round(lead.estimated_value * 100), // cents
        currency:   'usd',
        description: `AI Strategy & Implementation Package — ${lead.company ?? lead.name}`,
      })

      // 4. Finalize (makes it sendable)
      const finalInvoice = await stripe.invoices.finalizeInvoice(invoice.id)

      // 5. Send to customer's email
      await stripe.invoices.sendInvoice(finalInvoice.id)

      invoiceUrl     = finalInvoice.hosted_invoice_url ?? null
      paymentLink    = finalInvoice.payment_intent     ?? null
      stripeInvoiceId = finalInvoice.id

    } else {
      // No Stripe key — generate a placeholder invoice link
      invoiceUrl = proposalUrl  // point to the proposal as a fallback
      console.warn('[generate-lead-package] Stripe key not configured — skipping real invoice')
    }

    // ── Generate Contract placeholder ─────────────────────────────────────────
    const contractHtml = generateContractHtml(lead, user)
    const contractPath = `contracts/${user.id}/${leadId}-contract.html`
    const { error: contractStorageError } = await supabase.storage
      .from('lead-documents')
      .upload(contractPath, contractHtml, { contentType: 'text/html', upsert: true })

    let contractUrl = null
    if (!contractStorageError) {
      const { data: { publicUrl } } = supabase.storage
        .from('lead-documents')
        .getPublicUrl(contractPath)
      contractUrl = publicUrl
    }

    // ── Update lead record with document URLs ─────────────────────────────────
    const updateData: Record<string, unknown> = {
      stage:       'proposal',
      last_contact: new Date().toISOString(),
    }
    if (proposalUrl)  updateData.proposal_url = proposalUrl
    if (contractUrl)  updateData.contract_url = contractUrl
    if (invoiceUrl)   updateData.invoice_url  = invoiceUrl

    await supabase.from('leads').update(updateData).eq('id', leadId)

    // ── Return result ──────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success:      true,
        proposalUrl,
        contractUrl,
        invoiceUrl,
        paymentLink,
        stripeInvoiceId,
        message:      stripeKey && !stripeKey.includes('...')
          ? `Invoice sent to ${lead.email} via Stripe`
          : `Proposal generated. Add STRIPE_SECRET_KEY to send real invoices.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('[generate-lead-package] error:', err)
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

// ─── Proposal HTML template ───────────────────────────────────────────────────

function generateProposalHtml(lead: Record<string, unknown>, user: Record<string, unknown>): string {
  const today    = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const dueDate  = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const value    = Number(lead.estimated_value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Proposal — ${lead.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #f8fafc; }
    .header { background: linear-gradient(135deg, #0a0d14, #141927); color: #fff; padding: 48px; }
    .header h1 { font-size: 2rem; color: #00f5d4; margin-bottom: 8px; }
    .header p  { color: #8892a4; font-size: 0.95rem; }
    .content   { max-width: 800px; margin: 0 auto; padding: 48px; }
    .section   { margin-bottom: 36px; }
    h2         { font-size: 1.2rem; color: #0a0d14; border-bottom: 2px solid #00f5d4; padding-bottom: 8px; margin-bottom: 16px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f1f5f9; padding: 20px; border-radius: 8px; }
    .meta-item label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .meta-item value { display: block; font-size: 1rem; font-weight: 600; color: #0f172a; margin-top: 2px; }
    .deliverables li { padding: 8px 0; border-bottom: 1px solid #e2e8f0; display: flex; gap: 12px; }
    .deliverables li:last-child { border-bottom: none; }
    .check { color: #00f5d4; font-weight: bold; }
    .price-box { background: #0a0d14; color: #fff; padding: 24px; border-radius: 12px; text-align: center; }
    .price-box .amount { font-size: 2.5rem; font-weight: 700; color: #00f5d4; font-family: monospace; }
    .price-box .label  { color: #8892a4; font-size: 0.85rem; margin-top: 4px; }
    .footer { text-align: center; padding: 32px; color: #64748b; font-size: 0.8rem; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚡ Lumina AI Operations</h1>
    <p>AI Strategy &amp; Implementation Proposal</p>
  </div>
  <div class="content">
    <div class="section">
      <div class="meta-grid">
        <div class="meta-item"><label>Prepared For</label><value>${lead.name}</value></div>
        <div class="meta-item"><label>Company</label><value>${lead.company ?? lead.name}</value></div>
        <div class="meta-item"><label>Date</label><value>${today}</value></div>
        <div class="meta-item"><label>Valid Until</label><value>${dueDate}</value></div>
      </div>
    </div>

    <div class="section">
      <h2>Executive Summary</h2>
      <p style="line-height: 1.7; color: #334155;">
        We've analyzed ${lead.company ?? 'your company'}'s operational landscape and identified high-impact AI automation opportunities.
        Our proposal outlines a comprehensive strategy to deploy AI-powered revenue streams, reduce operational costs,
        and create compounding growth through intelligent automation.
      </p>
    </div>

    <div class="section">
      <h2>Deliverables</h2>
      <ul class="deliverables" style="list-style: none;">
        <li><span class="check">✓</span> AI Revenue Automation Setup (10-stream framework)</li>
        <li><span class="check">✓</span> Custom MT5 Strategy Integration</li>
        <li><span class="check">✓</span> Lead-to-Cash Funnel Deployment</li>
        <li><span class="check">✓</span> UGC Content Factory Configuration</li>
        <li><span class="check">✓</span> 30-Day Monte Carlo Portfolio Model</li>
        <li><span class="check">✓</span> Tax Optimization & Auto-Vault Setup</li>
        <li><span class="check">✓</span> 90-Day Success Guarantee</li>
      </ul>
    </div>

    <div class="section">
      <h2>Investment</h2>
      <div class="price-box">
        <div class="amount">${value}</div>
        <div class="label">One-time setup fee · Payment due within 14 days</div>
      </div>
    </div>

    <div class="section">
      <h2>Next Steps</h2>
      <p style="line-height: 1.7; color: #334155;">
        1. Review this proposal<br/>
        2. Complete the attached invoice to reserve your implementation slot<br/>
        3. Onboarding call scheduled within 24 hours of payment<br/>
        4. Full deployment begins immediately
      </p>
    </div>
  </div>
  <div class="footer">
    Generated by Lumina Ops Hub · ${today} · For questions: reply to this email
  </div>
</body>
</html>`
}

// ─── Contract HTML template ───────────────────────────────────────────────────

function generateContractHtml(lead: Record<string, unknown>, _user: Record<string, unknown>): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const value = Number(lead.estimated_value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Service Agreement — ${lead.name}</title>
  <style>
    body { font-family: 'Times New Roman', serif; max-width: 700px; margin: 40px auto; padding: 40px; color: #1a1a1a; line-height: 1.8; }
    h1   { text-align: center; font-size: 1.4rem; margin-bottom: 8px; }
    h2   { font-size: 1rem; margin-top: 24px; }
    .signature-block { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
    .sig-line { border-top: 1px solid #000; padding-top: 4px; font-size: 0.85rem; color: #444; }
  </style>
</head>
<body>
  <h1>AI SERVICES AGREEMENT</h1>
  <p style="text-align:center; color:#666; font-size:0.9rem;">Effective Date: ${today}</p>

  <h2>1. Parties</h2>
  <p>This Agreement is between <strong>Lumina AI Operations</strong> ("Service Provider") and
  <strong>${lead.company ?? lead.name}</strong> ("Client").</p>

  <h2>2. Services</h2>
  <p>Service Provider agrees to deliver AI revenue automation, implementation, and strategy services
  as outlined in the accompanying Proposal document.</p>

  <h2>3. Payment</h2>
  <p>Client agrees to pay <strong>${value}</strong> within 14 days of this agreement.
  Payment shall be made via the provided Stripe invoice link.</p>

  <h2>4. Deliverables &amp; Timeline</h2>
  <p>All deliverables will be completed within 30 business days of payment receipt.
  Client will receive regular progress updates via email.</p>

  <h2>5. Confidentiality</h2>
  <p>Both parties agree to keep all proprietary information confidential for a period of 2 years
  following the termination of this agreement.</p>

  <h2>6. Satisfaction Guarantee</h2>
  <p>If Client is not satisfied with the implementation within 90 days, Service Provider will
  provide additional revisions at no additional charge.</p>

  <div class="signature-block">
    <div>
      <div class="sig-line">Service Provider Signature</div>
      <p>Lumina AI Operations</p>
    </div>
    <div>
      <div class="sig-line">Client Signature</div>
      <p>${lead.name}</p>
    </div>
  </div>
</body>
</html>`
}
