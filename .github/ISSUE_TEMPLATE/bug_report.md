---
name: Bug report
about: Something is broken or behaving incorrectly
labels: bug
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear description of the bug. Include the browser and how you're running ReWoo (Vercel, Docker, local dev).
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Sign in
        2. Add an OpenAI credential
        3. …
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect?
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Relevant logs or errors
      description: Never paste API keys or full credentials. Masked previews (sk-a•••wxyz) are fine.
      render: shell
  - type: input
    id: version
    attributes:
      label: ReWoo version / commit
      placeholder: v0.3.0 or commit SHA
