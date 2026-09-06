.PHONY: help install dev api front build prod clean

help:
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*##/\t/'

install: ## Поставить зависимости бэка и фронта
	cd api && uv sync
	cd front && npm install

dev: ## Всё вместе: бэк :8000 + фронт :5173
	$(MAKE) -j2 api front

api: ## Только бэкенд (:8000, reload)
	cd api && uv run uvicorn app.main:app --reload --port 8000

front: ## Только фронтенд (:5173, Vite dev)
	cd front && npm run dev

build: ## Собрать фронт в front/dist
	cd front && npm run build

prod: build ## Собранный фронт отдаёт сам бэкенд (:8000)
	cd api && uv run uvicorn app.main:app --port 8000

clean: ## Удалить сборку фронта
	rm -rf front/dist
