# Contributing to ReWoo

Thanks for helping! ReWoo aims to be the friendliest open-source personal AI helper, and also one of the most readable codebases in the space.

## Setup

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m rewoo              # app on http://localhost:8787
python3 -m pytest -q          # tests (offline)
python3 -m rewoo eval         # behaviour scenarios
```

The web app is plain HTML/CSS/JS in `rewoo/web/`. Edit and refresh, with no build step.

## Design rules

1. **Explainable to a non-technical person.** If a feature needs AI jargon to use, redesign it.
2. **Personal data is always visible.** Anything that puts user data in a prompt must appear in the context receipt.
3. **Consent before consequence.** New tools must declare an honest risk level.
4. **Model-agnostic.** No feature may depend on one vendor's special API. Use the JSON protocol.
5. **Readable over clever.** Small modules, docstrings that explain *why*.

## Pull requests

- Add or adjust tests, and an eval scenario if you change agent behaviour.
- Keep dependencies minimal. Every new dependency needs a reason.
- Don't copy code, assets or UI from other projects. Independent implementations of ideas are welcome, so credit them in `ATTRIBUTION.md`.

By contributing, you agree your contributions are licensed under Apache-2.0.
