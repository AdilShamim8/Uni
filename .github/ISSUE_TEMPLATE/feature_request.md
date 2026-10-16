---
name: Feature request
about: Suggest a feature or improvement
labels: enhancement
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem would this solve?
      description: Describe the outcome you want, not just the mechanism. Roadmap: agents, research, knowledge, skills, automations (see docs/DECISIONS.md).
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: What would it look like?
