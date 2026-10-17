import { useAppStore } from '@/state/store'
import { AssistantPresetsPreview } from './AssistantPresetsPreview'
import { CanvasPreview } from './CanvasPreview'
import { ComingSoonPreview } from './ComingSoonPreview'
import { DataAnalysisPreview } from './DataAnalysisPreview'
import { ImagesPreview } from './ImagesPreview'
import { ResearchPreview } from './ResearchPreview'
import { VoicePreview } from './VoicePreview'

/** Renders the currently open preview, if any. */
export function PreviewHost() {
  const preview = useAppStore((state) => state.ui.preview)
  if (!preview) return null

  switch (preview.kind) {
    case 'research':
      return <ResearchPreview brief={preview.brief} />
    case 'images':
      return <ImagesPreview brief={preview.brief} />
    case 'voice':
      return <VoicePreview brief={preview.brief} />
    case 'canvas':
      return <CanvasPreview brief={preview.brief} />
    case 'data':
      return <DataAnalysisPreview />
    case 'presets':
      return <AssistantPresetsPreview />
    default:
      return <ComingSoonPreview kind={preview.kind} />
  }
}
