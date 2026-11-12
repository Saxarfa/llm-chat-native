import {defineConfig,mergeConfig} from 'vitest/config';
import viteConfig from './vite.config.ts';

// Most CSS is irrelevant to node tests. The raw duration sheet is also JS data,
// so keep its real contents instead of Vitest's default empty CSS stub.
export default mergeConfig(viteConfig,defineConfig({test:{css:{include:[/motionTokens\.css(?:\?|$)/]}}}));
