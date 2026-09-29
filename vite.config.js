import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 빌드 결과물은 dist/index.html 한 파일(모든 JS/CSS 인라인)이라 어디든 올리면 바로 실행돼요.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', chunkSizeWarningLimit: 4000 },
});
