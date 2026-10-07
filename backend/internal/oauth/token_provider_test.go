package oauth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTokenProviderAuthMethods(t *testing.T) {
	for _, basic := range []bool{false, true} {
		var gotBasic, gotForm bool
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = r.ParseForm()
			u, pw, ok := r.BasicAuth()
			gotBasic = ok && u == "id" && pw == "s3cret"
			gotForm = r.PostForm.Get("client_id") == "id" && r.PostForm.Get("client_secret") == "s3cret"
			_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":3600}`))
		}))
		p := NewTokenProvider(srv.URL, "id", "s3cret", "").WithBasicAuth(basic)
		tok, err := p.Token()
		srv.Close()
		if err != nil || tok != "tok" {
			t.Fatalf("basic=%v: %v %q", basic, err, tok)
		}
		if gotBasic != basic || gotForm == basic {
			t.Fatalf("basic=%v: header=%v form=%v", basic, gotBasic, gotForm)
		}
		// Cached on the second call.
		if tok2, _ := p.Token(); tok2 != "tok" {
			t.Fatal("expected cached token")
		}
	}
}
