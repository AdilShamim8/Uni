# Reference voice removed

Upstream Hermes Agent shipped a reference recording (`jo.wav` + `jo.txt`) taken from Neuphonic's
NeuTTS samples. That repository is now under the custom "NeuTTS Open License v1.0", and the file is a
recording of a real person's voice. ReWoo's vendored copy does **not** redistribute it.

To use Hermes' local NeuTTS voice cloning, record a short clip of **your own voice** (or one you have
written consent for), save it here as `jo.wav` with its transcript in `jo.txt`, or set `ref_audio` /
`ref_text` in your Hermes TTS config. The official NeuTTS samples are available from
https://github.com/neuphonic/neutts under Neuphonic's terms.
