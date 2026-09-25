# Third-party notices

ReWoo (Apache-2.0) includes, unmodified except as noted in `engines/README.md`, the complete source
trees of the following MIT-licensed projects under `engines/`. Their root license texts are reproduced
below as required by the MIT license. Nested license and notice files inside each tree (for bundled
fonts, icons, skills and third-party code — e.g. `engines/openclaw/THIRD_PARTY_NOTICES.md`) remain in
place and apply to those files.

ReWoo's own code (everything outside `engines/`) is an independent implementation. Some concepts are
adapted from these projects (see `ATTRIBUTION.md` and `RESEARCH.md`); where ReWoo mirrors an upstream
*interface* (Hermes-compatible `SKILL.md`, Paperclip's `http` adapter payload, OpenClaw's gateway API),
it does so to interoperate.

---

## Hermes Agent — `engines/hermes-agent/`

Upstream: https://github.com/NousResearch/hermes-agent (snapshot `fdec926ef54391edcf6caad5f7f6761fdcccdaa2`)

```
MIT License

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Paperclip — `engines/paperclip/`

Upstream: https://github.com/paperclipai/paperclip (snapshot `efce9356b553a08f77a5877bb0ceac68d2cc4ad8`)

```
MIT License

Copyright (c) 2025 Paperclip AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## OpenClaw — `engines/openclaw/`

Upstream: https://github.com/openclaw/openclaw (snapshot `364f1ddf3b6646a016c06fd29ddce3186a39892f`)

```
MIT License

Copyright (c) 2026 OpenClaw Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Third-party notices for incorporated or adapted code are recorded in
THIRD_PARTY_NOTICES.md.
```

---

## Web app dependencies (bundled into `rewoo/web/dist`)

Full license texts for every bundled package: `rewoo/web/dist/THIRD_PARTY_LICENSES.txt` (regenerated on each build by `web/scripts/collect-licenses.mjs`, which fails the build if a non-permissive license appears).


| Package | License |
|---|---|
| react, react-dom, scheduler, loose-envify, js-tokens | MIT |
| framer-motion, motion-dom, motion-utils | MIT |
| @remix-run/router | MIT |
| tslib | 0BSD |
| react-router-dom | MIT |
| framer-motion | MIT |
| lucide-react | ISC |

Fonts **Geist**, **Geist Mono** (SIL OFL 1.1) and **Fredoka** (SIL OFL 1.1) are loaded from Google Fonts at runtime and are not redistributed.

## Python dependencies (installed by pip, not bundled)

FastAPI (MIT), Uvicorn (BSD-3-Clause), httpx (BSD-3-Clause), Pydantic (MIT), python-multipart (Apache-2.0), pypdf (BSD-3-Clause).

## Removed upstream material

Material the upstream projects bundled without a license that allows redistribution was **removed** from
the vendored copies: commercial fonts, conference LaTeX kits and a voice sample. Details are in
`engines/README.md`.
