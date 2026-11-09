import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true, // Enable global test APIs (describe, it, expect, etc.)
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}', '.agents/scripts/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.d.ts',
                'src/main.ts', // Exclude the MCP server entry point
                'src/**/*.test.ts',
                'src/**/*.spec.ts',
            ],
            reporter: ['text', 'json', 'html'],
        },
    },
})
