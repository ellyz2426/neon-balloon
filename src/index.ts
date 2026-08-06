import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GameSystem } from './systems/GameSystem.js';
import { UISystem } from './systems/UISystem.js';
import { AudioSystem } from './systems/AudioSystem.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(GameSystem);
  world.registerSystem(AudioSystem);
  world.registerSystem(UISystem);
});
