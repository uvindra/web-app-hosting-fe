package platform

import (
	"encoding/json"
	"testing"
)

func TestPlanFromSubscription(t *testing.T) {
	free := []string{"web-app-hosting-free"}
	cases := []struct {
		body, typ, name string
		trial           bool
	}{
		{`{}`, PlanFree, "Free", false},
		{`{"subscription":{"status":"active","plan":{"code":"web-app-hosting-free","name":"Free"}}}`, PlanFree, "Free", false},
		{`{"subscription":{"status":"active","plan":{"code":"web-app-hosting-payg","name":"Pay As You Go"}}}`, PlanPaid, "Pay As You Go", false},
		{`{"subscription":{"status":"trial","plan":{"code":"web-app-hosting-payg","name":"Pay As You Go"},"trial":{"days_remaining":12}}}`, PlanPaid, "Pay As You Go", true},
		{`{"subscription":{"status":"past_due","plan":{"code":"web-app-hosting-payg","name":"Pay As You Go"}}}`, PlanFree, "Pay As You Go", false},
		{`{"subscription":{"status":"cancelled","plan":{"code":"web-app-hosting-enterprise","name":"Enterprise"}}}`, PlanFree, "Enterprise", false},
	}
	for _, c := range cases {
		var org billingOrg
		if err := json.Unmarshal([]byte(c.body), &org); err != nil {
			t.Fatal(err)
		}
		p := planFromSubscription(org, free)
		if p.Type != c.typ || p.Name != c.name || (p.TrialDaysRemaining != nil) != c.trial {
			t.Errorf("%s: got %+v", c.body, p)
		}
	}
}
