/**
 * Voice Service
 *
 * API service layer for voice command processing.
 */

import { callEdgeFunction } from '@lib/supabase'
import type {
  VoiceCommandRequest,
  VoiceCommandResponse,
} from '@/types'

/**
 * Process voice command transcript
 */
export async function processVoiceCommand(
  transcript: string
): Promise<VoiceCommandResponse> {
  const request: VoiceCommandRequest = {
    transcript,
  }

  return callEdgeFunction<VoiceCommandResponse>('voice_command', request)
}

/**
 * Browser Speech Recognition API wrapper
 */
export class VoiceRecognition {
  private recognition: any = null
  private isListening = false
  private onResultCallback: ((transcript: string) => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null

  constructor() {
    if (typeof window === 'undefined') {
      return
    }

    // Check for browser support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not supported in this browser')
      return
    }

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = false
    this.recognition.interimResults = false
    this.recognition.lang = 'en-US'

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (this.onResultCallback) {
        this.onResultCallback(transcript)
      }
    }

    this.recognition.onerror = (event: any) => {
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error)
      }
    }

    this.recognition.onend = () => {
      this.isListening = false
    }
  }

  /**
   * Check if Speech Recognition is supported
   */
  isSupported(): boolean {
    return this.recognition !== null
  }

  /**
   * Start listening
   */
  start(
    onResult: (transcript: string) => void,
    onError?: (error: string) => void
  ): void {
    if (!this.recognition) {
      if (onError) {
        onError('Speech Recognition not supported')
      }
      return
    }

    if (this.isListening) {
      console.warn('Already listening')
      return
    }

    this.onResultCallback = onResult
    this.onErrorCallback = onError || null

    this.recognition.start()
    this.isListening = true
  }

  /**
   * Stop listening
   */
  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop()
      this.isListening = false
    }
  }

  /**
   * Get listening status
   */
  getIsListening(): boolean {
    return this.isListening
  }
}

/**
 * Common voice commands (for autocomplete/suggestions)
 */
export const COMMON_VOICE_COMMANDS = [
  // Dashboard queries
  'Show me the executive dashboard',
  'What\'s in the pipeline?',
  'Show me renewal risks',
  'Show me ask-ready prospects',

  // Constituent queries
  'Find John Smith',
  'Show me top donors',
  'Show me ticket holders',
  'Show me corporate partners',

  // Opportunity queries
  'Show me active opportunities',
  'Show me major gift opportunities',
  'Show me ticketing opportunities',
  'What\'s my pipeline?',

  // Proposal queries
  'Show me pending proposals',
  'Show me my proposals',
  'Generate proposal for John Smith',

  // Work queue queries
  'What\'s in my queue?',
  'Show me my tasks',
  'Show me overdue tasks',

  // Score queries
  'Show me high renewal risks',
  'Show me ask-ready constituents',
  'Show me top capacity prospects',

  // Actions
  'Create new opportunity',
  'Approve proposal',
  'Send proposal',
  'Complete task',
]

/**
 * Parse intent from transcript (client-side fallback)
 */
export function parseIntent(transcript: string): {
  intent: string
  action: string
  parameters: Record<string, any>
} {
  const lower = transcript.toLowerCase()

  // Dashboard intents
  if (lower.includes('dashboard')) {
    return {
      intent: 'view_dashboard',
      action: 'navigate',
      parameters: { route: '/dashboard' },
    }
  }

  if (lower.includes('pipeline')) {
    return {
      intent: 'view_pipeline',
      action: 'query',
      parameters: { type: 'all' },
    }
  }

  if (lower.includes('renewal risk')) {
    return {
      intent: 'view_renewal_risks',
      action: 'query',
      parameters: { risk: 'high' },
    }
  }

  if (lower.includes('ask ready') || lower.includes('ask-ready')) {
    return {
      intent: 'view_ask_ready',
      action: 'query',
      parameters: {},
    }
  }

  // Constituent intents
  if (lower.includes('find') || lower.includes('search')) {
    const nameMatch = lower.match(/(?:find|search)\s+(.+)/)
    return {
      intent: 'search_constituent',
      action: 'search',
      parameters: { query: nameMatch?.[1] || '' },
    }
  }

  if (lower.includes('donor')) {
    return {
      intent: 'view_donors',
      action: 'navigate',
      parameters: { route: '/major-gifts' },
    }
  }

  if (lower.includes('ticket')) {
    return {
      intent: 'view_ticketing',
      action: 'navigate',
      parameters: { route: '/ticketing' },
    }
  }

  if (lower.includes('corporate')) {
    return {
      intent: 'view_corporate',
      action: 'navigate',
      parameters: { route: '/corporate' },
    }
  }

  // Proposal intents
  if (lower.includes('proposal')) {
    if (lower.includes('generate') || lower.includes('create')) {
      return {
        intent: 'generate_proposal',
        action: 'create',
        parameters: {},
      }
    }

    if (lower.includes('approve')) {
      return {
        intent: 'approve_proposal',
        action: 'approve',
        parameters: {},
      }
    }

    if (lower.includes('send')) {
      return {
        intent: 'send_proposal',
        action: 'send',
        parameters: {},
      }
    }

    return {
      intent: 'view_proposals',
      action: 'navigate',
      parameters: { route: '/proposals' },
    }
  }

  // Work queue intents
  if (lower.includes('queue') || lower.includes('task')) {
    return {
      intent: 'view_work_queue',
      action: 'query',
      parameters: {},
    }
  }

  // Default: unknown intent
  return {
    intent: 'unknown',
    action: 'none',
    parameters: { transcript },
  }
}
