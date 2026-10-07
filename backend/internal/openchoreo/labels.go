// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.
// Adapted from App Factory internal/clients/openchoreo/resource_labels.go (see doc.go).

package openchoreo

import (
	"fmt"
	"maps"
	"regexp"
	"strings"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
)

// resourceLabels are stamped on every write (Config.ResourceLabels). WSO2
// Cloud's platform API stamps the product label on user-token writes but not
// on impersonated service writes, and its build workflows refuse to render a
// WorkflowRun without it (D10) — so the BFF stamps it itself, always.
// A configured label wins over one the write set itself.
type resourceLabels map[string]string

func newResourceLabels(labels map[string]string) resourceLabels {
	if len(labels) == 0 {
		return nil
	}
	return resourceLabels(maps.Clone(labels))
}

func (l resourceLabels) stamp(meta *gen.ObjectMeta) {
	if len(l) == 0 {
		return
	}
	if meta.Labels == nil {
		meta.Labels = &map[string]string{}
	}
	maps.Copy(*meta.Labels, l)
}

// stampedObject returns a copy of an untyped object body with the labels set.
func (l resourceLabels) stampedObject(body map[string]any) map[string]any {
	out := maps.Clone(body)
	if out == nil {
		out = map[string]any{}
	}
	if len(l) == 0 {
		return out
	}
	meta, _ := out["metadata"].(map[string]any)
	meta = maps.Clone(meta)
	if meta == nil {
		meta = map[string]any{}
	}
	labels, _ := meta["labels"].(map[string]any)
	labels = maps.Clone(labels)
	if labels == nil {
		labels = map[string]any{}
	}
	for k, v := range l {
		labels[k] = v
	}
	meta["labels"] = labels
	out["metadata"] = meta
	return out
}

var (
	labelNameRE   = regexp.MustCompile(`^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$`)
	labelPrefixRE = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$`)
)

// ValidateResourceLabels refuses labels the Kubernetes API server would reject.
func ValidateResourceLabels(labels map[string]string) error {
	for key, value := range labels {
		prefix, name, hasPrefix := strings.Cut(key, "/")
		if !hasPrefix {
			name, prefix = prefix, ""
		}
		if hasPrefix && (prefix == "" || len(prefix) > 253 || !labelPrefixRE.MatchString(prefix)) {
			return fmt.Errorf("resource label key %q: invalid prefix", key)
		}
		if len(name) == 0 || len(name) > 63 || !labelNameRE.MatchString(name) {
			return fmt.Errorf("resource label key %q: invalid name", key)
		}
		if value != "" && (len(value) > 63 || !labelNameRE.MatchString(value)) {
			return fmt.Errorf("resource label %q: invalid value %q", key, value)
		}
	}
	return nil
}
