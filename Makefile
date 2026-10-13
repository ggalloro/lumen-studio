SHELL := /bin/bash
PY := .venv/bin/python
SERVICES := identity assets renditions review brand-check campaigns rights studio-web
# rights builds and runs on Java 11. Defaults to the distro JDK (amd64 or arm64); override
# with the path to a local Java 11 JDK.
JAVA11_HOME ?= $(firstword $(wildcard /usr/lib/jvm/java-11-openjdk-*))
export JAVA11_HOME

.PHONY: help setup build dev seed reset test test-python test-assets test-renditions test-review test-rights test-web up down

help:
	@echo "make setup   install toolchain dependencies for every service"
	@echo "make dev     run all services locally (Procfile.dev)"
	@echo "make seed    load the Northwind Outdoor data into a running stack"
	@echo "make reset   delete local service data (stop the stack first)"
	@echo "make test    run every service's unit tests"
	@echo "make up      docker compose up --build -d"
	@echo "make down    docker compose down"

setup:
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements-dev.txt
	cd review && npm ci
	cd studio-web && npm ci
	cd renditions && go mod download
	$(MAKE) build

build:
	cd assets && ./mvnw -q -DskipTests package
	cd rights && JAVA_HOME=$(JAVA11_HOME) ./mvnw -q -DskipTests package

dev:
	@test -f assets/target/assets.jar -a -f rights/target/rights.jar || $(MAKE) build
	.venv/bin/honcho -f Procfile.dev start

seed:
	$(PY) seed.py

reset:
	rm -rf identity/data assets/data review/data brand-check/data campaigns/data rights/data

test: test-python test-assets test-renditions test-review test-rights test-web

test-python:
	cd identity && ../$(PY) -m pytest -q
	cd brand-check && ../$(PY) -m pytest -q
	cd campaigns && ../$(PY) -m pytest -q

test-assets:
	cd assets && ./mvnw -q test

test-renditions:
	cd renditions && go test ./...

test-review:
	cd review && npm test

test-rights:
	cd rights && JAVA_HOME=$(JAVA11_HOME) ./mvnw -q test

test-web:
	cd studio-web && npm test

up:
	docker compose up --build -d

down:
	docker compose down
