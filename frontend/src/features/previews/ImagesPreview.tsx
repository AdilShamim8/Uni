import { useState } from 'react'
import { Download, RefreshCw, Wand2 } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { TextArea } from '@/components/ui/TextField'
import { Badge } from '@/components/ui/Tooltip'
import { SAMPLE_ARTWORKS } from '@/services/mock/previewFixtures'

type Style = 'photo' | 'illustration' | 'geometric'
type Aspect = 'square' | 'wide' | 'tall'

const ASPECT_CLASS: Record<Aspect, string> = {
  square: 'aspect-square',
  wide: 'aspect-video',
  tall: 'aspect-[3/4]',
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Images preview: prompt/options form plus an original bundled sample.
 * No image generation request is ever made.
 */
export function ImagesPreview({ brief }: { brief?: string }) {
  const closePreview = useAppStore((state) => state.closePreview)
  const [prompt, setPrompt] = useState(brief ?? '')
  const [style, setStyle] = useState<Style>('geometric')
  const [aspect, setAspect] = useState<Aspect>('square')
  const [phase, setPhase] = useState<'idle' | 'generating' | 'done'>('idle')
  const [attempt, setAttempt] = useState(0)

  const artwork =
    SAMPLE_ARTWORKS[(hashString(`${prompt}|${style}|${attempt}`) + attempt) % SAMPLE_ARTWORKS.length]

  function generate() {
    if (!prompt.trim()) return
    setPhase('generating')
    setTimeout(() => setPhase('done'), 1100)
  }

  return (
    <Dialog
      open
      onClose={closePreview}
      title="Images preview"
      description="Shows the form and an original bundled sample — no image generation occurs in this prototype."
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <TextArea
          label="Prompt"
          rows={2}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={phase === 'generating'}
          placeholder="e.g. layered hills under a ringed moon"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            ariaLabel="Style"
            value={style}
            onChange={setStyle}
            options={[
              { value: 'photo', label: 'Photo' },
              { value: 'illustration', label: 'Illustration' },
              { value: 'geometric', label: 'Geometric' },
            ]}
          />
          <Segmented
            ariaLabel="Aspect ratio"
            value={aspect}
            onChange={setAspect}
            options={[
              { value: 'square', label: 'Square' },
              { value: 'wide', label: 'Wide' },
              { value: 'tall', label: 'Tall' },
            ]}
          />
        </div>

        <Button
          variant="primary"
          className="self-start"
          disabled={!prompt.trim() || phase === 'generating'}
          onClick={generate}
        >
          <Wand2 size={14} />
          Generate (simulated)
        </Button>

        {phase === 'generating' && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-line py-10">
            <Spinner size={18} label="Preparing a bundled sample…" />
          </div>
        )}

        {phase === 'done' && (
          <figure className="flex flex-col gap-2">
            <div className={`overflow-hidden rounded-xl border border-line bg-subtle ${ASPECT_CLASS[aspect]}`}>
              <img
                src={artwork.file}
                alt={`${artwork.title} — original bundled sample artwork`}
                className="h-full w-full object-cover"
              />
            </div>
            <figcaption className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-soft">
                “{artwork.title}” — original sample artwork bundled with the app.
              </span>
              <Badge tone="warning">Simulated output</Badge>
            </figcaption>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadSample(artwork.file, artwork.title)}
              >
                <Download size={13} />
                Download sample
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAttempt((value) => value + 1)
                  setPhase('generating')
                  setTimeout(() => setPhase('done'), 700)
                }}
              >
                <RefreshCw size={13} />
                Another sample
              </Button>
            </div>
          </figure>
        )}
      </div>
    </Dialog>
  )
}

function downloadSample(file: string, title: string): void {
  const anchor = document.createElement('a')
  anchor.href = file
  anchor.download = `universe-sample-${title.toLowerCase().replace(/\s+/g, '-')}.svg`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
