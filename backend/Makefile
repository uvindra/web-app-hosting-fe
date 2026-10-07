.PHONY: build test vet check run-local setup-local integration gen-oc-client

build:
	go build ./...

vet:
	go vet ./...

test:
	go test ./...

check: build vet test

# Local OpenChoreo (k3d-openchoreo): one-time setup, then run the BFF.
setup-local:
	./dev/setup-local-openchoreo.sh

run-local:
	set -a; . ./dev/local.env; set +a; go run ./cmd/webapp-service --target openchoreo

# Opt-in end-to-end test against k3d-openchoreo (builds and deploys a sample; ~5-40 min).
integration:
	set -a; . ./dev/local.env; set +a; go test -tags=integration -count=1 -timeout 60m -v ./internal/integration/...

# Regenerate the OpenChoreo client (pinned to the version WSO2 Cloud runs).
OC_SPEC_VERSION ?= v1.2.5
gen-oc-client:
	curl -fsSL https://raw.githubusercontent.com/openchoreo/openchoreo/$(OC_SPEC_VERSION)/openapi/openchoreo-api.yaml -o /tmp/openchoreo-api.yaml
	go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.7.0 -config internal/openchoreo/gen/oapi-codegen.yaml /tmp/openchoreo-api.yaml
	go run github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.7.0 -config internal/openchoreo/gen/oapi-codegen-client.yaml /tmp/openchoreo-api.yaml
	gofmt -w internal/openchoreo/gen
