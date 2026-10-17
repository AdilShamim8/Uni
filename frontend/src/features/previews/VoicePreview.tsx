import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, PhoneOff } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Tooltip'
import { VOICE_TRANSCRIPT } from '@/services/mock/previewFixtures'

/**
 * Voice preview: a call-state dialog with local controls and a sample
 * transcript. No microphone or camera access is requested or used.
 */
export function VoicePreview({ brief }: { brief?: string }) {
  const closePreview = useAppStore((state) => state.closePreview)
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'active'>('idle')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [linesShown, setLinesShown] = useState(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'active') return
    const interval = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(interval)
  }, [phase])

  useEffect(() => {
    if (phase !== 'active') return
    if (linesShown >= VOICE_TRANSCRIPT.length) return
    const timer = setTimeout(() => setLinesShown((value) => value + 1), 1700)
    timersRef.current.push(timer)
    return () => clearTimeout(timer)
  }, [phase, linesShown])

  function start() {
    setPhase('connecting')
    setElapsed(0)
    setLinesShown(0)
    const timer = setTimeout(() => setPhase('active'), 900)
    timersRef.current.push(timer)
  }

  function end() {
    setPhase('idle')
    setMuted(false)
    setElapsed(0)
    setLinesShown(0)
  }

  const minutes = Math.floor(elapsed / 60)
  const seconds = String(elapsed % 60).padStart(2, '0')

  return (
    <Dialog
      open
      onClose={() => {
        end()
        closePreview()
      }}
      title="Voice preview"
      description="Call states and a sample transcript — your microphone is never accessed."
      size="sm"
    >
      <div className="flex flex-col items-center gap-5 py-2">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full transition-colors ${
            phase === 'active'
              ? muted
                ? 'bg-line-strong text-ink-soft'
                : 'bg-accent text-ink-inverse'
              : 'bg-subtle text-ink-soft'
          } ${phase === 'active' && !muted ? 'animate-pulse' : ''}`}
        >
          {phase === 'active' && muted ? <MicOff size={34} /> : <Mic size={34} />}
        </div>

        <p aria-live="polite" className="text-sm font-medium text-ink">
          {phase === 'idle' && 'Ready to start a sample session'}
          {phase === 'connecting' && 'Connecting (simulated)…'}
          {phase === 'active' && `${muted ? 'Muted' : 'Listening'} · ${minutes}:${seconds}`}
        </p>

        {phase !== 'idle' && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMuted((value) => !value)}>
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="danger" size="sm" onClick={end}>
              <PhoneOff size={14} />
              End session
            </Button>
          </div>
        )}

        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-3">
            {brief?.trim() && (
              <p className="max-w-xs text-center text-xs leading-relaxed text-ink-soft">
                Carried topic: “{brief.trim()}”
              </p>
            )}
            <Button variant="primary" onClick={start}>
              <Mic size={14} />
              Start sample session
            </Button>
          </div>
        )}

        {phase === 'active' && (
          <div className="w-full" aria-label="Sample transcript">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Sample transcript
            </p>
            <ul className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-xl border border-line bg-raised p-3">
              {VOICE_TRANSCRIPT.slice(0, linesShown).map((line, index) => (
                <li key={index} className="text-sm leading-relaxed">
                  <span
                    className={`mr-1.5 text-xs font-semibold ${
                      line.speaker === 'you' ? 'text-accent' : 'text-ink-faint'
                    }`}
                  >
                    {line.speaker === 'you' ? 'You' : 'Universe'}:
                  </span>
                  <span className="text-ink">{line.text}</span>
                </li>
              ))}
              {linesShown < VOICE_TRANSCRIPT.length && (
                <li className="text-xs italic text-ink-faint">…</li>
              )}
            </ul>
          </div>
        )}

        <Badge tone="warning">Simulated — no microphone or network access</Badge>
      </div>
    </Dialog>
  )
}
