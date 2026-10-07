# Web App Hosting BFF (webapp-service)
FROM golang:1.26-alpine AS builder
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -buildvcs=false -o webapp-service ./cmd/webapp-service

FROM alpine:3.20
RUN addgroup -g 10001 app && adduser -D -u 10001 -G app app && apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /workspace/webapp-service .
USER 10001
EXPOSE 9090
ENTRYPOINT ["./webapp-service"]
