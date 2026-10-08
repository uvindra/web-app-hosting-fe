package webapp

import (
	"sync"
	"time"
)

// ttlCache is a small, process-local cache for upstream reads that change
// rarely (environments, deployment pipelines). Values must be treated as
// read-only by callers.
type ttlCache[V any] struct {
	ttl time.Duration
	now func() time.Time

	mu sync.Mutex
	m  map[string]ttlEntry[V]
}

type ttlEntry[V any] struct {
	v       V
	expires time.Time
}

func newTTLCache[V any](ttl time.Duration) *ttlCache[V] {
	return &ttlCache[V]{ttl: ttl, now: time.Now, m: map[string]ttlEntry[V]{}}
}

func (c *ttlCache[V]) get(key string) (V, bool) {
	var zero V
	if c == nil || c.ttl <= 0 {
		return zero, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok || !c.now().Before(e.expires) {
		return zero, false
	}
	return e.v, true
}

func (c *ttlCache[V]) set(key string, v V) {
	if c == nil || c.ttl <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	for k, e := range c.m {
		if !now.Before(e.expires) {
			delete(c.m, k)
		}
	}
	c.m[key] = ttlEntry[V]{v: v, expires: now.Add(c.ttl)}
}
