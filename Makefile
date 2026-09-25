.PHONY: install run test eval web web-dev docker engines

install:          ## Python deps (the web app is prebuilt)
	python3 -m pip install -r requirements-dev.txt

run:              ## Start ReWoo on http://localhost:8787
	python3 -m rewoo

test:             ## Backend tests
	python3 -m pytest -q

eval:             ## Behaviour scenarios
	python3 -m rewoo eval

web:              ## Rebuild the web app into rewoo/web/dist
	cd web && npm install && npm run build

web-dev:          ## Hot-reload UI on :5173 (run `make run` in another terminal)
	cd web && npm install && npm run dev

docker:
	docker compose up --build

engines:          ## ReWoo + Paperclip + Hermes Agent
	docker compose --profile engines up --build
