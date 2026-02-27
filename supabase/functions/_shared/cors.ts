/**
 * CORS Utilities for KSU CSOS Edge Functions
 * Provides consistent CORS headers across all Edge Functions
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleCorsPreflightRequest(): Response {
  return new Response('ok', {
    headers: corsHeaders,
    status: 200
  })
}

/**
 * Create a JSON response with CORS headers
 */
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  )
}

/**
 * Create an error response with CORS headers
 */
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse(
    { error: message },
    status
  )
}

/**
 * Create a success response with CORS headers
 */
export function successResponse(data: unknown, message?: string): Response {
  return jsonResponse({
    success: true,
    ...(message && { message }),
    data,
  })
}
