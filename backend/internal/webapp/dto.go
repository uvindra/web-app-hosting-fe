package webapp

// DTOs: JSON shapes match frontend/src/types/*.ts (the stubs are the contract).

type Project struct {
	ID                string `json:"id"`
	Handler           string `json:"handler"`
	Name              string `json:"name"`
	Description       string `json:"description,omitempty"`
	UpdatedAt         string `json:"updatedAt"`
	ActiveWebAppCount int    `json:"activeWebAppCount"`
	Status            string `json:"status"`
}

type CreateProjectInput struct {
	Name        string `json:"name"`
	Handler     string `json:"handler"`
	Description string `json:"description,omitempty"`
}

// Environment is one pipeline environment, in promotion order.
type Environment struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	IsProduction bool   `json:"isProduction"`
}

type Commit struct {
	SHA         string `json:"sha"`
	Message     string `json:"message"`
	Author      string `json:"author"`
	CommittedAt string `json:"committedAt"`
}

type WebApp struct {
	ID           string  `json:"id"`
	Handler      string  `json:"handler"`
	DisplayName  string  `json:"displayName"`
	Description  string  `json:"description,omitempty"`
	Framework    string  `json:"framework"`
	BuildPreset  string  `json:"buildPreset"`
	URL          string  `json:"url,omitempty"`
	Status       string  `json:"status"`
	UpdatedAt    string  `json:"updatedAt"`
	SourceType   string  `json:"sourceType"`
	RepoURL      string  `json:"repoUrl,omitempty"`
	ProjectID    string  `json:"projectId"`
	DefaultTrack string  `json:"defaultTrackId"`
	LatestCommit *Commit `json:"latestCommit,omitempty"`
}

type CreateWebAppInput struct {
	SourceType         string `json:"sourceType"` // github | public-git
	GitOrganization    string `json:"gitOrganization,omitempty"`
	Repository         string `json:"repository"`
	InstallationID     int64  `json:"installationId,omitempty"`
	Branch             string `json:"branch"`
	ComponentDirectory string `json:"componentDirectory"`
	DisplayName        string `json:"displayName"`
	Handler            string `json:"handler"`
	Description        string `json:"description,omitempty"`
	BuildPreset        string `json:"buildPreset"`
	BuildCommand       string `json:"buildCommand"`
	BuildPath          string `json:"buildPath"`
	NodeVersion        string `json:"nodeVersion,omitempty"`
	Port               int    `json:"port"`
	// Docker is the Dockerfile build (preset docker only).
	Docker *DockerBuild `json:"docker,omitempty"`
}

// DockerBuild locates the Dockerfile and build context, both relative to the
// component directory (defaults: "Dockerfile" and "." = the component
// directory itself), on create and in BuildConfig alike. The workflow stores
// them from the repository root.
type DockerBuild struct {
	FilePath string `json:"filePath,omitempty"`
	Context  string `json:"context,omitempty"`
}

type DeploymentTrack struct {
	ID         string `json:"id"`
	Branch     string `json:"branch"`
	IsDefault  bool   `json:"isDefault"`
	AutoDeploy bool   `json:"autoDeploy"`
	Deployed   bool   `json:"deployed"`
	CreatedAt  string `json:"createdAt"`
}

type TrackDeletableResult struct {
	CanDelete bool   `json:"canDelete"`
	Message   string `json:"message,omitempty"`
}

type BuildStep struct {
	Name   string   `json:"name"`
	Status string   `json:"status"` // success | failed | in-progress | pending
	Logs   []string `json:"logs"`
}

type BuildRun struct {
	ID            string      `json:"id"`
	Status        string      `json:"status"` // success | failed | in-progress
	CommitSHA     string      `json:"commitSha"`
	CommitMessage string      `json:"commitMessage"`
	Author        string      `json:"author"`
	Branch        string      `json:"branch"`
	TriggeredAt   string      `json:"triggeredAt"`
	CompletedAt   string      `json:"completedAt,omitempty"`
	Steps         []BuildStep `json:"steps"`
}

type BuildConfig struct {
	RepoURL            string `json:"repoUrl"`
	Branch             string `json:"branch"`
	ComponentDirectory string `json:"componentDirectory"`
	BuildPreset        string `json:"buildPreset"`
	BuildCommand       string `json:"buildCommand"`
	BuildPath          string `json:"buildPath"`
	NodeVersion        string `json:"nodeVersion,omitempty"`
	Port               int    `json:"port"`
	// Docker is set for the docker preset (paths relative to ComponentDirectory).
	Docker *DockerBuild `json:"docker,omitempty"`
}

type LatestCommit struct {
	SHA         string `json:"sha"`
	Message     string `json:"message"`
	Author      string `json:"author"`
	CommittedAt string `json:"committedAt"`
	Branch      string `json:"branch"`
	RepoURL     string `json:"repoUrl"`
}

type TriggerBuildInput struct {
	CommitSHA string `json:"sha,omitempty"`
}

type EnvironmentDeployment struct {
	Environment string `json:"environment"`
	Deployed    bool   `json:"deployed"`
	Status      string `json:"status,omitempty"` // WebAppStatus
}

type Deployment struct {
	ID            string `json:"id"`
	Environment   string `json:"environment"`
	BuildID       string `json:"buildId"`
	CommitSHA     string `json:"commitSha"`
	CommitMessage string `json:"commitMessage"`
	Status        string `json:"status"` // deploying | active | failed | stopped
	DeployedAt    string `json:"deployedAt"`
	URL           string `json:"url"`
}

type DeployBuildInput struct {
	Environment string `json:"environment"`
	Build       struct {
		ID string `json:"id"`
	} `json:"build"`
}

