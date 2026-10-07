/** One environment of a project's deployment pipeline, in promotion order. */
export interface Environment {
  id: string;
  name: string;
  isProduction: boolean;
}
