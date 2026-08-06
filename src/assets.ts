import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'menu-panel': {
    url: publicAssetUrl('ui/menu.uikitml'),
    type: AssetType.UIKitML,
    name: 'Menu Panel',
  },
  'hud-panel': {
    url: publicAssetUrl('ui/hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Panel',
  },
  'pause-panel': {
    url: publicAssetUrl('ui/pause.uikitml'),
    type: AssetType.UIKitML,
    name: 'Pause Panel',
  },
  'results-panel': {
    url: publicAssetUrl('ui/results.uikitml'),
    type: AssetType.UIKitML,
    name: 'Results Panel',
  },
  'settings-panel': {
    url: publicAssetUrl('ui/settings.uikitml'),
    type: AssetType.UIKitML,
    name: 'Settings Panel',
  },
  'stats-panel': {
    url: publicAssetUrl('ui/stats.uikitml'),
    type: AssetType.UIKitML,
    name: 'Stats Panel',
  },
});