type PromoteInput struct {
	SourceEnvironment string `json:"sourceEnvironment"`
	TargetEnvironment string `json:"targetEnvironment"`
}

type ReleaseDetails struct {
	Status        string `json:"status"` // Running | Deploying | Failed
	Image         string `json:"image"`
	CommitSHA     string `json:"commitSha"`
	CommitMessage string `json:"commitMessage"`
	DeployedAt    string `json:"deployedAt"`
	Port          int    `json:"port"`
}

type PodCondition struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	LastTransitionTime string `json:"lastTransitionTime"`
}

type Pod struct {
	Name      string `json:"name"`
	Phase     string `json:"phase"`
	Ready     string `json:"ready"`
	Restarts  int    `json:"restarts"`
	StartedAt string `json:"startedAt"`
	// CPUUsageMillicores / MemoryUsageBytes are absent until usage metrics
	// exist (P1); nil means "not available", never 0.
	CPUUsageMillicores   *int64         `json:"cpuUsageMillicores,omitempty"`
	CPURequestMillicores int64          `json:"cpuRequestMillicores"`
	CPULimitMillicores   int64          `json:"cpuLimitMillicores"`
	MemoryUsageBytes     *int64         `json:"memoryUsageBytes,omitempty"`
	MemoryRequestBytes   int64          `json:"memoryRequestBytes"`
	MemoryLimitBytes     int64          `json:"memoryLimitBytes"`
	Conditions           []PodCondition `json:"conditions"`
}

type PodEvent struct {
	Type     string `json:"type"`
	Reason   string `json:"reason"`
	Message  string `json:"message"`
	Count    int    `json:"count"`
	LastSeen string `json:"lastSeen"`
}

type ContainerPort struct {
	Protocol string `json:"protocol"`
	Port     int    `json:"port"`
}

type Container struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	Image           string          `json:"image"`
	ImagePullPolicy string          `json:"imagePullPolicy"`
	Ports           []ContainerPort `json:"ports"`
	CPURequest      int64           `json:"cpuRequest"`
	CPULimit        int64           `json:"cpuLimit"`
	MemoryRequest   int64           `json:"memoryRequest"`
	MemoryLimit     int64           `json:"memoryLimit"`
	Command         []string        `json:"command"`
	Args            []string        `json:"args"`
	UpdatedAt       string          `json:"updatedAt"`
}

type ContainerUpdate struct {
	ImagePullPolicy string   `json:"imagePullPolicy"`
	CPURequest      int64    `json:"cpuRequest"`
	CPULimit        int64    `json:"cpuLimit"`
	MemoryRequest   int64    `json:"memoryRequest"`
	MemoryLimit     int64    `json:"memoryLimit"`
	Command         []string `json:"command"`
	Args            []string `json:"args"`
}

type HPASettings struct {
	MinReplicas       int  `json:"minReplicas"`
	MaxReplicas       int  `json:"maxReplicas"`
	CPUUtilization    *int `json:"cpuUtilization,omitempty"`
	MemoryUtilization *int `json:"memoryUtilization,omitempty"`
}

type ScalingConfig struct {
	Method        string      `json:"method"` // HPA | None (P0: None only)
	HPA           HPASettings `json:"hpa"`
	FixedReplicas int         `json:"fixedReplicas"`
}

type ReplicaPod struct {
	Name            string `json:"name"`
	Status          string `json:"status"`
	ReadyContainers int    `json:"readyContainers"`
	TotalContainers int    `json:"totalContainers"`
	Restarts        int    `json:"restarts"`
	// CPUUsage / MemoryUsageMb are absent until usage metrics exist (P1).
	CPUUsage      *float64 `json:"cpuUsage,omitempty"`
	MemoryUsageMb *float64 `json:"memoryUsageMb,omitempty"`
	StartedAt     string   `json:"startedAt"`
}

type ConfigEntry struct {
	Key    string `json:"key"`
	Value  string `json:"value"`
	Masked bool   `json:"masked,omitempty"`
}

type ConfigItem struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Kind      string        `json:"kind"` // config | secret | file
	MountPath string        `json:"mountPath,omitempty"`
	Entries   []ConfigEntry `json:"entries"`
	UpdatedAt string        `json:"updatedAt"`
}

type ConfigWrite struct {
	Name      string        `json:"name"`
	Kind      string        `json:"kind"`
	MountPath string        `json:"mountPath,omitempty"`
	Entries   []ConfigEntry `json:"entries"`
}

type LogRow struct {
	ID            string `json:"id"`
	Timestamp     string `json:"timestamp"`
	Level         string `json:"level"`
	LogLine       string `json:"logLine"`
	Source        string `json:"source"` // access | app
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName"`
	Method        string `json:"method,omitempty"`
	Path          string `json:"path,omitempty"`
	StatusCode    int    `json:"statusCode,omitempty"`
}

type LogsRequest struct {
	Environment  string   `json:"environment"`
	Levels       []string `json:"levels"`
	StartTime    string   `json:"startTime"`
	EndTime      string   `json:"endTime"`
	SearchPhrase string   `json:"searchPhrase"`
	Sort         string   `json:"sort"`
	Limit        int      `json:"limit"`
	Cursor       string   `json:"cursor,omitempty"`
}

type LogsPage struct {
	Items      []LogRow `json:"items"`
	NextCursor string   `json:"nextCursor,omitempty"`
}

type EnvironmentDefaultURL struct {
	Environment string `json:"environment"`
	URL         string `json:"url"`
}

// Meta describes the running target for the console.
type Meta struct {
	Target         string `json:"target"`
	GitHubApp      bool   `json:"gitHubApp"`
	BillingEnabled bool   `json:"billingEnabled"`
	OrgHandle      string `json:"orgHandle"`
	Namespace      string `json:"namespace"`
}
