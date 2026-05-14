/**
 * Phase 5 以降のコアモジュールを main バンドルに含めるためのサイドエフェクト import。
 * IPC から本番利用するまで、ここが主要な参照元となる。
 */
import './core/JobRegistry.js';
import './core/SecretScanner.js';
import './core/VolumeExporter.js';
import './core/ComposeExporter.js';
import './core/ComposeImporter.js';
import './core/tar/SystemTarBackend.js';
import './core/tar/TarStreamBackend.js';
import './core/tar/selectTarBackend.js';
import './core/SpaceChecker.js';
import './core/SizeEstimator.js';
import './core/ErrorReporter.js';
import './core/ProgressTracker.js';

// Phase 6: 型・永続化層をバンドルに含める（未参照でも tree-shake されないように）
import './core/snapshot/SnapshotStore.js';
import './core/manifest/ManifestV11.js';
import './core/snapshot/Snapshotter.js';
import './core/diff/DiffEngine.js';
import './core/diff/DiffPreview.js';
