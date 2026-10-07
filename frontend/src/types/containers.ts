export type ImagePullPolicy = 'Always' | 'IfNotPresent';

export interface ContainerPort {
  protocol: 'TCP' | 'UDP';
  port: number;
}

export interface WebAppContainer {
  id: string;
  name: string;
  image: string;
  imagePullPolicy: ImagePullPolicy;
  ports: ContainerPort[];
  /** CPU in millicores. */
  cpuRequest: number;
  cpuLimit: number;
  /** Memory in MiB. */
  memoryRequest: number;
  memoryLimit: number;
  command: string[];
  args: string[];
  updatedAt: string;
}

export type ContainerUpdate = Pick<WebAppContainer, 'imagePullPolicy' | 'cpuRequest' | 'cpuLimit' | 'memoryRequest' | 'memoryLimit' | 'command' | 'args'>;
