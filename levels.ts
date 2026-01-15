import { Level } from './types';
import { level1 } from './levels/level1';
import { level2 } from './levels/level2';
import { level3 } from './levels/level3';
import { level4 } from './levels/level4';
import { level5 } from './levels/level5';
import { level6 } from './levels/level6';
import { level7 } from './levels/level7';
import { level8 } from './levels/level8';

export const LEVELS: Level[] = [level1, level2];
export const ADVANCED_LEVELS: Level[] = [level3, level4, level5, level6, level7];
// level8 (Prompt Injection) hidden for now