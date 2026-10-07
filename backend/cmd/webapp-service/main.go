// Command webapp-service is the WSO2 Web App Hosting BFF.
//
//	go run ./cmd/webapp-service --target openchoreo   # local k3d (see README)
//	go run ./cmd/webapp-service                       # TARGET env, default wso2cloud
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/app"
	"github.com/wso2/web-app-hosting/backend/internal/config"
)

func main() {
	target := flag.String("target", "", "wso2cloud | openchoreo (overrides TARGET)")
	flag.Parse()
	if err := run(*target); err != nil {
		slog.Error("webapp-service failed", "error", err)
		os.Exit(1)
	}
}

func run(target string) error {
	cfg, err := config.Load(target)
	if err != nil {
		return err
	}
	setupLogging(cfg.LogLevel)

	srv, err := app.Build(cfg)
	if err != nil {
		return err
	}
	httpSrv := &http.Server{Addr: fmt.Sprintf(":%d", cfg.Port), Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("webapp-service listening", "port", cfg.Port, "target", cfg.Target, "authMode", cfg.AuthMode, "basePath", cfg.BasePath)
		errCh <- httpSrv.ListenAndServe()
	}()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-sig:
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return httpSrv.Shutdown(ctx)
	}
	return nil
}

func setupLogging(level string) {
	var l slog.Level
	switch strings.ToLower(level) {
	case "debug":
		l = slog.LevelDebug
	case "warn":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l})))
}
