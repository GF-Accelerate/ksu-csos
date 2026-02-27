/**
 * Proposal Send Edge Function
 * Sends approved proposals and logs interaction
 *
 * POST /proposal_send
 * Body: {
 *   proposalId: string,
 *   deliveryMethod?: 'email' | 'pdf' | 'both' (default: 'email'),
 *   emailAddress?: string (uses constituent email if not provided),
 *   ccAddresses?: string[] (optional CC recipients),
 *   customMessage?: string (optional cover message)
 * }
 *
 * Returns:
 * - Confirmation of sent proposal
 * - Delivery details
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleCorsPreflightRequest, errorResponse, successResponse } from '../_shared/cors.ts'
import { requireAuth, requireRole, createServiceClient } from '../_shared/supabase.ts'
import { logProposalEvent } from '../_shared/audit.ts'

/**
 * Generate PDF from proposal content (stub - requires PDF generation library)
 */
async function generateProposalPDF(proposalContent: string, constituentName: string): Promise<Uint8Array> {
  // TODO: Integrate with PDF generation library
  // For now, return a simple text representation
  console.warn('PDF generation not yet implemented - returning text placeholder')

  const pdfPlaceholder = `
    =================================
    KANSAS STATE UNIVERSITY ATHLETICS
    PROPOSAL
    =================================

    To: ${constituentName}

    ${proposalContent}

    =================================
  `

  return new TextEncoder().encode(pdfPlaceholder)
}

/**
 * Send email via external email service (stub - requires email service integration)
 */
