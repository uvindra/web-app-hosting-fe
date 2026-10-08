/** The image of an image-sourced web app (sourceType `docker`): a public image, redeployed by tag. */
export interface ImageSource {
  /** Registry and repository, without the tag. */
  image: string;
  tag: string;
  port: number;
}
