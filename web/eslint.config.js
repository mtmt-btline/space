// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// Google TypeScript Style Guide 寄りの主要ルールを適用する。
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Google style: single quote を優先
      quotes: ['error', 'single', { avoidEscape: true }],
      // Google style: 常にセミコロン
      semi: ['error', 'always'],
      // Google style: no-var
      'no-var': 'error',
      // コード可読性のため複数空行を制限
      'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 1 }],
      // 未使用変数はアンダースコア接頭辞を除外
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // WASM 境界での緩い型運用が必要な箇所があるため warning 扱い
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
