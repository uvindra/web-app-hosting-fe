package webapp

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/wso2/web-app-hosting/backend/internal/openchoreo/gen"
	"github.com/wso2/web-app-hosting/backend/internal/platform"
)

// Config kinds.
const (
	KindConfig = "config" // plain env vars
	KindSecret = "secret" // env vars from the secret store
	KindFile   = "file"   // a file mount (e.g. SPA config.js)
)

// configMeta is the BFF's bookkeeping for one config item, stored as JSON in
// the binding annotation AnnConfigs. Values live in the binding itself
// (workloadOverrides env/files) or, for secrets, in the secret store.
type configMeta struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Kind      string   `json:"kind"`
	Keys      []string `json:"keys"`
	MountPath string   `json:"mountPath,omitempty"`
	SecretRef string   `json:"secretRef,omitempty"`
	UpdatedAt string   `json:"updatedAt"`
}

var (
	envKeyRE    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]*$`)
	configIDRE  = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)
	fileNameRE  = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	spaWebRoot  = "/usr/share/nginx/html"
	maxFileSize = 512 * 1024
)

func readMeta(b gen.ReleaseBinding) []configMeta {
	var out []configMeta
	_ = json.Unmarshal([]byte(annotation(b.Metadata, AnnConfigs)), &out)
	return out
}

func writeMeta(b *gen.ReleaseBinding, metas []configMeta) {
	raw, _ := json.Marshal(metas)
	setAnnotation(&b.Metadata, AnnConfigs, string(raw))
}

func overrides(spec *gen.ReleaseBindingSpec) *gen.ContainerOverride {
	if spec.WorkloadOverrides == nil {
		spec.WorkloadOverrides = &gen.WorkloadOverrides{}
	}
	if spec.WorkloadOverrides.Container == nil {
		spec.WorkloadOverrides.Container = &gen.ContainerOverride{}
	}
	c := spec.WorkloadOverrides.Container
	if c.Env == nil {
		c.Env = &[]gen.EnvVar{}
	}
	if c.Files == nil {
		c.Files = &[]gen.FileVar{}
	}
	return c
}

// Configs lists an environment's configs, secrets (masked) and files.
func (s *Service) Configs(ctx context.Context, webAppID, trackID, env string) ([]ConfigItem, error) {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	return toConfigItems(*b), nil
}

func toConfigItems(b gen.ReleaseBinding) []ConfigItem {
	spec := b.Spec
	envs := map[string]string{}
	files := map[string]string{}
	if spec != nil && spec.WorkloadOverrides != nil && spec.WorkloadOverrides.Container != nil {
		c := spec.WorkloadOverrides.Container
		if c.Env != nil {
			for _, e := range *c.Env {
				if e.Value != nil {
					envs[e.Key] = *e.Value
				}
			}
		}
		if c.Files != nil {
			for _, f := range *c.Files {
				if f.Value != nil {
					files[path.Join(f.MountPath, f.Key)] = *f.Value
				}
			}
		}
	}
	out := []ConfigItem{}
	for _, m := range readMeta(b) {
		item := ConfigItem{ID: m.ID, Name: m.Name, Kind: m.Kind, MountPath: m.MountPath, UpdatedAt: m.UpdatedAt, Entries: []ConfigEntry{}}
		for _, k := range m.Keys {
			switch m.Kind {
			case KindSecret:
				item.Entries = append(item.Entries, ConfigEntry{Key: k, Value: "", Masked: true})
			case KindFile:
				item.Entries = append(item.Entries, ConfigEntry{Key: k, Value: files[path.Join(m.MountPath, k)]})
			default:
				item.Entries = append(item.Entries, ConfigEntry{Key: k, Value: envs[k]})
			}
		}
		out = append(out, item)
	}
	return out
}

// CreateConfig adds a config item to an environment.
func (s *Service) CreateConfig(ctx context.Context, webAppID, trackID, env string, w ConfigWrite) (*ConfigItem, error) {
	return s.writeConfig(ctx, webAppID, trackID, env, "", w)
}

// UpdateConfig replaces a config item.
func (s *Service) UpdateConfig(ctx context.Context, webAppID, trackID, env, id string, w ConfigWrite) (*ConfigItem, error) {
	return s.writeConfig(ctx, webAppID, trackID, env, id, w)
}

func validateWrite(t *track, w *ConfigWrite) error {
	w.Name = strings.TrimSpace(w.Name)
	if !configIDRE.MatchString(w.Name) || len(w.Name) > 40 {
		return errf(CodeBadRequest, "name must be lowercase letters, numbers and hyphens (max 40)")
	}
	if len(w.Entries) == 0 {
		return errf(CodeBadRequest, "at least one entry is required")
	}
	seen := map[string]bool{}
	for i, e := range w.Entries {
		e.Key = strings.TrimSpace(e.Key)
		w.Entries[i].Key = e.Key
		if seen[e.Key] {
			return errf(CodeBadRequest, "duplicate key %q", e.Key)
		}
		seen[e.Key] = true
		switch w.Kind {
		case KindConfig, KindSecret:
			if !envKeyRE.MatchString(e.Key) {
				return errf(CodeBadRequest, "invalid environment variable name %q", e.Key)
			}
		case KindFile:
			if !fileNameRE.MatchString(e.Key) {
				return errf(CodeBadRequest, "invalid file name %q", e.Key)
			}
			if len(e.Value) > maxFileSize {
				return errf(CodeBadRequest, "file %q is larger than %d KiB", e.Key, maxFileSize/1024)
			}
		default:
			return errf(CodeBadRequest, "unknown config kind %q", w.Kind)
		}
	}
	if w.Kind == KindFile {
		if len(w.Entries) != 1 {
			return errf(CodeBadRequest, "a file config holds exactly one file")
		}
		w.MountPath = strings.TrimSpace(w.MountPath)
		if w.MountPath == "" && t.Preset.IsSPA() {
			w.MountPath = spaWebRoot
		}
		if !strings.HasPrefix(w.MountPath, "/") || strings.Contains(w.MountPath, "..") {
			return errf(CodeBadRequest, "mount path must be an absolute directory")
		}
		w.MountPath = path.Clean(w.MountPath)
	} else {
		w.MountPath = ""
	}
	return nil
}

func (s *Service) writeConfig(ctx context.Context, webAppID, trackID, env, id string, w ConfigWrite) (*ConfigItem, error) {
	t, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return nil, err
	}
	if err := validateWrite(t, &w); err != nil {
		return nil, err
	}
	metas := readMeta(*b)
	var prev *configMeta
	for i := range metas {
		if metas[i].ID == id && id != "" {
			prev = &metas[i]
		}
		if metas[i].Name == w.Name && metas[i].ID != id {
			return nil, errf(CodeConflict, "a config or secret named %q already exists", w.Name)
		}
	}
	if id != "" && prev == nil {
		return nil, errf(CodeNotFound, "config %q not found", id)
	}
	if prev != nil && prev.Kind != w.Kind {
		return nil, errf(CodeBadRequest, "the kind of an existing config cannot change")
	}
	keys := make([]string, 0, len(w.Entries))
	for _, e := range w.Entries {
		keys = append(keys, e.Key)
	}
	if w.Kind != KindFile {
		for _, m := range metas {
			if (prev != nil && m.ID == prev.ID) || m.Kind == KindFile {
				continue
			}
			for _, k := range keys {
				if slices.Contains(m.Keys, k) {
					return nil, errf(CodeConflict, "key %q is already defined in %q", k, m.Name)
				}
			}
		}
	}

	meta := configMeta{ID: w.Name, Name: w.Name, Kind: w.Kind, Keys: keys, MountPath: w.MountPath, UpdatedAt: time.Now().UTC().Format(time.RFC3339)}
	if prev != nil {
		meta.ID, meta.SecretRef = prev.ID, prev.SecretRef
	}
	if w.Kind == KindSecret {
		data := map[string]string{}
		for _, e := range w.Entries {
			if e.Masked && e.Value == "" {
				if prev == nil || !slices.Contains(prev.Keys, e.Key) {
					return nil, errf(CodeBadRequest, "a value is required for new secret key %q", e.Key)
				}
				continue // keep the stored value
			}
			data[e.Key] = e.Value
		}
		if len(data) < len(keys) {
			// Keeping some stored values: the store needs the full key set, so
			// require all values on update when any is masked-and-kept and the
			// store cannot merge (secret-manager merges; OC Secret API replaces).
			data, err = s.mergeSecret(ctx, prev, keys, data)
			if err != nil {
				return nil, err
			}
		}
		ref, err := s.p.Secrets.Put(ctx, secretName(t.Name, env, w.Name), meta.SecretRef, keys, data)
		if err != nil {
			return nil, fmt.Errorf("store secret: %w", err)
		}
		meta.SecretRef = ref
	}

	updated, err := s.oc.MutateReleaseBinding(ctx, ns(ctx), b.Metadata.Name, func(rb *gen.ReleaseBinding) error {
		ms := readMeta(*rb)
		c := overrides(rb.Spec)
		if prev != nil {
			removeConfigValues(c, *prev)
			ms = slices.DeleteFunc(ms, func(m configMeta) bool { return m.ID == prev.ID })
		}
		addConfigValues(c, meta, w)
		ms = append(ms, meta)
		writeMeta(rb, ms)
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, it := range toConfigItems(*updated) {
		if it.ID == meta.ID {
			return &it, nil
		}
	}
	return nil, fmt.Errorf("config %q not found after write", meta.ID)
}

// mergeSecret fills masked (kept) keys. Stores cannot return values, so on
// update the BFF writes only the provided keys through a merging store, or
// fails clearly when it cannot.
func (s *Service) mergeSecret(_ context.Context, prev *configMeta, keys []string, data map[string]string) (map[string]string, error) {
	if _, ok := s.p.Secrets.(*platform.OCSecretStore); ok {
		missing := []string{}
		for _, k := range keys {
			if _, ok := data[k]; !ok {
				missing = append(missing, k)
			}
		}
		return nil, errf(CodeBadRequest, "re-enter the values of %s to update this secret", strings.Join(missing, ", "))
	}
	return data, nil
}

func secretName(component, env, name string) string {
	return Slug(fmt.Sprintf("%s-%s-%s", component, env, name), 63)
}

func removeConfigValues(c *gen.ContainerOverride, m configMeta) {
	if m.Kind == KindFile {
		files := slices.DeleteFunc(*c.Files, func(f gen.FileVar) bool { return f.MountPath == m.MountPath && slices.Contains(m.Keys, f.Key) })
		c.Files = &files
		return
	}
	env := slices.DeleteFunc(*c.Env, func(e gen.EnvVar) bool { return slices.Contains(m.Keys, e.Key) })
	c.Env = &env
}

func addConfigValues(c *gen.ContainerOverride, m configMeta, w ConfigWrite) {
	switch m.Kind {
	case KindFile:
		e := w.Entries[0]
		files := append(*c.Files, gen.FileVar{Key: e.Key, MountPath: m.MountPath, Value: ptr(e.Value)})
		c.Files = &files
	case KindSecret:
		env := *c.Env
		ref := platform.SecretReferenceName(m.SecretRef)
		for _, k := range m.Keys {
			v := gen.EnvVar{Key: k, ValueFrom: &gen.EnvVarValueFrom{}}
			v.ValueFrom.SecretKeyRef = &struct {
				Key  *string `json:"key,omitempty"`
				Name *string `json:"name,omitempty"`
			}{Key: ptr(k), Name: ptr(ref)}
			env = append(env, v)
		}
		c.Env = &env
	default:
		env := *c.Env
		for _, e := range w.Entries {
			env = append(env, gen.EnvVar{Key: e.Key, Value: ptr(e.Value)})
		}
		c.Env = &env
	}
}

// DeleteConfig removes a config item (and its stored secret).
func (s *Service) DeleteConfig(ctx context.Context, webAppID, trackID, env, id string) error {
	_, b, err := s.activeBinding(ctx, webAppID, trackID, env)
	if err != nil {
		return err
	}
	var target *configMeta
	for _, m := range readMeta(*b) {
		if m.ID == id {
			m := m
			target = &m
		}
	}
	if target == nil {
		return errf(CodeNotFound, "config %q not found", id)
	}
	if _, err := s.oc.MutateReleaseBinding(ctx, ns(ctx), b.Metadata.Name, func(rb *gen.ReleaseBinding) error {
		removeConfigValues(overrides(rb.Spec), *target)
		writeMeta(rb, slices.DeleteFunc(readMeta(*rb), func(m configMeta) bool { return m.ID == id }))
		return nil
	}); err != nil {
		return err
	}
	if target.Kind == KindSecret && target.SecretRef != "" {
		return s.p.Secrets.Delete(ctx, target.SecretRef)
	}
	return nil
}
