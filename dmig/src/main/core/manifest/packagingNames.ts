/**
 * パッケージ内のファイル名・ディレクトリ名に使う安全化（既存 Exporter / VolumeExporter / ComposeExporter と一致させる）。
 */

export function safeImageFileStem(imageName: string): string {
  return imageName.replace(/[/:]/g, '_');
}

export function safeVolumeFileStem(volumeName: string): string {
  return volumeName.replace(/[/:\\]/g, '_');
}

export function safeComposeProjectDirName(name: string): string {
  return name.replace(/[/\\:<>|?*"]+/g, '_').replace(/^_+|_+$/g, '');
}