async function sendProposalEmail(
  to: string,
  cc: string[],
  subject: string,
  body: string,
  attachmentPDF?: Uint8Array
): Promise<boolean> {
  // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
  console.log(`[EMAIL STUB] Would send to: ${to}`)
  console.log(`[EMAIL STUB] CC: ${cc.join(', ')}`)
  console.log(`[EMAIL STUB] Subject: ${subject}`)
  console.log(`[EMAIL STUB] Body length: ${body.length} chars`)
  console.log(`[EMAIL STUB] Attachment: ${attachmentPDF ? 'Yes' : 'No'}`)

  // Simulate email sending
  // In production, call actual email API here
  /*
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{
        to: [{ email: to }],
        cc: cc.map(email => ({ email }))
      }],
      from: { email: 'proposals@kstatesports.com' },
      subject,
      content: [{
        type: 'text/html',
        value: body
      }],
      attachments: attachmentPDF ? [{
        content: btoa(String.fromCharCode(...attachmentPDF)),
        filename: 'proposal.pdf',
        type: 'application/pdf'
      }] : []
    })
  })

  return response.ok
  */

  return true  // Stub: always succeeds
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  try {
    // Authenticate and require appropriate role
    const { userId, supabase } = await requireAuth(req)
    await requireRole(supabase, userId, ['admin', 'executive', 'major_gifts', 'corporate', 'revenue_ops'])

    // Parse request body
    const body = await req.json()
    const {
      proposalId,
      deliveryMethod = 'email',
      emailAddress,
      ccAddresses = [],
      customMessage
    } = body

    if (!proposalId) {
      return errorResponse('Missing required field: proposalId', 400)
    }

    if (!['email', 'pdf', 'both'].includes(deliveryMethod)) {
      return errorResponse('Invalid deliveryMethod. Must be "email", "pdf", or "both"', 400)
    }

    // Use service client
    const serviceClient = createServiceClient()

    // Fetch proposal with constituent data
    const { data: proposal, error: proposalError } = await serviceClient
      .from('proposal')
      .select(`
        *,
        constituent:constituent_master (
          id,
          first_name,
          last_name,
          email,
          company_name
        ),
        opportunity:opportunity (
          id,
          type,
          amount
        )
      `)
      .eq('id', proposalId)
      .single()

    if (proposalError || !proposal) {
      return errorResponse('Proposal not found', 404)
    }

    // Check if proposal is approved
    if (proposal.status !== 'approved') {
      return errorResponse(`Proposal must be approved before sending. Current status: ${proposal.status}`, 400)
    }

    // Determine recipient email
    const recipientEmail = emailAddress || proposal.constituent.email

    if (!recipientEmail && (deliveryMethod === 'email' || deliveryMethod === 'both')) {
      return errorResponse('No email address available. Provide emailAddress or ensure constituent has email.', 400)
    }

    // Generate subject line
    const constituentName = proposal.constituent.company_name ||
      `${proposal.constituent.first_name} ${proposal.constituent.last_name}`

    const subject = proposal.type === 'corporate'
      ? `Partnership Opportunity with Kansas State Athletics - $${proposal.amount.toLocaleString()}`
      : `Giving Opportunity with Kansas State Athletics - $${proposal.amount.toLocaleString()}`

    // Build email body
    let emailBody = ''

    if (customMessage) {
      emailBody += `<p>${customMessage.replace(/\n/g, '<br>')}</p><hr>`
    }

    // Convert proposal content to HTML (basic markdown-to-HTML)
    emailBody += `<div style="font-family: Arial, sans-serif; line-height: 1.6;">`
    emailBody += proposal.content.replace(/\n/g, '<br>')
    emailBody += `</div>`

    // Add footer
    emailBody += `
      <hr>
      <p style="font-size: 12px; color: #666;">
        Kansas State University Athletics<br>
        Bramlage Coliseum<br>
        1800 College Avenue<br>
        Manhattan, KS 66502
      </p>
    `

    // Generate PDF if needed
    let pdfData: Uint8Array | undefined

    if (deliveryMethod === 'pdf' || deliveryMethod === 'both') {
      pdfData = await generateProposalPDF(proposal.content, constituentName)
    }

    // Send email if needed
    let emailSent = false

    if (deliveryMethod === 'email' || deliveryMethod === 'both') {
      emailSent = await sendProposalEmail(
        recipientEmail,
        ccAddresses,
        subject,
        emailBody,
        pdfData
      )

      if (!emailSent) {
        return errorResponse('Failed to send email', 500)
      }
    }

    // Update proposal status
    const { error: updateError } = await serviceClient
      .from('proposal')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_by: userId,
        sent_to: recipientEmail,
        delivery_method: deliveryMethod
      })
      .eq('id', proposalId)

    if (updateError) {
      throw new Error(`Failed to update proposal status: ${updateError.message}`)
    }

    // Log interaction
    await serviceClient
      .from('interaction_log')
      .insert({
        constituent_id: proposal.constituent_id,
        type: 'proposal_sent',
        occurred_at: new Date().toISOString(),
        notes: `${proposal.type} proposal sent via ${deliveryMethod} for $${proposal.amount}`,
        user_id: userId
      })

    // Log to audit trail
    await logProposalEvent(serviceClient, {
      proposalId,
      action: 'sent',
      userId,
      amount: proposal.amount
    })

    // Create follow-up task
    const followUpDate = new Date()
    followUpDate.setDate(followUpDate.getDate() + 7)  // Follow up in 7 days

    await serviceClient
      .from('task_work_item')
      .insert({
        type: 'follow_up',
        constituent_id: proposal.constituent_id,
        opportunity_id: proposal.opportunity_id,
        assigned_role: proposal.opportunity.type === 'corporate' ? 'corporate' : 'major_gifts',
        priority: 'medium',
        status: 'pending',
        due_at: followUpDate.toISOString(),
        notes: `Follow up on sent proposal ($${proposal.amount})`
      })

    return successResponse({
      proposal: {
        id: proposalId,
        status: 'sent',
        sent_to: recipientEmail,
        delivery_method: deliveryMethod,
        sent_at: new Date().toISOString()
      },
      message: `Proposal sent successfully via ${deliveryMethod}. Follow-up task created for 7 days.`
    })

  } catch (error) {
    console.error('Proposal send error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
