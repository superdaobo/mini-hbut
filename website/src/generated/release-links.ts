export type ReleaseLinks = {
  windowsExe?: string;
  windowsMsi?: string;
  macDmg?: string;
  androidApk?: string;
  iosIpa?: string;
  linuxAppImage?: string;
  linuxDeb?: string;
};

export const GENERATED_RELEASE_LINKS = {
  version: '',
  tag: '',
  source: 'runtime-only',
  generatedAt: '',
  links: {},
} as const;

export default GENERATED_RELEASE_LINKS;
