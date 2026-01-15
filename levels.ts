import { Level } from './types';
import { level1 } from './levels/level1';
import { level2 } from './levels/level2';
import { level3 } from './levels/level3';
import { level4 } from './levels/level4';
import { level5 } from './levels/level5';
import { level6 } from './levels/level6';
import { level7 } from './levels/level7';
import { level8 } from './levels/level8';

// Phase 1: Basic tool calling
export const PHASE1_LEVELS: Level[] = [level1, level2];

// Phase 2: Desktop & VM control
export const PHASE2_LEVELS: Level[] = [level3, level4, level5];

// Phase 3: Advanced capabilities
export const PHASE3_LEVELS: Level[] = [level6, level7];
// level8 (Prompt Injection) hidden for now

// Legacy exports for backward compatibility
export const LEVELS = PHASE1_LEVELS;
export const ADVANCED_LEVELS = PHASE2_LEVELS;