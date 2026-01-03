import { Level } from './types';
import { level1 } from './levels/level1';
import { level2 } from './levels/level2';
import { level3 } from './levels/level3';
import { level4 } from './levels/level4';
import { level5 } from './levels/level5';
import { level6 } from './levels/level6';
import { level7 } from './levels/level7';
import { level8 } from './levels/level8';

// Re-export v86Service for backward compatibility with SimulationView, though likely unused if updated.
export { v86Service } from './services/v86Service';

export const LEVELS: Level[] = [level1, level2, level3];
export const ADVANCED_LEVELS: Level[] = [level4, level5, level6, level7, level8];