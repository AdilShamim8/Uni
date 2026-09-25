.PHONY: install run test eval docker

install:
	python3 -m pip install -r requirements-dev.txt

run:
	python3 -m rewoo

test:
	python3 -m pytest -q

eval:
	python3 -m rewoo eval

docker:
	docker compose up --build
