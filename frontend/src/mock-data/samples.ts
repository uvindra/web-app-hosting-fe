import type { Sample } from '../types/sample';

// Each sample is a directory of wso2/choreo-samples (checked to exist on `main`); the build settings match the
// sample's own package.json / angular.json / Dockerfile (all build with Node 18).
export const MOCK_SAMPLES: Sample[] = [
  {
    id: 'sample-react-spa',
    name: 'React SPA',
    framework: 'Web App (React)',
    description: 'Simple React Single Page Application',
    repoUrl: 'https://github.com/wso2/choreo-samples/tree/main/react-single-page-app',
    branch: 'main',
    componentDirectory: '/react-single-page-app',
    buildPreset: 'react',
    buildCommand: 'npm run build',
    buildPath: '/build',
    nodeVersion: '18',
    port: 8080,
  },
  {
    id: 'sample-vue-spa',
    name: 'Vue SPA',
    framework: 'Web App (Vue)',
    description: 'Simple Vue Single Page Application',
    repoUrl: 'https://github.com/wso2/choreo-samples/tree/main/vue-single-page-application',
    branch: 'main',
    componentDirectory: '/vue-single-page-application',
    buildPreset: 'vuejs',
    buildCommand: 'npm run build',
    buildPath: '/dist',
    nodeVersion: '18',
    port: 8080,
  },
  {
    id: 'sample-angular-spa',
    name: 'Angular SPA',
    framework: 'Web App (Angular)',
    description: 'Simple Angular Single Page Application',
    repoUrl: 'https://github.com/wso2/choreo-samples/tree/main/angular-single-page-app',
    branch: 'main',
    componentDirectory: '/angular-single-page-app',
    buildPreset: 'angular',
    buildCommand: 'npm run build',
    // angular.json: "outputPath": "dist/angular-spa"
    buildPath: '/dist/angular-spa',
    nodeVersion: '18',
    port: 8080,
  },
  {
    id: 'sample-hello-world-go',
    name: 'Hello World Go',
    framework: 'Web App (Go)',
    description: 'A Hello World web app in Go',
    repoUrl: 'https://github.com/wso2/choreo-samples/tree/main/hello-world-go-webapp',
    branch: 'main',
    componentDirectory: '/hello-world-go-webapp',
    // Built by the Go buildpack (no build command); main.go listens on :8080.
    buildPreset: 'go',
    port: 8080,
  },
];
