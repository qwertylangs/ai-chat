.PHONY: help install hooks dev api front lint test build prod clean

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'

install: hooks ## Поставить зависимости бэка и фронта
	cd api && uv sync
	cd front && npm install

hooks: ## Включить git pre-commit хук (.githooks)
	git config core.hooksPath .githooks

dev: ## Всё вместе: бэк :8000 + фронт :5173
	$(MAKE) -j2 api front

api: ## Только бэкенд (:8000, reload)
	cd api && uv run uvicorn app.main:app --reload --port 8000

front: ## Только фронтенд (:5173, Vite dev)
	cd front && npm run dev

lint: ## eslint по фронту
	cd front && npm run lint

test: ## unit-тесты фронта + pytest бэкенда
	cd front && npm test -- --run
	cd api && uv run pytest -q

build: ## Собрать фронт в front/dist
	cd front && npm run build

prod: build ## Собранный фронт отдаёт сам бэкенд (:8000)
	cd api && uv run uvicorn app.main:app --port 8000

clean: ## Удалить сборку фронта
	rm -rf front/dist
