package webapp

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseCPU parses a Kubernetes CPU quantity ("100m", "0.5", "1") to millicores.
func ParseCPU(q string) int64 {
	q = strings.TrimSpace(q)
	if q == "" {
		return 0
	}
	if strings.HasSuffix(q, "m") {
		v, _ := strconv.ParseFloat(strings.TrimSuffix(q, "m"), 64)
		return int64(v)
	}
	v, _ := strconv.ParseFloat(q, 64)
	return int64(v * 1000)
}

var memUnits = []struct {
	suffix string
	mult   float64
}{
	{"Ki", 1 << 10}, {"Mi", 1 << 20}, {"Gi", 1 << 30}, {"Ti", 1 << 40},
	{"k", 1e3}, {"K", 1e3}, {"M", 1e6}, {"G", 1e9}, {"T", 1e12},
}

// ParseMemory parses a Kubernetes memory quantity to bytes.
func ParseMemory(q string) int64 {
	q = strings.TrimSpace(q)
	for _, u := range memUnits {
		if strings.HasSuffix(q, u.suffix) {
			v, _ := strconv.ParseFloat(strings.TrimSuffix(q, u.suffix), 64)
			return int64(v * u.mult)
		}
	}
	v, _ := strconv.ParseFloat(q, 64)
	return int64(v)
}

// FormatCPU renders millicores as a quantity.
func FormatCPU(m int64) string { return fmt.Sprintf("%dm", m) }

// FormatMemoryMi renders MiB as a quantity.
func FormatMemoryMi(mi int64) string { return fmt.Sprintf("%dMi", mi) }

func fmtSscanf(s string, ready, total *int) (int, error) { return fmt.Sscanf(s, "%d/%d", ready, total) }
