package webapp

import (
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// TestRuntimeLogsPagingIsComplete: "load more" returns every line exactly
// once, in order, when many lines share a (second-precision) timestamp —
// including identical repeated lines — for both sort orders and both
// upstream window semantics.
func TestRuntimeLogsPagingIsComplete(t *testing.T) {
	base := time.Now().UTC().Truncate(time.Second).Add(-10 * time.Minute)
	var entries []platform.LogEntry // newest first
	for sec := 6; sec >= 0; sec-- {
		n := 37
		if sec == 3 {
			n = 120 // more lines in one second than a page holds
		}
		for i := n - 1; i >= 0; i-- {
			msg := fmt.Sprintf("s%d line %d", sec, i)
			if sec == 5 && i < 4 {
				msg = "same line" // identical lines at the same timestamp
			}
			entries = append(entries, platform.LogEntry{Timestamp: base.Add(time.Duration(sec) * time.Second), Log: msg, Pod: "p1"})
		}
	}
	for _, inclusive := range []bool{false, true} {
		for _, sort := range []string{"desc", "asc"} {
			t.Run(fmt.Sprintf("inclusive=%v/%s", inclusive, sort), func(t *testing.T) {
				e := newTestEnv(t)
				e.addTrack("site", "site", "main", true)
				e.logs.entries, e.logs.inclusive = entries, inclusive
				want := slices.Clone(entries)
				if sort == "asc" {
					slices.Reverse(want)
				}
				req := LogsRequest{Environment: "development", Sort: sort, Limit: 25,
					StartTime: base.Add(-time.Minute).Format(time.RFC3339), EndTime: base.Add(time.Minute).Format(time.RFC3339)}
				var got []string
				ids := map[string]bool{}
				for page := 0; ; page++ {
					if page > 100 {
						t.Fatal("paging does not terminate")
					}
					p, err := e.svc.RuntimeLogs(e.ctx, "site", "site", req)
					if err != nil {
						t.Fatal(err)
					}
					for _, r := range p.Items {
						got = append(got, r.LogLine)
						if ids[r.ID] {
							t.Fatalf("duplicate row id %s (%s)", r.ID, r.LogLine)
						}
						ids[r.ID] = true
					}
					if p.NextCursor == "" {
						break
					}
					req.Cursor = p.NextCursor
				}
				wantLines := make([]string, len(want))
				for i, w := range want {
					wantLines[i] = w.Log
				}
				if !slices.Equal(got, wantLines) {
					t.Fatalf("got %d lines, want %d\ngot:  %v\nwant: %v", len(got), len(wantLines), got, wantLines)
				}
			})
		}
	}
}
